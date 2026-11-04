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
