resource "aws_api_gateway_rest_api" "api" {
  name        = "${var.app_name}-api-${var.environment}"
  description = "CS2 Unboxed serverless API"
}

# ---- CORS preflight (OPTIONS) ----
# Browsers preflight cross-origin requests that carry Content-Type/Authorization.
# Every handler answers OPTIONS itself with the shared CORS headers, so these
# integrations reuse each route's own Lambda (AWS_PROXY).
locals {
  preflight_routes = {
    crates             = aws_api_gateway_resource.crates.id
    config             = aws_api_gateway_resource.config.id
    cases_open         = aws_api_gateway_resource.cases_open.id
    inventory_sell     = aws_api_gateway_resource.inventory_sell.id
    inventory_sell_all = aws_api_gateway_resource.inventory_sell_all.id
    users_id           = aws_api_gateway_resource.users_userid.id
    users_id_inventory = aws_api_gateway_resource.users_userid_inventory.id
  }
  preflight_lambda = {
    crates             = "getCrates"
    config             = "getConfig"
    cases_open         = "openCase"
    inventory_sell     = "sellItem"
    inventory_sell_all = "sellAllItems"
    users_id           = "getUser"
    users_id_inventory = "getInventory"
  }
}

resource "aws_api_gateway_method" "options" {
  for_each      = local.preflight_routes
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options" {
  for_each                = local.preflight_routes
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = each.value
  http_method             = aws_api_gateway_method.options[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.handlers[local.preflight_lambda[each.key]].invoke_arn
}

# ---- /crates (GET) ----
resource "aws_api_gateway_resource" "crates" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "crates"
}

resource "aws_api_gateway_method" "crates_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.crates.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "crates_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.crates.id
  http_method             = aws_api_gateway_method.crates_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.handlers["getCrates"].invoke_arn
}

resource "aws_api_gateway_method_response" "crates_get_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.crates.id
  http_method = aws_api_gateway_method.crates_get.http_method
  status_code = "200"
}

# ---- /config (GET) ----
# Public economy settings (case price, starting balance, inventory cap) so the
# frontend never re-types the price.
resource "aws_api_gateway_resource" "config" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "config"
}

resource "aws_api_gateway_method" "config_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.config.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "config_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.config.id
  http_method             = aws_api_gateway_method.config_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.handlers["getConfig"].invoke_arn
}

resource "aws_api_gateway_method_response" "config_get_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.config.id
  http_method = aws_api_gateway_method.config_get.http_method
  status_code = "200"
}

# ---- /cases/open (POST) ----
resource "aws_api_gateway_resource" "cases" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "cases"
}

resource "aws_api_gateway_resource" "cases_open" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cases.id
  path_part   = "open"
}

resource "aws_api_gateway_method" "cases_open_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cases_open.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cases_open_post" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.cases_open.id
  http_method             = aws_api_gateway_method.cases_open_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.handlers["openCase"].invoke_arn
}

resource "aws_api_gateway_method_response" "cases_open_post_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cases_open.id
  http_method = aws_api_gateway_method.cases_open_post.http_method
  status_code = "200"
}

# ---- /inventory/sell (POST) ----
resource "aws_api_gateway_resource" "inventory" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "inventory"
}

resource "aws_api_gateway_resource" "inventory_sell" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.inventory.id
  path_part   = "sell"
}

resource "aws_api_gateway_method" "inventory_sell_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.inventory_sell.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "inventory_sell_post" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.inventory_sell.id
  http_method             = aws_api_gateway_method.inventory_sell_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.handlers["sellItem"].invoke_arn
}

resource "aws_api_gateway_method_response" "inventory_sell_post_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.inventory_sell.id
  http_method = aws_api_gateway_method.inventory_sell_post.http_method
  status_code = "200"
}

# ---- /inventory/sell-all (POST) ----
resource "aws_api_gateway_resource" "inventory_sell_all" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.inventory.id
  path_part   = "sell-all"
}

