<#
.SYNOPSIS
    Deploys a complete AWS EKS test environment with Karpenter v1 and Karpenter Pulse.

.DESCRIPTION
    Automates:
    1. Prerequisites check (AWS CLI, eksctl, kubectl, Helm).
    2. AWS credentials & region configuration.
    3. IAM CloudFormation stack (Node role, controller policy, SQS queue, EventBridge rules).
    4. EKS cluster creation with OIDC and discovery tags using eksctl.
    5. Access Entry registration for Karpenter worker nodes.
    6. Karpenter Controller IRSA role.
    7. Karpenter v1 Helm chart deployment.
    8. Default NodePool & EC2NodeClass CRDs.
    9. Karpenter Pulse deployment (Brain backend + Web UI).
   10. Prepares the scaling test workload.

.PARAMETER ClusterName
    Name of the EKS cluster (Default: "karpenter-pulse-test")

.PARAMETER Region
    AWS Region (Default: "us-east-1")

.PARAMETER KarpenterVersion
    Karpenter version to deploy (Default: "1.2.0")

.PARAMETER AccessKeyId
    Optional AWS Access Key ID (if not already set in environment or AWS CLI)

.PARAMETER SecretAccessKey
    Optional AWS Secret Access Key (if not already set in environment or AWS CLI)
#>

[CmdletBinding()]
param(
    [string]$ClusterName = "karpenter-pulse-test",
    [string]$Region = "us-east-1",
    [string]$KarpenterVersion = "1.2.0",
    [string]$AccessKeyId = "",
    [string]$SecretAccessKey = ""
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   🚀 Karpenter Pulse: AWS EKS & Karpenter Test Environment  " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# 1. Prerequisites Check
# -----------------------------------------------------------------------------
Write-Host "`n[1/8] Verifying required CLI tools..." -ForegroundColor Yellow

$missingTools = @()

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    $missingTools += "aws (AWS CLI v2 - https://aws.amazon.com/cli/)"
}
if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    $missingTools += "helm (Helm v3 - https://helm.sh/docs/intro/install/)"
}
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    $missingTools += "kubectl (Kubernetes CLI - run: winget install -e --id Kubernetes.kubectl)"
}
if (-not (Get-Command eksctl -ErrorAction SilentlyContinue)) {
    $missingTools += "eksctl (EKS CLI - run: winget install -e --id eksctl.eksctl)"
}

if ($missingTools.Count -gt 0) {
    Write-Host "`n❌ Missing required tools:" -ForegroundColor Red
    foreach ($tool in $missingTools) {
        Write-Host "   - $tool" -ForegroundColor Red
    }
    Write-Host "`nTip: On Windows, you can install the missing tools using Winget:" -ForegroundColor Cyan
    Write-Host "   winget install -e --id Kubernetes.kubectl" -ForegroundColor Gray
    Write-Host "   winget install -e --id eksctl.eksctl" -ForegroundColor Gray
    exit 1
}

Write-Host "  ✅ All tools found (aws, helm, kubectl, eksctl)." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 2. AWS Credentials & Authentication
# -----------------------------------------------------------------------------
Write-Host "`n[2/8] Checking AWS authentication..." -ForegroundColor Yellow

if ($AccessKeyId -and $SecretAccessKey) {
    $env:AWS_ACCESS_KEY_ID = $AccessKeyId
    $env:AWS_SECRET_ACCESS_KEY = $SecretAccessKey
    $env:AWS_DEFAULT_REGION = $Region
    $env:AWS_REGION = $Region
}

