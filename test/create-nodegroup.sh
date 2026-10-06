#!/usr/bin/env bash
# ==============================================================================
# Karpenter Pulse: Spin Up EKS Managed NodeGroup
# Use this when the EKS cluster exists but has 0 worker nodes.
# ==============================================================================

set -euo pipefail

CLUSTER_NAME="${1:-${CLUSTER_NAME:-karpenter-pulse-test}}"
AWS_REGION="${2:-${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}}"
INSTANCE_TYPE="${3:-${INSTANCE_TYPE:-t3.micro}}"
KARPENTER_NAMESPACE="${KARPENTER_NAMESPACE:-kube-system}"
NODEGROUP_NAME="${CLUSTER_NAME}-ng"

echo "============================================================"
echo "   🚀 Karpenter Pulse: Spin Up EKS Managed NodeGroup        "
echo "============================================================"
echo "  Cluster:       $CLUSTER_NAME"
echo "  Region:        $AWS_REGION"
echo "  NodeGroup:     $NODEGROUP_NAME"
echo "  Instance Type: $INSTANCE_TYPE (Free Tier eligible)"
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null || true)
if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ AWS credentials not active or invalid."
  exit 1
fi

# 1. Check if cluster exists
if ! aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "❌ EKS cluster '$CLUSTER_NAME' does not exist in region '$AWS_REGION'. Please run deploy.sh to create the cluster."
  exit 1
fi

# 2. Check for any existing nodegroups with the same name that failed previously
EXISTING_NGS=$(aws eks list-nodegroups --cluster-name "$CLUSTER_NAME" --region "$AWS_REGION" --query "nodegroups" --output text 2>/dev/null || true)
for ng in $EXISTING_NGS; do
  if [ "$ng" = "$NODEGROUP_NAME" ]; then
    NG_STATUS=$(aws eks describe-nodegroup --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION" --query "nodegroup.status" --output text 2>/dev/null || true)
    echo "  Existing nodegroup '$NODEGROUP_NAME' found with status: $NG_STATUS"
    if [ "$NG_STATUS" = "CREATE_FAILED" ] || [ "$NG_STATUS" = "DEGRADED" ] || [ "$NG_STATUS" = "DELETE_FAILED" ]; then
      echo "  ⚠️ Deleting failed nodegroup '$NODEGROUP_NAME' before recreating..."
      eksctl delete nodegroup --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --name "$NODEGROUP_NAME" --approve || true
      aws eks wait nodegroup-deleted --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION" 2>/dev/null || true
      echo "  ✅ Failed nodegroup deleted."
    elif [ "$NG_STATUS" = "ACTIVE" ]; then
      echo "  ✅ Nodegroup '$NODEGROUP_NAME' is already ACTIVE."
    fi
  fi
done

# 3. Prepare cluster config file with substituted variables
sed -e "s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" \
    -e "s/\${AWS_REGION}/$AWS_REGION/g" \
    -e "s/\${AWS_ACCOUNT_ID}/$ACCOUNT_ID/g" \
    -e "s/\${KARPENTER_NAMESPACE}/$KARPENTER_NAMESPACE/g" \
    -e "s/\${INSTANCE_TYPE}/$INSTANCE_TYPE/g" \
    "${SCRIPT_DIR}/cluster-template.yaml" > "${SCRIPT_DIR}/generated-cluster.yaml"

# 4. Create the managed nodegroup via eksctl
echo -e "\nCreating managed nodegroup via eksctl (~3-5 minutes)..."
if ! eksctl create nodegroup --config-file "${SCRIPT_DIR}/generated-cluster.yaml" --include "$NODEGROUP_NAME"; then
  echo "Retrying nodegroup creation via direct eksctl parameters..."
  eksctl create nodegroup \
    --cluster "$CLUSTER_NAME" \
    --region "$AWS_REGION" \
    --name "$NODEGROUP_NAME" \
    --node-type "$INSTANCE_TYPE" \
    --nodes 2 \
    --nodes-min 1 \
    --nodes-max 5 \
    --node-ami-family AmazonLinux2023 \
    --managed
fi

# 5. Update kubeconfig and wait for nodes to be Ready
echo -e "\nUpdating kubeconfig and waiting for worker nodes to reach Ready state..."
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

echo "Waiting for worker nodes to reach Ready status (up to 5 minutes)..."
kubectl wait --for=condition=Ready nodes --all --timeout=300s || true

echo -e "\n============================================================"
echo "   ✅ Managed Worker Nodes are UP and RUNNING!              "
echo "============================================================"
kubectl get nodes -o wide
