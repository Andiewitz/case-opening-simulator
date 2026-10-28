variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Name of the application"
  type        = string
  default     = "cs2-unboxed"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "frontend_domain" {
  description = "Optional custom domain for the frontend (CloudFront alias)"
  type        = string
  default     = ""
}

variable "cognito_google_client_id" {
  description = "Google OAuth client ID for Cognito federation (set after creating Google Cloud project)"
  type        = string
  default     = ""
}

variable "cognito_google_client_secret" {
  description = "Google OAuth client secret for Cognito federation"
  type        = string
  default     = ""
}

variable "lambda_memory_size" {
  description = "Memory size in MB for Lambda functions"
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Timeout in seconds for Lambda functions"
  type        = number
  default     = 30
}

variable "dynamodb_billing_mode" {
  description = "Billing mode for DynamoDB tables"
  type        = string
  default     = "PAY_PER_REQUEST"
}