try {
    $callerIdentityJson = aws sts get-caller-identity --output json 2>$null
    if (-not $callerIdentityJson) { throw "Unable to get caller identity" }
    $callerIdentity = $callerIdentityJson | ConvertFrom-Json
    $AccountId = $callerIdentity.Account
    Write-Host "  ✅ Authenticated as: $($callerIdentity.Arn)" -ForegroundColor Green
    Write-Host "  ✅ AWS Account ID:   $AccountId" -ForegroundColor Green
    Write-Host "  ✅ Target Region:    $Region" -ForegroundColor Green
    Write-Host "  ✅ Target Cluster:   $ClusterName" -ForegroundColor Green
} catch {
    Write-Host "`n❌ AWS credentials not active or invalid." -ForegroundColor Red
    Write-Host "Please provide credentials either by running:" -ForegroundColor Yellow
    Write-Host "   aws configure" -ForegroundColor Gray
    Write-Host "Or by passing parameters to this script:" -ForegroundColor Yellow
    Write-Host "   .\deploy.ps1 -AccessKeyId 'AKIA...' -SecretAccessKey 'wJalr...' -Region '$Region'" -ForegroundColor Gray
    exit 1
}

# -----------------------------------------------------------------------------
# 3. Deploy IAM CloudFormation Stack
# -----------------------------------------------------------------------------
$stackName = "Karpenter-$ClusterName"
Write-Host "`n[3/8] Deploying IAM stack via CloudFormation ($stackName)..." -ForegroundColor Yellow

$cfnTemplate = Join-Path $PSScriptRoot "iam-cloudformation.yaml"
if (-not (Test-Path $cfnTemplate)) {
    Write-Host "❌ Could not find $cfnTemplate" -ForegroundColor Red
    exit 1
}

aws cloudformation deploy `
    --stack-name $stackName `
    --template-file $cfnTemplate `
    --parameter-overrides ClusterName=$ClusterName `
    --capabilities CAPABILITY_NAMED_IAM `
    --region $Region

Write-Host "  ✅ CloudFormation stack deployed successfully." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 4. Provision EKS Cluster via eksctl
# -----------------------------------------------------------------------------
Write-Host "`n[4/8] Checking EKS cluster status ($ClusterName)..." -ForegroundColor Yellow

$clusterCheck = aws eks describe-cluster --name $ClusterName --region $Region 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Cluster '$ClusterName' does not exist yet. Creating via eksctl (this takes ~10-15 minutes)..." -ForegroundColor Cyan
    
    $clusterTemplatePath = Join-Path $PSScriptRoot "cluster-template.yaml"
    $generatedClusterPath = Join-Path $PSScriptRoot "generated-cluster.yaml"
    
    $clusterConfig = Get-Content $clusterTemplatePath -Raw
    $clusterConfig = $clusterConfig.Replace('${CLUSTER_NAME}', $ClusterName)
    $clusterConfig = $clusterConfig.Replace('${AWS_REGION}', $Region)
    $clusterConfig = $clusterConfig.Replace('${AWS_ACCOUNT_ID}', $AccountId)
    Set-Content -Path $generatedClusterPath -Value $clusterConfig -Force

    eksctl create cluster -f $generatedClusterPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to create cluster via eksctl." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ✅ Cluster '$ClusterName' is already running." -ForegroundColor Green
}

# Update local kubeconfig
aws eks update-kubeconfig --name $ClusterName --region $Region

# Ensure Access Entry for Karpenter Worker Nodes
Write-Host "  Ensuring EKS Access Entry for Karpenter node role..." -ForegroundColor Gray
$nodeRoleArn = "arn:aws:iam::${AccountId}:role/KarpenterNodeRole-${ClusterName}"
aws eks create-access-entry `
    --cluster-name $ClusterName `
    --principal-arn $nodeRoleArn `
    --type EC2_LINUX `
    --region $Region 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Access entry created for $nodeRoleArn" -ForegroundColor Green
} else {
    Write-Host "  ℹ️ Access entry already registered." -ForegroundColor Gray
}

# -----------------------------------------------------------------------------
# 5. Create Karpenter Controller IAM ServiceAccount Role (IRSA)
# -----------------------------------------------------------------------------
Write-Host "`n[5/8] Configuring Karpenter Controller IRSA..." -ForegroundColor Yellow

$controllerRoleName = "KarpenterControllerRole-$ClusterName"
$controllerPolicyArn = "arn:aws:iam::${AccountId}:policy/KarpenterControllerPolicy-$ClusterName"