resource "aws_api_gateway_method" "inventory_sell_all_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.inventory_sell_all.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "inventory_sell_all_post" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.inventory_sell_all.id
  http_method             = aws_api_gateway_method.inventory_sell_all_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.handlers["sellAllItems"].invoke_arn
}

resource "aws_api_gateway_method_response" "inventory_sell_all_post_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.inventory_sell_all.id
  http_method = aws_api_gateway_method.inventory_sell_all_post.http_method
  status_code = "200"
}

# ---- /users/{userId} (GET) ----
resource "aws_api_gateway_resource" "users" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "users"
}

resource "aws_api_gateway_resource" "users_userid" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users.id
  path_part   = "{userId}"
}

resource "aws_api_gateway_method" "users_userid_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_userid.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "users_userid_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.users_userid.id
  http_method             = aws_api_gateway_method.users_userid_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.handlers["getUser"].invoke_arn
}

resource "aws_api_gateway_method_response" "users_userid_get_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_userid.id
  http_method = aws_api_gateway_method.users_userid_get.http_method
  status_code = "200"
}

# ---- /users/{userId}/inventory (GET) ----
resource "aws_api_gateway_resource" "users_userid_inventory" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users_userid.id
  path_part   = "inventory"
}

resource "aws_api_gateway_method" "users_userid_inventory_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_userid_inventory.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "users_userid_inventory_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.users_userid_inventory.id
  http_method             = aws_api_gateway_method.users_userid_inventory_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.handlers["getInventory"].invoke_arn
}

resource "aws_api_gateway_method_response" "users_userid_inventory_get_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_userid_inventory.id
  http_method = aws_api_gateway_method.users_userid_inventory_get.http_method
  status_code = "200"
}

# ---- Lambda invoke permissions for API Gateway ----
resource "aws_lambda_permission" "apigw" {
  for_each = local.handlers

  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handlers[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ---- Deployment + stage ----
resource "aws_api_gateway_deployment" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  triggers = {
    redeploy = sha256(jsonencode([
      aws_api_gateway_integration.crates_get.id,
      aws_api_gateway_integration.config_get.id,
      aws_api_gateway_integration.cases_open_post.id,
      aws_api_gateway_integration.inventory_sell_post.id,
      aws_api_gateway_integration.inventory_sell_all_post.id,
      aws_api_gateway_integration.users_userid_get.id,
      aws_api_gateway_integration.users_userid_inventory_get.id,
      aws_api_gateway_integration.options["crates"],
      aws_api_gateway_integration.options["config"],
      aws_api_gateway_integration.options["cases_open"],
      aws_api_gateway_integration.options["inventory_sell"],
      aws_api_gateway_integration.options["inventory_sell_all"],
      aws_api_gateway_integration.options["users_id"],
      aws_api_gateway_integration.options["users_id_inventory"],
    ]))
  }

  # Stages pin their deployment; create the replacement (and move the stage to
  # it) before destroying the old snapshot.
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "api" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = var.environment
  deployment_id = aws_api_gateway_deployment.api.id

  # Gzip responses >= 1 KB. The /crates feed is ~5 MB of JSON and compresses
  # to ~5-10x smaller, which is the single biggest perceived-latency win.
  # Compression on API Gateway REST APIs is enabled via a stage variable.
  variables = {
    minimumCompressionSize = "1024"
  }
}

# F17: 5XX from the stage means the integration or the Lambda layer is failing,
# which the per-function error alarm alone can miss (e.g. throttles, timeouts).
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name        = "${var.app_name}-api-${var.environment}-5xx"
  alarm_description = "API Gateway returned 5XX responses for 5 minutes straight."
  namespace         = "AWS/ApiGateway"
  metric_name       = "5XXError"
  dimensions = {
    ApiName = aws_api_gateway_rest_api.api.name
    Stage   = aws_api_gateway_stage.api.stage_name
  }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.error_alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Name        = "${var.app_name}-api-5xx"
    Environment = var.environment
  }
}
