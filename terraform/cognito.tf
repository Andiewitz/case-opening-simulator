resource "aws_cognito_user_pool" "app" {
  name = "${var.app_name}-user-pool-${var.environment}"

  username_attributes = ["email"]

  auto_verified_attributes = ["email"]

  mfa_configuration = "OFF"

  deletion_protection = "INACTIVE"

  tags = {
    Name        = "${var.app_name}-user-pool"
    Environment = var.environment
  }
}

resource "aws_cognito_user_pool_domain" "app" {
  domain       = "${var.app_name}-${var.environment}-${random_id.bucket_suffix.hex}"
  user_pool_id = aws_cognito_user_pool.app.id
}

locals {
  # Public origins allowed for auth redirects: Vite dev ports (--port=3000 with
  # fallback 3001) + `frontend_domain` from terraform.tfvars (e.g. CloudFront
  # or custom domain) once the distribution is live.
  auth_origins = compact(concat(
    ["http://localhost:5173", "http://localhost:3001"],
    (var.frontend_domain != "" ? ["https://${var.frontend_domain}"] : []),
  ))
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
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # Hosted-UI OAuth2 authorization-code flow (src/services/auth.ts)
  callback_urls                        = [for origin in local.auth_origins : "${origin}/callback"]
  logout_urls                          = local.auth_origins
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
}
