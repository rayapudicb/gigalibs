terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

variable "customer_name" {
  type        = string
  description = "Customer organization identifier for single-tenant VPC"
  default     = "enterprise-customer"
}

variable "region" {
  type        = string
  description = "AWS region for sovereign deployment"
  default     = "eu-central-1"
}

variable "byok_kms_key_arn" {
  type        = string
  description = "Optional customer-managed KMS key ARN for BYOK envelope encryption"
  default     = null
}

# ── Isolated VPC ─────────────────────────────────────────────────────────────

module "vpc" {
  source = "../../modules/vpc"
  name   = "wf-${var.customer_name}-vpc"
  cidr   = "10.100.0.0/16"
}

# ── BYOK / KMS Envelope Encryption ──────────────────────────────────────────

module "kms" {
  source           = "../../modules/kms"
  customer_key_arn = var.byok_kms_key_arn
  alias            = "alias/wf-${var.customer_name}-encryption"
}

# ── Isolated RDS PostgreSQL 16 ───────────────────────────────────────────────

module "rds" {
  source         = "../../modules/rds"
  identifier     = "wf-${var.customer_name}-pg16"
  vpc_id         = module.vpc.vpc_id
  kms_key_arn    = module.kms.key_arn
  instance_class = "db.r6g.xlarge"
  multi_az       = true
}

# ── Dedicated EKS Compute Cluster for Isolated Workers ───────────────────────

module "eks" {
  source       = "../../modules/eks"
  cluster_name = "wf-${var.customer_name}-eks"
  vpc_id       = module.vpc.vpc_id
  kms_key_arn  = module.kms.key_arn
}

output "deployment_summary" {
  value = {
    customer_id = var.customer_name
    region      = var.region
    vpc_id      = module.vpc.vpc_id
    rds_host    = module.rds.endpoint
    eks_cluster = module.eks.cluster_id
    byok_active = var.byok_kms_key_arn != null
  }
}
