#!/usr/bin/env bash
# ==============================================================================
# Karpenter Pulse: AWS Teardown & Resource Cleanup Script (Bash)
# ==============================================================================

set -uo pipefail

CLUSTER_NAME="${1:-${CLUSTER_NAME:-karpenter-pulse-test}}"
AWS_REGION="${2:-${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "   🧹 Karpenter Pulse: AWS Teardown & Resource Cleanup       "
echo "============================================================"

# 1. Deprovision Karpenter-launched instances
echo -e "\n[1/6] Deleting test workloads and NodePools to terminate EC2 nodes..."
kubectl delete -f "${SCRIPT_DIR}/manifests/workload-inflate.yaml" --ignore-not-found 2>/dev/null || true

if [ -f "${SCRIPT_DIR}/generated-nodepool.yaml" ]; then
  kubectl delete -f "${SCRIPT_DIR}/generated-nodepool.yaml" --ignore-not-found 2>/dev/null || true
  echo "  Waiting 30 seconds for Karpenter nodes to cleanly terminate..."
  sleep 30
fi

# 2. Uninstall Helm Releases
echo -e "\n[2/6] Uninstalling Helm releases..."
helm uninstall karpenter-pulse -n karpenter-pulse 2>/dev/null || true
helm uninstall karpenter -n karpenter 2>/dev/null || true
kubectl delete namespace karpenter-pulse --ignore-not-found 2>/dev/null || true
kubectl delete namespace karpenter --ignore-not-found 2>/dev/null || true

# 3. Delete EKS Cluster via eksctl
echo -e "\n[3/6] Deleting EKS cluster '$CLUSTER_NAME' via eksctl (~5-10 minutes)..."
eksctl delete cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" || true

# 4. Delete Karpenter Controller IAM ServiceAccount Role
echo -e "\n[4/6] Deleting Karpenter Controller IRSA role..."
eksctl delete iamserviceaccount --cluster "$CLUSTER_NAME" --name karpenter --namespace karpenter --region "$AWS_REGION" 2>/dev/null || true

# 5. Delete IAM CloudFormation Stack
STACK_NAME="Karpenter-${CLUSTER_NAME}"
echo -e "\n[5/6] Deleting CloudFormation IAM stack '$STACK_NAME'..."
aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$AWS_REGION" || true
echo "  Waiting for CloudFormation stack deletion to complete..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$AWS_REGION" 2>/dev/null || true

# 6. Clean temporary generated files
echo -e "\n[6/6] Cleaning local generated configuration files..."
rm -f "${SCRIPT_DIR}/generated-cluster.yaml" "${SCRIPT_DIR}/generated-nodepool.yaml"

echo -e "\n============================================================"
echo "   ✅ Cleanup Complete! All AWS test resources removed.      "
echo "============================================================"
