# On-demand billing: pay per actual read/write, nothing while idle.
# (Provisioned 5+5 RCU/WCU cost ~$5.70/mo even at zero traffic.)
resource "aws_dynamodb_table" "users" {
  name         = "${var.app_name}-users-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  stream_enabled = false

  tags = {
    Name        = "${var.app_name}-users"
    Environment = var.environment
  }
}

resource "aws_dynamodb_table" "inventory_items" {
  name         = "${var.app_name}-inventory-items-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "itemId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "itemId"
    type = "S"
  }

  stream_enabled = false

  tags = {
    Name        = "${var.app_name}-inventory-items"
    Environment = var.environment
  }
}
