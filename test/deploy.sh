#!/usr/bin/env bash
# ==============================================================================
# Karpenter Pulse: AWS EKS & Karpenter Test Environment Deployment Script
# Aligned with official https://karpenter.sh/docs/getting-started/getting-started-with-karpenter/
# ==============================================================================

set -euo pipefail

CLUSTER_NAME="${1:-${CLUSTER_NAME:-karpenter-pulse-test}}"
AWS_REGION="${2:-${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}}"
KARPENTER_VERSION="${3:-${KARPENTER_VERSION:-1.14.1}}"
INSTANCE_TYPE="${4:-${INSTANCE_TYPE:-t3.micro}}"
KARPENTER_NAMESPACE="${KARPENTER_NAMESPACE:-kube-system}"
K8S_VERSION="${K8S_VERSION:-1.35}"

echo "============================================================"
echo "   🚀 Karpenter Pulse: AWS EKS & Karpenter Test Environment  "
echo "   Aligned with official karpenter.sh Getting Started Guide "
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Prerequisites Check
echo -e "\n[1/8] Verifying required CLI tools..."
MISSING_TOOLS=()
for tool in aws helm kubectl eksctl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    MISSING_TOOLS+=("$tool")
  fi
done

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
  echo "❌ Missing required tools: ${MISSING_TOOLS[*]}"
  exit 1
fi
echo "  ✅ All tools found (aws, helm, kubectl, eksctl)."

# 2. AWS Credentials & Authentication
echo -e "\n[2/8] Checking AWS authentication..."
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null || true)
if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ AWS credentials not active or invalid."
  exit 1
fi

echo "  ✅ AWS Account ID:     $ACCOUNT_ID"
echo "  ✅ Target Region:      $AWS_REGION"
echo "  ✅ Target Cluster:     $CLUSTER_NAME"
echo "  ✅ Instance Type:      $INSTANCE_TYPE (Free Tier eligible)"
echo "  ✅ Kubernetes Version: $K8S_VERSION"
echo "  ✅ Karpenter Version:  $KARPENTER_VERSION"

# Ensure EC2 Spot Service Linked Role exists
aws iam create-service-linked-role --aws-service-name spot.amazonaws.com 2>/dev/null || true

# 3. Deploy IAM CloudFormation Stack
STACK_NAME="Karpenter-${CLUSTER_NAME}"
echo -e "\n[3/8] Deploying IAM stack via CloudFormation ($STACK_NAME)..."
aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "${SCRIPT_DIR}/iam-cloudformation.yaml" \
  --parameter-overrides "ClusterName=${CLUSTER_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$AWS_REGION"

echo "  ✅ CloudFormation stack deployed successfully."

# 4. Provision EKS Cluster via eksctl
echo -e "\n[4/8] Checking EKS cluster status ($CLUSTER_NAME)..."
if ! aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "  Cluster '$CLUSTER_NAME' does not exist yet. Creating via eksctl (~10-15 minutes)..."
  
  sed -e "s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" \
      -e "s/\${AWS_REGION}/$AWS_REGION/g" \
      -e "s/\${AWS_ACCOUNT_ID}/$ACCOUNT_ID/g" \
      -e "s/\${KARPENTER_NAMESPACE}/$KARPENTER_NAMESPACE/g" \
      -e "s/\${INSTANCE_TYPE}/$INSTANCE_TYPE/g" \
      "${SCRIPT_DIR}/cluster-template.yaml" > "${SCRIPT_DIR}/generated-cluster.yaml"

  eksctl create cluster -f "${SCRIPT_DIR}/generated-cluster.yaml"
else
  echo "  ✅ Cluster '$CLUSTER_NAME' is already running."
fi

# Update kubeconfig
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

# 5. Verify IRSA Role
KARPENTER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${CLUSTER_NAME}-karpenter"
echo -e "\n[5/8] Karpenter Controller IRSA role: $KARPENTER_ROLE_ARN"

# 6. Install Karpenter via Helm OCI
echo -e "\n[6/8] Installing Karpenter v${KARPENTER_VERSION} in namespace '${KARPENTER_NAMESPACE}'..."
helm registry logout public.ecr.aws 2>/dev/null || true

helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter \
  --version "$KARPENTER_VERSION" \
  --namespace "$KARPENTER_NAMESPACE" \
  --create-namespace \
  --set "settings.clusterName=${CLUSTER_NAME}" \
  --set "settings.interruptionQueue=${CLUSTER_NAME}" \
  --set controller.resources.requests.cpu=100m \
  --set controller.resources.requests.memory=256Mi \
  --set controller.resources.limits.cpu=500m \
  --set controller.resources.limits.memory=512Mi \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="$KARPENTER_ROLE_ARN" \
  --wait

echo "  ✅ Karpenter controller deployed."

# 7. Apply NodePool and EC2NodeClass
echo -e "\n[7/8] Applying Karpenter NodePool & EC2NodeClass..."
sed -e "s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" "${SCRIPT_DIR}/manifests/karpenter-nodepool.yaml" > "${SCRIPT_DIR}/generated-nodepool.yaml"
kubectl apply -f "${SCRIPT_DIR}/generated-nodepool.yaml"

# 8. Deploy Karpenter Pulse & Test Workload
echo -e "\n[8/8] Deploying Karpenter Pulse..."
SQS_URL="https://sqs.${AWS_REGION}.amazonaws.com/${ACCOUNT_ID}/${CLUSTER_NAME}"
helm upgrade --install karpenter-pulse "${SCRIPT_DIR}/../helm" \
  --namespace karpenter-pulse \
  --create-namespace \
  --set backend.config.awsRegion="$AWS_REGION" \
  --set backend.config.clusterName="$CLUSTER_NAME" \
  --set backend.config.karpenterNamespace="$KARPENTER_NAMESPACE" \
  --set backend.config.sqsQueueUrl="$SQS_URL" \
  --wait

kubectl apply -f "${SCRIPT_DIR}/manifests/workload-inflate.yaml"

echo -e "\n============================================================"
echo "   🎉 Karpenter Pulse Test Environment is READY!            "
echo "============================================================"
echo ""
echo "Next Steps:"
echo "1. Port-forward Karpenter Pulse Dashboard:"
echo "   kubectl port-forward -n karpenter-pulse svc/karpenter-pulse-web 8080:80"
echo "   Open: http://localhost:8080"
echo ""
echo "2. Trigger Autoscaling Test (Launch 5 Spot instances):"
echo "   ./test/test-scale.sh 5"
echo ""
echo "3. Scale Down & Consolidate:"
echo "   ./test/test-scale.sh 0"
echo ""
echo "4. Cleanup all AWS resources:"
echo "   ./test/cleanup.sh $CLUSTER_NAME $AWS_REGION"
