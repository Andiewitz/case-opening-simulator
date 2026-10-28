resource "aws_dynamodb_table" "users" {
  name         = "${var.app_name}-users-${var.environment}"
  billing_mode = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5
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
  billing_mode = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5
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
