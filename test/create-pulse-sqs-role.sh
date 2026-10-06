#!/usr/bin/env bash
# ==============================================================================
# Karpenter Pulse: Create SQS Queue & IAM Role (IRSA) for Karpenter Pulse
# Provisions the SQS Interruption Queue, EventBridge rules, and IAM Role.
# ==============================================================================

set -euo pipefail

CLUSTER_NAME="${1:-${CLUSTER_NAME:-karpenter-pulse-test}}"
AWS_REGION="${2:-${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}}"

echo "============================================================"
echo "   🚀 Karpenter Pulse: SQS Queue & IAM Role Setup          "
echo "============================================================"
echo "  Cluster:  $CLUSTER_NAME"
echo "  Region:   $AWS_REGION"
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. AWS Credentials
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null || true)
if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ AWS credentials not active or invalid."
  exit 1
fi
echo "  ✅ AWS Account ID: $ACCOUNT_ID"

# 2. Deploy/Update CloudFormation stack (creates SQS queue, policies, & EventBridge rules)
STACK_NAME="Karpenter-${CLUSTER_NAME}"
echo -e "\n[1/3] Deploying/Updating CloudFormation stack ($STACK_NAME)..."
aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "${SCRIPT_DIR}/iam-cloudformation.yaml" \
  --parameter-overrides "ClusterName=${CLUSTER_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$AWS_REGION"

SQS_URL="https://sqs.${AWS_REGION}.amazonaws.com/${ACCOUNT_ID}/${CLUSTER_NAME}"
echo "  ✅ SQS Interruption Queue: $SQS_URL"

# 3. Ensure EKS cluster exists & associate OIDC provider
echo -e "\n[2/3] Checking EKS cluster and IAM OIDC provider..."
if aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "  Associating IAM OIDC Provider with EKS cluster '$CLUSTER_NAME'..."
  eksctl utils associate-iam-oidc-provider \
    --cluster "$CLUSTER_NAME" \
    --region "$AWS_REGION" \
    --approve || true
else
  echo "  ⚠️ Cluster '$CLUSTER_NAME' does not exist yet. IRSA service account will be created during cluster creation."
fi

# 4. Create IRSA for Karpenter Pulse via eksctl
echo -e "\n[3/3] Creating/Updating IAM Role & ServiceAccount for Karpenter Pulse..."
PULSE_ROLE_NAME="${CLUSTER_NAME}-karpenter-pulse"
PULSE_POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/KarpenterPulseSQSPolicy-${CLUSTER_NAME}"
PULSE_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${PULSE_ROLE_NAME}"

# Ensure namespace exists if connected to cluster
kubectl create namespace karpenter-pulse --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || true

eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --namespace karpenter-pulse \
  --name karpenter-pulse \
  --role-name "$PULSE_ROLE_NAME" \
  --attach-policy-arn "$PULSE_POLICY_ARN" \
  --approve \
  --override-existing-serviceaccounts 2>/dev/null || {
    echo "  eksctl iamserviceaccount command encountered an issue; falling back to direct IAM role creation..."
    OIDC_ISSUER=$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --query "cluster.identity.oidc.issuer" --output text | sed -e "s/^https:\/\///")
    TRUST_RELATIONSHIP=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_ISSUER}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_ISSUER}:sub": "system:serviceaccount:karpenter-pulse:karpenter-pulse",
          "${OIDC_ISSUER}:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF
)
    aws iam get-role --role-name "$PULSE_ROLE_NAME" >/dev/null 2>&1 || \
      aws iam create-role --role-name "$PULSE_ROLE_NAME" --assume-role-policy-document "$TRUST_RELATIONSHIP"
    aws iam attach-role-policy --role-name "$PULSE_ROLE_NAME" --policy-arn "$PULSE_POLICY_ARN"
    kubectl annotate serviceaccount -n karpenter-pulse karpenter-pulse "eks.amazonaws.com/role-arn=$PULSE_ROLE_ARN" --overwrite 2>/dev/null || true
  }

echo -e "\n============================================================"
echo "   🎉 SQS Queue & IAM Role Setup Complete!                 "
echo "============================================================"
echo "  SQS Queue URL:      $SQS_URL"
echo "  IAM Role ARN:       $PULSE_ROLE_ARN"
echo "  ServiceAccount:     karpenter-pulse (namespace: karpenter-pulse)"
echo "============================================================"
