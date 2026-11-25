# Alarm notifications. The per-handler and API 5XX alarms exist but had no
# actions, so they only turned red on a dashboard nobody watches. A single SNS
# topic fans out to an email (or whatever subscription is added) when any alarm
# fires. Set alarm_email in terraform.tfvars to subscribe.

variable "alarm_email" {
  description = "Email to notify when a CloudWatch alarm fires (empty disables the subscription)"
  type        = string
  default     = ""
}

resource "aws_sns_topic" "alarms" {
  name = "${var.app_name}-alarms-${var.environment}"

  tags = {
    Name        = "${var.app_name}-alarms"
    Environment = var.environment
  }
}

resource "aws_sns_topic_subscription" "alarms_email" {
  count = var.alarm_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}