# Karpenter Pulse AWS EKS Testing & CI/CD Suite

This directory contains the automation suite to deploy and validate **Karpenter Pulse** alongside **Karpenter v1** on an active **Amazon EKS** cluster.

You can trigger this test directly from **GitHub Actions** (using AWS IAM OIDC federation) or execute it manually using bash scripts.

---

## 🚀 1. Trigger via GitHub Actions (Recommended)

A workflow is configured at [`.github/workflows/aws-test-karpenter.yaml`](../.github/workflows/aws-test-karpenter.yaml) using the AWS IAM role:
```
arn:aws:iam::670412093381:role/github-actions
```

### How to Run:
1. Navigate to the **Actions** tab in your GitHub repository.
2. Select the **AWS EKS Karpenter Test** workflow on the left sidebar.
3. Click **Run workflow**:
   - **Action**: 
     - `deploy-and-test`: Spins up the CloudFormation IAM stack, EKS cluster, installs Karpenter v1 and Karpenter Pulse, and executes an autoscaling test.
     - `create-nodegroup`: Spins up the EKS managed worker nodes (e.g. `t3.micro`) if an existing cluster has 0 nodes.
     - `test-scale`: Triggers a workload scale-up or scale-down on an existing cluster.
     - `cleanup`: Destroys the EKS cluster, node groups, IAM roles, SQS queues, and EventBridge rules to avoid costs.
   - **Cluster Name**: `karpenter-pulse-test` (default)
   - **AWS Region**: `eu-west-1` (default, or select `il-central-1`)
   - **Karpenter Version**: `1.14.1` (default)
   - **Inflate Replicas**: `5` (default)

---

## 🏗️ 2. What the Automation Builds

The workflow and scripts automate:
1. **IAM Infrastructure (CloudFormation):**
   - `KarpenterNodeRole-${CLUSTER_NAME}`: Worker node role with `AmazonEKSWorkerNodePolicy`, `AmazonEKS_CNI_Policy`, `AmazonEC2ContainerRegistryReadOnly`, and `AmazonSSMManagedInstanceCore`.
   - `KarpenterControllerPolicy-${CLUSTER_NAME}`: EC2 controller policy for dynamic instance provisioning, fleet management, and pricing queries.
   - **Interruption Queue & EventBridge Rules:** SQS queue and EventBridge triggers for Spot Interruption warnings, Rebalance recommendations, and EC2 health notifications.
2. **Amazon EKS Cluster (`eksctl`):**
   - Kubernetes version `1.31` with IAM OIDC provider enabled.
   - Subnets and security groups tagged with `karpenter.sh/discovery: ${CLUSTER_NAME}`.
   - **EKS Access Entries** (`API_AND_CONFIG_MAP`) mapping `KarpenterNodeRole` as `EC2_LINUX`.
   - Small managed node group (`system-nodes`: 2 × `t3.micro`, Free Tier eligible) to host CoreDNS, Karpenter controller, and Karpenter Pulse.
3. **Karpenter v1 Controller & CRDs:**
   - Deployed via official Helm OCI (`oci://public.ecr.aws/karpenter/karpenter`).
   - `NodePool` & `EC2NodeClass` targeting Spot & On-Demand instances with AL2023.
4. **Karpenter Pulse Application:**
   - Deployed via the local Helm chart (`helm/`).
   - Connects live to Kubernetes Informers, AWS EC2, and Karpenter Controller logs.
5. **Autoscaling Test Workload:**
   - `inflate` pause deployment used to trigger Karpenter scale-up and scale-down.

---

## 💻 3. Running Locally via Bash (Optional)

If running locally (Linux, macOS, WSL, or Git Bash), ensure you have `aws`, `eksctl`, `kubectl`, and `helm` installed.

### Prerequisites Check & Setup:
```bash
# Ensure AWS credentials are authenticated:
aws sts get-caller-identity

cd test
chmod +x *.sh
```

### Deploy Cluster & Applications:
```bash
./deploy.sh karpenter-pulse-test eu-west-1 1.2.0
# Or for Israel region:
# ./deploy.sh karpenter-pulse-test il-central-1 1.2.0
```

### Access Karpenter Pulse UI:
```bash
kubectl port-forward -n karpenter-pulse svc/karpenter-pulse-web 8080:80
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

### Test Autoscaling (Scale to 5 Replicas):
```bash
./test-scale.sh 5
```
Watch Karpenter provision new EC2 Spot instances in seconds and observe the live log stream, NodeClaims, and FinOps savings in the Karpenter Pulse UI.

### Scale Down & Test Consolidation:
```bash
./test-scale.sh 0
```
Karpenter will detect the idle nodes and terminate them after the consolidation timer (`1m`).

### Teardown & Clean Up:
```bash
./cleanup.sh karpenter-pulse-test eu-west-1
# Or for Israel region:
# ./cleanup.sh karpenter-pulse-test il-central-1
```
This tears down all EKS, EC2, and IAM resources to ensure $0 lingering AWS costs.
