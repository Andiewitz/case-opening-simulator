# GitHub Actions → AWS without long-lived keys (docs/plan.md CI2).
#
# Set `github_repository = "owner/repo"` to create the OIDC provider and the
# deploy role; leave it empty (the default) and nothing here is created, so an
# account without GitHub deploys keeps working.
#
# The deploy workflow assumes `aws_github_deploy_role_arn` and is trusted only
# for the default branch and the `production` environment.

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, e.g. owner/cs2-unboxed (empty disables)"
  type        = string
  default     = ""
}

locals {
  github_oidc_enabled = var.github_repository != ""
}

resource "aws_iam_openid_connect_provider" "github" {
  count = local.github_oidc_enabled ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "github_deploy_assume" {
  count = local.github_oidc_enabled ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github[0].arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # main branch pushes and the protected production environment only.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:environment:production",
      ]
    }
  }
}

data "aws_iam_policy_document" "github_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  # Everything Terraform manages for this app. IAM is scoped to app-prefixed
  # names so a compromised workflow cannot rewrite unrelated roles.
  statement {
    sid    = "ManageAppResources"
    effect = "Allow"
    actions = [
      "amplify:*",
      "apigateway:*",
      "cloudfront:*",
      "cloudwatch:DeleteAlarms",
      "cloudwatch:DescribeAlarms",
      # Terraform refreshes tags on every managed alarm; without this the plan
      # dies with AccessDenied even though the alarms themselves are readable.
      "cloudwatch:ListTagsForResource",
      "cloudwatch:PutMetricAlarm",
      "cognito-idp:*",
      "dynamodb:*",
      "lambda:*",
      "logs:*",
      "s3:*",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ManageAppIam"
    effect = "Allow"
    actions = [
      "iam:AttachRolePolicy",
      "iam:CreatePolicy",
      "iam:CreateRole",
      "iam:DeletePolicy",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      # Tag refreshes on the role and the OIDC provider need these two.
      "iam:ListOpenIDConnectProviderTags",
      "iam:ListPolicyVersions",
      "iam:ListRolePolicies",
      "iam:ListRoleTags",
      "iam:PassRole",
      "iam:PutRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = [
      "arn:aws:iam::*:role/${var.app_name}-*",
      "arn:aws:iam::*:policy/${var.app_name}-*",
    ]
  }

  # IAM rejects a scoped resource for the Create*/Delete* OIDC provider actions.
  statement {
    sid    = "ManageGithubOidcProvider"
    effect = "Allow"
    actions = [
      "iam:CreateOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider",
      "iam:GetOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:TagOpenIDConnectProvider",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "github_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  name               = "${var.app_name}-github-deploy-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume[0].json

  tags = {
    Name        = "${var.app_name}-github-deploy"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  name   = "${var.app_name}-github-deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy[0].json
}
