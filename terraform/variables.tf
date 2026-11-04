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

# Additional browser origins allowed to call the API (the Amplify branch and,
# outside prod, localhost are added automatically in lambda.tf).
variable "extra_allowed_origins" {
  description = "Extra CORS origins, e.g. [\"https://example.com\"]"
  type        = list(string)
  default     = []
}

variable "open_cooldown_ms" {
  description = "Minimum milliseconds between two case opens for one account (0 disables the throttle)"
  type        = number
  default     = 400
}

variable "error_alarm_threshold" {
  description = "Failed invocations per 5 minutes that trip a CloudWatch alarm"
  type        = number
  default     = 5
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
