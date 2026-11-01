# Amplify Hosting serves the frontend — HTTPS via AWS-managed
# *.amplifyapp.com certificate, no CloudFront account verification needed.
# Deploys are manual zip uploads (aws amplify create-deployment); all
# infrastructure lives here.

resource "aws_amplify_app" "frontend" {
  name     = var.app_name
  platform = "WEB"

  # Exact-path passthrough for the case-opening sound; the SPA fallback rule
  # below would otherwise rewrite /csgo-case-open.mp3 to index.html.
  custom_rule {
    source = "/csgo-case-open.mp3"
    target = "/csgo-case-open.mp3"
    status = "200"
  }

  # SPA fallback: extension-less paths (client-side routes like /inventory)
  # serve index.html; real assets pass through untouched.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|webmanifest|xml|mp3|ogg|wav|m4a|mp4|webm|aac|flac)$)/>"
    target = "/index.html"
    status = "200"
  }

  tags = {
    Name        = "${var.app_name}-frontend"
    Environment = var.environment
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = "main"
  stage       = "DEVELOPMENT"

  # No git connection (manual zip deploys), but Amplify reports this flag as
  # enabled by default; keep it to avoid drift in plan.
  enable_auto_build = true
}
