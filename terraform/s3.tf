resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# TEMPORARY: serve the site straight from the S3 website endpoint (HTTP) while
# the account waits for CloudFront verification. Cognito only allows https
# callback URLs (except localhost), so sign-in is disabled on the S3 site;
# the full flow works at CloudFront (or npm run dev). Flip this to false once
# the CloudFront distribution is serving.
variable "public_website_interim" {
  description = "Public-read S3 website endpoint for the frontend while CloudFront is pending."
  type        = bool
  default     = true
}

locals {
  frontend_bucket_statements = concat(
    [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      },
    ],
    var.public_website_interim ? [
      {
        Sid       = "PublicReadWebsiteInterim"
        Effect    = "Allow"
        Principal = {
          AWS = "*"
        }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      },
    ] : [],
  )
}

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.app_name}-frontend-${random_id.bucket_suffix.hex}"

  tags = {
    Name        = "${var.app_name}-frontend"
    Environment = var.environment
  }
}

# Relaxed while the S3 website endpoint serves the site; restores CF-only
# access when public_website_interim = false.
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = !var.public_website_interim
  block_public_policy     = !var.public_website_interim
  ignore_public_acls      = !var.public_website_interim
  restrict_public_buckets = !var.public_website_interim
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  count = var.public_website_interim ? 1 : 0
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# CloudFront is gated behind `enable_cloudfront` (default false) because the
# account is not verified for CloudFront yet. Amplify Hosting serves the
# frontend meanwhile; flip the switch after account verification clears
# (see docs/aws-cloudfront-verification.md).
variable "enable_cloudfront" {
  description = "Create the CloudFront distribution for the frontend (requires AWS account verification for CloudFront)."
  type        = bool
  default     = false
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  count                       = var.enable_cloudfront ? 1 : 0
  name                        = "${var.app_name}-frontend-oac"
  description                 = "OAC for ${var.app_name} frontend S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior            = "always"
  signing_protocol            = "sigv4"
}

resource "aws_s3_bucket_policy" "frontend_cloudfront" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = local.frontend_bucket_statements
  })

  # Public-read policy is only accepted after the block switch above relaxes.
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

resource "aws_cloudfront_distribution" "frontend" {
  count = var.enable_cloudfront ? 1 : 0

  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.frontend.id}"

    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id

    s3_origin_config {
      origin_access_identity = ""
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  default_cache_behavior {
    target_origin_id = "S3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  custom_error_response {
    error_code      = 404
    response_code   = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code      = 403
    response_code   = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "${var.app_name}-frontend"
    Environment = var.environment
  }
}
