# CloudFront (optional) — Amplify is the frontend of record

**Status: fully operational without CloudFront.** The frontend is served by
AWS Amplify Hosting with a free, AWS-managed TLS certificate:

- Live URL: https://main.d2mrjtz68yn4c6.amplifyapp.com
- Infrastructure: `terraform/amplify.tf` (app + branch + rewrite rules —
  the app itself is Terraform-managed; deploys are manual zip uploads)

## The CloudFront switch

`terraform/s3.tf` still contains the CloudFront distribution for the S3
origin, gated behind a variable:

```hcl
# terraform.tfvars
enable_cloudfront = false
```

With `false` (current), full `terraform apply` works cleanly and the S3
bucket serves nothing publicly except the interim website mode.

**CloudFront creation is blocked by an AWS account-level gate:**

```
AccessDenied: Your account must be verified before you can add new CloudFront
resources. To verify your account, please contact AWS Support
(https://console.aws.amazon.com/support/home#/) and include this error message.
```

Only the account root user can file the unblock request — and it is entirely
optional. File it only if you want the Terraform-managed CloudFront path.

## If you ever file it (~3 min, root only)

Create a case: **Account and billing → Account → Account verification**
and paste:

```
Subject: Please verify account for CloudFront new-resource access

Hello,

My account (499867322589) is blocked from creating CloudFront resources:

  AccessDenied: Your account must be verified before you can add new
  CloudFront resources. To verify your account, please contact AWS Support
  (https://console.aws.amazon.com/support/home#/) and include this error
  message.

Operation: CreateDistributionWithTags
Region: us-east-1
Request ID: 303c0e20-f070-4621-972b-afccac4bd630

Could you please verify the account and lift the restriction?

Thank you!
```

## After approval

1. Flip `enable_cloudfront = true` in `terraform.tfvars`, then:
   `cd terraform && AWS_PROFILE=tf terraform apply`
2. Serve the frontend from S3 + CloudFront (sync `dist/` to the bucket,
   invalidate) instead of Amplify, point `frontend_domain` at the
   CloudFront domain, and re-apply the Cognito client.
3. `public_website_interim = false` to turn the HTTP S3 website off.
4. Optionally delete the Amplify app.

**None of this is required for the app to work — it exists only for having
the frontend served through the Terraform-native CloudFront path.**
