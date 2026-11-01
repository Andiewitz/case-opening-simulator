# CloudFront account verification — the one manual step

The Terraform stack includes an `aws_cloudfront_distribution` for the frontend
(HTTPS + Terraform-managed hosting). Creating it currently fails with:

```
AccessDenied: Your account must be verified before you can add new CloudFront
resources. To verify your account, please contact AWS Support
(https://console.aws.amazon.com/support/home#/) and include this error message.
```

This is an AWS account-level gate. **Only the account root user can file the
unblock request.** Until it clears, the frontend is served by AWS Amplify
Hosting at https://main.d2mrjtz68yn4c6.amplifyapp.com/ (HTTPS works fine there).

## How to file it (~3 minutes)

1. Sign in to the AWS console as **root** (account `499867322589`)
2. Go to https://console.aws.amazon.com/support/home#/ → **Create case**
3. Choose:
   - **Account and billing**
   - Service: **Account**
   - Category: **Account verification** (or "Other account issues")
   - Severity: **General guidance** / low
4. Subject + description — paste this:

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
Error occurred: 2026-11-01 (via Terraform / AWS CLI)

I am hosting a personal static website (React SPA + API Gateway/Lambda
backend) for my own use and would like to serve it via CloudFront with
HTTPS. No marketing or high-volume traffic is involved.

Could you please verify the account and lift the CloudFront restriction?

Thank you!
```

5. Submit. AWS usually answers within 1-2 business days.

## After it's cleared

Run the full (untargeted) Terraform apply — it will create the distribution:

```bash
cd terraform && AWS_PROFILE=tf terraform apply
```

Then flip the interim S3 public-website mode off in `terraform.tfvars`:

```hcl
public_website_interim = false
```

and apply again. Optionally point `frontend_domain` at the CloudFront domain
(`dxxxxxx.cloudfront.net`) so Cognito callbacks match, then redeploy the
frontend bundle from `dist/` with that origin.

## Current interim state (works fine, HTTPS included)

- Frontend: https://main.d2mrjtz68yn4c6.amplifyapp.com/ (Amplify, auto-TLS)
- API: https://7h7i5bb7o3.execute-api.us-east-1.amazonaws.com/dev
- Fallback (HTTP only): the S3 website endpoint
