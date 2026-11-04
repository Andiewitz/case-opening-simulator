data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.root}/../backend/dist"
  output_path = "${path.root}/../backend/dist/backend.zip"
}

locals {
  handlers = {
    getCrates    = "getCrates.handler"
    getConfig    = "getConfig.handler"
    openCase     = "openCase.handler"
    sellItem     = "sellItem.handler"
    sellAllItems = "sellAllItems.handler"
    getUser      = "getUser.handler"
    getInventory = "getInventory.handler"
  }

  # The API refuses state-changing browser requests from origins that are not
  # listed here, so this has to include wherever the frontend is actually
  # served from: the Amplify branch, plus localhost outside prod.
  allowed_origins = join(",", distinct(concat(
    var.environment == "prod" ? [] : ["http://localhost:3000"],
    ["https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.frontend.default_domain}"],
    var.extra_allowed_origins
  )))
}

resource "aws_lambda_function" "handlers" {
  for_each = local.handlers

  function_name    = "${var.app_name}-${each.key}-${var.environment}"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs22.x"
  handler          = each.value
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  environment {
    variables = {
      TABLE_USERS      = aws_dynamodb_table.users.name
      TABLE_INVENTORY  = aws_dynamodb_table.inventory_items.name
      ALLOWED_ORIGINS  = local.allowed_origins
      OPEN_COOLDOWN_MS = tostring(var.open_cooldown_ms)
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
        Effect   = "Allow"
        Action   = ["cognito-idp:GetUser"]
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

# Lambda log groups: keep one week of logs. The AWS default is "never
# expire", so unmanaged log storage grows — and bills — forever.
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.handlers

  name              = "/aws/lambda/${aws_lambda_function.handlers[each.key].function_name}"
  retention_in_days = 7
}

# F17: one alarm per handler. Handlers log structured errors, but nobody reads
# logs proactively — an alarm is what turns "the API is broken" into a page.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.handlers

  alarm_name          = "${var.app_name}-${each.key}-${var.environment}-errors"
  alarm_description   = "${each.key} returned at least ${var.error_alarm_threshold} failed invocations in 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.handlers[each.key].function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.error_alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Name        = "${var.app_name}-${each.key}-errors"
    Environment = var.environment
  }
}
