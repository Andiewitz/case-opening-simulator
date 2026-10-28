resource "aws_api_gateway_rest_api" "api" {
  name        = "${var.app_name}-api-${var.environment}"
  description = "CS2 Unboxed serverless API"
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
  for_each = {
    getCrates     = aws_api_gateway_integration.crates_get
    openCase      = aws_api_gateway_integration.cases_open_post
    sellItem      = aws_api_gateway_integration.inventory_sell_post
    getUser       = aws_api_gateway_integration.users_userid_get
    getInventory  = aws_api_gateway_integration.users_userid_inventory_get
  }

  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function      = aws_lambda_function.handlers[each.key].arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ---- Deployment + stage ----
resource "aws_api_gateway_deployment" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name  = var.environment

  triggers = {
    redeploy = sha256(jsonencode([
      aws_api_gateway_integration.crates_get.id,
      aws_api_gateway_integration.cases_open_post.id,
      aws_api_gateway_integration.inventory_sell_post.id,
      aws_api_gateway_integration.users_userid_get.id,
      aws_api_gateway_integration.users_userid_inventory_get.id,
    ]))
  }
}

resource "aws_api_gateway_stage" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name  = aws_api_gateway_deployment.api.stage_name
  deployment_id = aws_api_gateway_deployment.api.id
}
