#!/usr/bin/env bash
# ==============================================================================
# Karpenter Pulse: AWS EKS & Karpenter Test Environment Deployment Script (Bash)
# ==============================================================================

set -euo pipefail

CLUSTER_NAME="${1:-${CLUSTER_NAME:-karpenter-pulse-test}}"
AWS_REGION="${2:-${AWS_REGION:-${AWS_DEFAULT_REGION:-il-central-1}}}"
KARPENTER_VERSION="${3:-${KARPENTER_VERSION:-1.2.0}}"

echo "============================================================"
echo "   🚀 Karpenter Pulse: AWS EKS & Karpenter Test Environment  "
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Prerequisites Check
echo -e "\n[1/8] Verifying required CLI tools..."
MISSING_TOOLS=()
for tool in aws helm kubectl eksctl; do
  if ! command -v "$tool" &>/dev/null; then
    MISSING_TOOLS+=("$tool")
  fi
done

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
  echo "❌ Missing required tools: ${MISSING_TOOLS[*]}"
  echo "Please install the missing tools and try again."
  exit 1
fi
echo "  ✅ All tools found (aws, helm, kubectl, eksctl)."

# 2. AWS Credentials & Authentication
echo -e "\n[2/8] Checking AWS authentication..."
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null || true)
if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ AWS credentials not active or invalid."
  echo "Run 'aws configure' or export AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY."
  exit 1
fi

echo "  ✅ AWS Account ID: $ACCOUNT_ID"
echo "  ✅ Target Region:  $AWS_REGION"
echo "  ✅ Target Cluster: $CLUSTER_NAME"

# 3. Deploy IAM CloudFormation Stack
STACK_NAME="Karpenter-${CLUSTER_NAME}"
echo -e "\n[3/8] Deploying IAM stack via CloudFormation ($STACK_NAME)..."
aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "${SCRIPT_DIR}/iam-cloudformation.yaml" \
  --parameter-overrides ClusterName="$CLUSTER_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$AWS_REGION"

echo "  ✅ CloudFormation stack deployed successfully."

# 4. Provision EKS Cluster via eksctl
echo -e "\n[4/8] Checking EKS cluster status ($CLUSTER_NAME)..."
if ! aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" &>/dev/null; then
  echo "  Cluster '$CLUSTER_NAME' does not exist yet. Creating via eksctl (~10-15 minutes)..."
  
  sed -e "s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" \
      -e "s/\${AWS_REGION}/$AWS_REGION/g" \
      -e "s/\${AWS_ACCOUNT_ID}/$ACCOUNT_ID/g" \
      "${SCRIPT_DIR}/cluster-template.yaml" > "${SCRIPT_DIR}/generated-cluster.yaml"

  eksctl create cluster -f "${SCRIPT_DIR}/generated-cluster.yaml"
else
  echo "  ✅ Cluster '$CLUSTER_NAME' is already running."
fi

# Update kubeconfig
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

# Ensure Access Entry for Karpenter Worker Nodes
echo "  Ensuring EKS Access Entry for Karpenter node role..."
NODE_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}"
aws eks create-access-entry \
  --cluster-name "$CLUSTER_NAME" \
  --principal-arn "$NODE_ROLE_ARN" \
  --type EC2_LINUX \
  --region "$AWS_REGION" 2>/dev/null || true

# 5. Create Karpenter Controller IAM ServiceAccount Role (IRSA)
echo -e "\n[5/8] Configuring Karpenter Controller IRSA..."
CONTROLLER_ROLE_NAME="KarpenterControllerRole-${CLUSTER_NAME}"
CONTROLLER_POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/KarpenterControllerPolicy-${CLUSTER_NAME}"

eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --name karpenter \
  --namespace karpenter \
  --role-name "$CONTROLLER_ROLE_NAME" \
  --attach-policy-arn "$CONTROLLER_POLICY_ARN" \
  --role-only \
  --approve \
  --region "$AWS_REGION" 2>/dev/null || true

# 6. Install Karpenter v1 Helm Chart
echo -e "\n[6/8] Installing Karpenter v${KARPENTER_VERSION} via Helm..."
aws ecr-public get-login-password --region us-east-1 2>/dev/null | helm registry login --username AWS --password-stdin public.ecr.aws 2>/dev/null || true

helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter \
  --version "$KARPENTER_VERSION" \
  --namespace karpenter \
  --create-namespace \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=arn:aws:iam://${ACCOUNT_ID}:role/${CONTROLLER_ROLE_NAME}" \
  --set "settings.clusterName=${CLUSTER_NAME}" \
  --set "settings.interruptionQueue=${CLUSTER_NAME}" \
  --wait

# 7. Apply Default NodePool and EC2NodeClass
echo -e "\n[7/8] Applying Karpenter NodePool & EC2NodeClass..."
sed -e "s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" "${SCRIPT_DIR}/manifests/karpenter-nodepool.yaml" > "${SCRIPT_DIR}/generated-nodepool.yaml"
kubectl apply -f "${SCRIPT_DIR}/generated-nodepool.yaml"

# 8. Deploy Karpenter Pulse & Test Workload
echo -e "\n[8/8] Deploying Karpenter Pulse (Brain + Web UI)..."
SQS_URL="https://sqs.${AWS_REGION}.amazonaws.com/${ACCOUNT_ID}/${CLUSTER_NAME}"
helm upgrade --install karpenter-pulse "${SCRIPT_DIR}/../helm" \
  --namespace karpenter-pulse \
  --create-namespace \
  --set backend.config.awsRegion="$AWS_REGION" \
  --set backend.config.clusterName="$CLUSTER_NAME" \
  --set backend.config.karpenterNamespace="karpenter" \
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
echo "   ./test-scale.sh 5"
echo ""
echo "3. Scale Down & Consolidate:"
echo "   ./test-scale.sh 0"
echo ""
echo "4. Cleanup all AWS resources:"
echo "   ./cleanup.sh $CLUSTER_NAME $AWS_REGION"
