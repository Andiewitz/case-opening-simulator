output "frontend_bucket_name" {
  value       = aws_s3_bucket.frontend.id
  description = "S3 bucket name for the static frontend"
}

output "frontend_bucket_regional_domain" {
  value       = aws_s3_bucket.frontend.bucket_regional_domain_name
  description = "S3 regional domain name of the frontend bucket"
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.frontend.domain_name
  description = "CloudFront domain name for the frontend"
}

output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.frontend.id
  description = "CloudFront distribution ID (for invalidation)"
}

output "cloudfront_url" {
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
  description = "HTTPS URL of the frontend"
}

output "api_gateway_invoke_url" {
  value       = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}"
  description = "Base invoke URL for the API Gateway REST API"
}

output "api_gateway_rest_api_id" {
  value       = aws_api_gateway_rest_api.api.id
  description = "API Gateway REST API ID"
}

output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.app.id
  description = "Cognito User Pool ID"
}

output "cognito_client_id" {
  value       = aws_cognito_user_pool_client.app.id
  description = "Cognito User Pool App Client ID"
}

output "cognito_domain" {
  value       = aws_cognito_user_pool_domain.app.domain
  description = "Cognito hosted UI domain prefix"
}

output "cognito_user_pool_arn" {
  value       = aws_cognito_user_pool.app.arn
  description = "Cognito User Pool ARN"
}

output "dynamodb_users_table_name" {
  value       = aws_dynamodb_table.users.name
  description = "DynamoDB Users table name"
}

output "dynamodb_inventory_table_name" {
  value       = aws_dynamodb_table.inventory_items.name
  description = "DynamoDB InventoryItems table name"
}

output "lambda_function_arns" {
  value = {
    for k, v in aws_lambda_function.handlers : k => v.arn
  }
  description = "ARNs of the Lambda functions keyed by handler name"
}
