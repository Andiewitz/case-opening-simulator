# Public HTTPS origin for auth redirects (callback/logout allowlist).
# Currently the AWS Amplify Hosting branch URL (interim HTTPS while the
# CloudFront account-verification support case is pending).
# When CloudFront is live, point this at the distribution domain instead.
frontend_domain = "main.d2mrjtz68yn4c6.amplifyapp.com"

# Creates the GitHub OIDC provider and the deploy role the Deploy workflow
# assumes. Removing this line deletes the role, so the workflow must be the
# thing that changes it, not a hand edit on the AWS side.
github_repository = "Andiewitz/case-opening-simulator"

# CloudFront stays off until the AWS account-verification clears
# (docs/aws-cloudfront-verification.md). Amplify serves the frontend.
enable_cloudfront = false

# Where CloudWatch alarm notifications go (H6). The SNS subscription sends a
# confirmation email on first apply; click it to start receiving alerts.
alarm_email = "gracefulandrei@gmail.com"

# Free readable domain via is-a.dev (GitHub PR). Amplify provisions the ACM
# cert; the two CNAMEs to add are in the amplify_domain_dns_records output.
custom_domain = "cs2unboxed.is-a.dev"