eksctl create iamserviceaccount `
    --cluster $ClusterName `
    --name karpenter `
    --namespace karpenter `
    --role-name $controllerRoleName `
    --attach-policy-arn $controllerPolicyArn `
    --role-only `
    --approve `
    --region $Region 2>$null

Write-Host "  ✅ Karpenter Controller IRSA role ready: arn:aws:iam::${AccountId}:role/$controllerRoleName" -ForegroundColor Green

# -----------------------------------------------------------------------------
# 6. Install Karpenter v1 Helm Chart
# -----------------------------------------------------------------------------
Write-Host "`n[6/8] Installing Karpenter v$KarpenterVersion via Helm..." -ForegroundColor Yellow

# Authenticate Helm to ECR Public
aws ecr-public get-login-password --region us-east-1 2>$null | helm registry login --username AWS --password-stdin public.ecr.aws 2>$null

helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter `
    --version $KarpenterVersion `
    --namespace karpenter `
    --create-namespace `
    --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=arn:aws:iam://${AccountId}:role/$controllerRoleName" `
    --set "settings.clusterName=$ClusterName" `
    --set "settings.interruptionQueue=$ClusterName" `
    --wait

Write-Host "  ✅ Karpenter controller deployed." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 7. Apply Default NodePool and EC2NodeClass CRDs
# -----------------------------------------------------------------------------
Write-Host "`n[7/8] Applying Karpenter NodePool & EC2NodeClass..." -ForegroundColor Yellow

$nodepoolTemplate = Join-Path $PSScriptRoot "manifests/karpenter-nodepool.yaml"
$generatedNodepool = Join-Path $PSScriptRoot "generated-nodepool.yaml"

$npContent = Get-Content $nodepoolTemplate -Raw
$npContent = $npContent.Replace('${CLUSTER_NAME}', $ClusterName)
Set-Content -Path $generatedNodepool -Value $npContent -Force

kubectl apply -f $generatedNodepool
Write-Host "  ✅ Karpenter NodePool and EC2NodeClass registered." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 8. Deploy Karpenter Pulse & Test Workload
# -----------------------------------------------------------------------------
Write-Host "`n[8/8] Deploying Karpenter Pulse (Brain + Web UI)..." -ForegroundColor Yellow

$helmDir = Join-Path $PSScriptRoot "..\helm"
$sqsUrl = "https://sqs.${Region}.amazonaws.com/${AccountId}/${ClusterName}"

helm upgrade --install karpenter-pulse $helmDir `
    --namespace karpenter-pulse `
    --create-namespace `
    --set backend.config.awsRegion="$Region" `
    --set backend.config.clusterName="$ClusterName" `
    --set backend.config.karpenterNamespace="karpenter" `
    --set backend.config.sqsQueueUrl="$sqsUrl" `
    --wait

# Deploy inflate workload manifest (starts at 0 replicas)
$workloadManifest = Join-Path $PSScriptRoot "manifests/workload-inflate.yaml"
kubectl apply -f $workloadManifest

Write-Host "  ✅ Karpenter Pulse and Test Workload deployed!" -ForegroundColor Green

# -----------------------------------------------------------------------------
# Summary & Next Steps
# -----------------------------------------------------------------------------
Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "   🎉 Karpenter Pulse Test Environment is READY!            " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Write-Host @"

Next Steps:

1. Open the Karpenter Pulse Dashboard:
   Run in a separate PowerShell window:
   kubectl port-forward -n karpenter-pulse svc/karpenter-pulse-web 8080:80

   Then open in your browser:
   http://localhost:8080

2. Trigger a Live Autoscaling Test:
   .\test-scale.ps1 -Replicas 5

   Watch Karpenter immediately launch Spot instances to satisfy pending pods,
   and see the NodeClaims, live logs, and savings appear live in the UI!

3. Scale Down & Consolidate:
   .\test-scale.ps1 -Replicas 0

4. Clean Up AWS Resources (avoid extra charges):
   .\cleanup.ps1 -ClusterName "$ClusterName" -Region "$Region"

"@ -ForegroundColor Cyan
