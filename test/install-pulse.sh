#!/usr/bin/env bash
# ==============================================================================
# Karpenter Pulse: Install or Upgrade Karpenter Pulse Helm Chart
# Deploys the unified frontend and backend Helm chart on an active EKS cluster.
# ==============================================================================

set -euo pipefail

CLUSTER_NAME="${1:-${CLUSTER_NAME:-karpenter-pulse-test}}"
AWS_REGION="${2:-${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}}"
KARPENTER_NAMESPACE="${3:-${KARPENTER_NAMESPACE:-kube-system}}"

echo "============================================================"
echo "   🚀 Karpenter Pulse: Deploy Helm Chart Only              "
echo "============================================================"
echo "  Cluster:             $CLUSTER_NAME"
echo "  Region:              $AWS_REGION"
echo "  Karpenter Namespace: $KARPENTER_NAMESPACE"
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. AWS Credentials
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null || true)
if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ AWS credentials not active or invalid."
  exit 1
fi
echo "  ✅ AWS Account ID: $ACCOUNT_ID"

# 2. Update kubeconfig
echo -e "\n[1/3] Updating kubeconfig for cluster '$CLUSTER_NAME'..."
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

# 3. Resolve SQS Queue URL & IRSA Role ARN
SQS_URL="https://sqs.${AWS_REGION}.amazonaws.com/${ACCOUNT_ID}/${CLUSTER_NAME}"
PULSE_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${CLUSTER_NAME}-karpenter-pulse"

echo -e "\n[2/3] Configuring parameters:"
echo "  SQS Queue URL: $SQS_URL"
echo "  IRSA Role ARN: $PULSE_ROLE_ARN"

# 4. Install or upgrade Karpenter Pulse Helm Chart
echo -e "\n[3/3] Deploying Karpenter Pulse Helm chart..."
helm upgrade --install karpenter-pulse "${SCRIPT_DIR}/../helm" \
  --namespace karpenter-pulse \
  --create-namespace \
  --set backend.config.awsRegion="$AWS_REGION" \
  --set backend.config.clusterName="$CLUSTER_NAME" \
  --set backend.config.karpenterNamespace="$KARPENTER_NAMESPACE" \
  --set backend.config.sqsQueueUrl="$SQS_URL" \
  --set backend.serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="$PULSE_ROLE_ARN" \
  --wait

echo -e "\n============================================================"
echo "   🎉 Karpenter Pulse Helm Chart Successfully Installed!   "
echo "============================================================"
kubectl get pods -n karpenter-pulse -o wide
echo ""
echo "Access Dashboard locally via port-forward:"
echo "  kubectl port-forward -n karpenter-pulse svc/karpenter-pulse-web 8080:80"
