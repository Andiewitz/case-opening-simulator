#!/usr/bin/env bash
# Deploy the frontend build to S3 + invalidate CloudFront.
# NOT executed automatically — run manually after `terraform apply` provides the bucket name.
#
# Usage:
#   export CS2_FRONTEND_BUCKET="<bucket-name from terraform output>"
#   export CS2_CLOUDFRONT_ID="<distribution id from terraform output>"
#   ./scripts/deploy-frontend.sh
set -euo pipefail

BUCKET="${CS2_FRONTEND_BUCKET:?set CS2_FRONTEND_BUCKET}"
DISTRIBUTION_ID="${CS2_CLOUDFRONT_ID:?set CS2_CLOUDFRONT_ID}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "Building frontend..."
npm run build

echo "Syncing dist/ to s3://$BUCKET ..."
aws s3 sync dist/ "s3://$BUCKET" --delete --region "$AWS_REGION"

echo "Invalidating CloudFront distribution $DISTRIBUTION_ID ..."
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --region "$AWS_REGION" >/dev/null

echo "Deploy complete."
