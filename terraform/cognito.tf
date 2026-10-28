resource "aws_cognito_user_pool" "app" {
  name = "${var.app_name}-user-pool-${var.environment}"

  username_attributes = ["email"]

  auto_verified_attributes = ["email"]

  mfa_configuration = "OFF"

  policies {
    password_policy {
      minimum_length        = 8
      require_lowercase     = true
      require_numbers       = true
      require_uppercase     = true
      require_symbols       = false
      temporary_password_validity_days = 7
    }
  }

  lambda_config = {}

  deletion_protection = false

  tags = {
    Name        = "${var.app_name}-user-pool"
    Environment = var.environment
  }
}

resource "aws_cognito_user_pool_domain" "app" {
  domain       = "${var.app_name}-${var.environment}-${random_id.bucket_suffix.hex}"
  user_pool_id = aws_cognito_user_pool.app.id
}

resource "aws_cognito_user_pool_client" "app" {
  name         = "${var.app_name}-client-${var.environment}"
  user_pool_id = aws_cognito_user_pool.app.id

  generate_secret = false

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  callback_urls = [
    "https://${aws_cloudfront_distribution.frontend.domain_name}/",
  ]

  logout_urls = [
    "https://${aws_cloudfront_distribution.frontend.domain_name}/",
  ]

  supported_identity_providers = ["COGNITO"]

  tags = {
    Name        = "${var.app_name}-client"
    Environment = var.environment
  }
}

# Optional Google federation via Cognito hosted UI. Only created when client credentials are provided.
resource "aws_cognito_identity_provider" "google" {
  count          = var.cognito_google_client_id != "" ? 1 : 0
  user_pool_id   = aws_cognito_user_pool.app.id
  provider_name  = "Google"
  provider_type  = "Google"
  provider_details = {
    client_id     = var.cognito_google_client_id
    client_secret = var.cognito_google_client_secret
    scopes        = "openid email profile"
  }

  attribute_mapping = {
    email      = "email"
    given_name = "given_name"
    family_name = "family_name"
    profile    = "picture"
  }

  tags = {
    Name        = "${var.app_name}-idp-google"
    Environment = var.environment
  }
}
