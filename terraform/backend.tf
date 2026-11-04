# Remote state, so CI and a human can both apply the same infrastructure.
#
# The bucket is bootstrapped out of band (it cannot be managed by the state it
# holds): versioning on, AES256 default encryption, all public access blocked,
# and no delete permission for anyone but the account root. S3 native locking
# (`use_lockfile`) serialises concurrent applies without the old DynamoDB table.
#
# The bucket name is not a secret — it shows up in every `terraform init` log,
# in a public repository — but the contents are: treat read access as
# equivalent to read access to production.
terraform {
  backend "s3" {
    bucket       = "cs2-unboxed-tfstate-499867322589"
    key          = "cs2-unboxed/dev/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
