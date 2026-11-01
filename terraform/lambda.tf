data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.root}/../backend/dist"
  output_path = "${path.root}/../backend/dist/backend.zip"
}

locals {
  handlers = {
    getCrates     = "getCrates.handler"
    openCase      = "openCase.handler"
    sellItem      = "sellItem.handler"
    getUser       = "getUser.handler"
    getInventory  = "getInventory.handler"
  }
}

resource "aws_lambda_function" "handlers" {
  for_each = local.handlers

  function_name = "${var.app_name}-${each.key}-${var.environment}"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs22.x"
  handler       = each.value
  filename      = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  environment {
    variables = {
      TABLE_USERS    = aws_dynamodb_table.users.name
      TABLE_INVENTORY = aws_dynamodb_table.inventory_items.name
    }
  }

  tags = {
    Name        = "${var.app_name}-${each.key}"
    Environment = var.environment
  }
}

# Allow Cognito getUser (verify access token) for auth in handlers
resource "aws_iam_policy" "lambda_cognito" {
  name = "${var.app_name}-lambda-cognito-${var.environment}"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["cognito-idp:GetUser"]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "${var.app_name}-lambda-cognito"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "lambda_cognito_attach" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_cognito.arn
}
