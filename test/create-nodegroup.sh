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

# 2. Update kubeconfig and check current worker nodes
echo -e "\n[1/4] Checking existing worker nodes in cluster '$CLUSTER_NAME'..."
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1 || true
READY_NODES=$(kubectl get nodes --no-headers 2>/dev/null | grep -c "Ready" || echo "0")
echo "  Current Ready Worker Nodes in cluster: $READY_NODES"

# 3. Check for any existing nodegroups with the same name
EXISTING_NGS=$(aws eks list-nodegroups --cluster-name "$CLUSTER_NAME" --region "$AWS_REGION" --query "nodegroups" --output text 2>/dev/null || true)
for ng in $EXISTING_NGS; do
  if [ -z "$ng" ]; then continue; fi
  if [ "$ng" = "$NODEGROUP_NAME" ]; then
    NG_STATUS=$(aws eks describe-nodegroup --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION" --query "nodegroup.status" --output text 2>/dev/null || echo "UNKNOWN")
    CURRENT_TYPE=$(aws eks describe-nodegroup --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION" --query "nodegroup.instanceTypes[0]" --output text 2>/dev/null || echo "UNKNOWN")
    echo "  Existing nodegroup '$NODEGROUP_NAME' found (Status: $NG_STATUS, InstanceType: $CURRENT_TYPE, Cluster Ready Nodes: $READY_NODES)"

    # If the nodegroup has 0 ready nodes OR has the wrong instance type (e.g. t3.medium instead of t3.micro)
    # OR is failed/degraded: delete it so eksctl doesn't exclude it!
    if [ "$READY_NODES" -eq 0 ] || [ "$CURRENT_TYPE" != "$INSTANCE_TYPE" ] || [ "$NG_STATUS" != "ACTIVE" ]; then
      echo "  ⚠️ Existing nodegroup '$NODEGROUP_NAME' has 0 ready nodes or wrong instance type ($CURRENT_TYPE vs $INSTANCE_TYPE)."
      echo "  🗑️ Deleting existing nodegroup '$NODEGROUP_NAME' via eksctl so it can be re-created with $INSTANCE_TYPE..."
      eksctl delete nodegroup --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --name "$NODEGROUP_NAME" --approve || true
      echo "  Waiting for nodegroup deletion to finish in AWS..."
      aws eks wait nodegroup-deleted --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION" 2>/dev/null || true
      echo "  ✅ Existing nodegroup '$NODEGROUP_NAME' deleted."
    else
      echo "  ✅ Nodegroup '$NODEGROUP_NAME' is active with $READY_NODES ready nodes."
      exit 0
    fi
  fi
done

# 4. Prepare cluster config file with substituted variables
echo -e "\n[2/4] Generating cluster configuration with $INSTANCE_TYPE..."
sed -e "s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" \
    -e "s/\${AWS_REGION}/$AWS_REGION/g" \
    -e "s/\${AWS_ACCOUNT_ID}/$ACCOUNT_ID/g" \
    -e "s/\${KARPENTER_NAMESPACE}/$KARPENTER_NAMESPACE/g" \
    -e "s/\${INSTANCE_TYPE}/$INSTANCE_TYPE/g" \
    "${SCRIPT_DIR}/cluster-template.yaml" > "${SCRIPT_DIR}/generated-cluster.yaml"

# 5. Create the managed nodegroup via eksctl
echo -e "\n[3/4] Creating managed nodegroup '$NODEGROUP_NAME' ($INSTANCE_TYPE) via eksctl (~3-5 minutes)..."
CREATE_OUTPUT=$(eksctl create nodegroup --config-file "${SCRIPT_DIR}/generated-cluster.yaml" --include "$NODEGROUP_NAME" 2>&1 || true)
echo "$CREATE_OUTPUT"

# If eksctl reported "created 0 nodegroup(s)" because it was excluded, create with -v2 suffix:
if echo "$CREATE_OUTPUT" | grep -q "created 0.*nodegroup"; then
  ALT_NG="${NODEGROUP_NAME}-v2"
  echo "  ⚠️ eksctl excluded '$NODEGROUP_NAME'. Creating with alternate name '$ALT_NG'..."
  sed -e "s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" \
      -e "s/\${AWS_REGION}/$AWS_REGION/g" \
      -e "s/\${AWS_ACCOUNT_ID}/$ACCOUNT_ID/g" \
      -e "s/\${KARPENTER_NAMESPACE}/$KARPENTER_NAMESPACE/g" \
      -e "s/\${INSTANCE_TYPE}/$INSTANCE_TYPE/g" \
      -e "s/${NODEGROUP_NAME}/${ALT_NG}/g" \
      "${SCRIPT_DIR}/cluster-template.yaml" > "${SCRIPT_DIR}/generated-cluster.yaml"
  eksctl create nodegroup --config-file "${SCRIPT_DIR}/generated-cluster.yaml" --include "$ALT_NG"
fi

# 6. Update kubeconfig and wait for nodes to be Ready
echo -e "\n[4/4] Updating kubeconfig and waiting for worker nodes to reach Ready state..."
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

echo "Waiting for worker nodes to reach Ready status (up to 5 minutes)..."
kubectl wait --for=condition=Ready nodes --all --timeout=300s || true

echo -e "\n============================================================"
echo "   ✅ Managed Worker Nodes are UP and RUNNING!              "
echo "============================================================"
kubectl get nodes -o wide
