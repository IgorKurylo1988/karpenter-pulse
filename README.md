# Karpenter Pulse

Karpenter Pulse is a real-time visualization dashboard and monitor for Kubernetes clusters utilizing **Karpenter** for node autoscaling. It provides a visual overview of NodePools, EC2NodeClasses, NodeClaims, standard cluster nodes, and pending/unschedulable pods.

The project is structured as a decoupled microservices architecture (React UI frontend + Go API backend) packaged and deployed via a single, unified **Helm Chart**.

![Karpenter Pulse Overview Dashboard](docs/images/dashboard-overview.png)

---

## Directory Structure

```text
karpenter-pulse/
├── ui/                   # Frontend SPA (React + TypeScript + Vite)
│   ├── src/              # Views, state machine, and data models
│   ├── Dockerfile        # Decoupled Nginx frontend build
│   └── nginx.conf.temp   # Nginx template for dynamic API reverse proxy
├── backend/              # Go REST API Backend
│   ├── main.go           # REST endpoints and Kubernetes client query logic
│   └── Dockerfile        # Decoupled Go binary build
├── helm/                 # Unified Helm Chart (Frontend UI, Go Backend, RBAC)
│   ├── Chart.yaml        # Chart metadata
│   ├── values.yaml       # Default deployment configurations
│   ├── index.html        # GitHub Pages Helm repository landing page
│   └── templates/        # Kubernetes resource templates
│       ├── _helpers.tpl
│       ├── kp-brain/         # Go API Backend resources
│       │   ├── configmap.yaml
│       │   ├── deployment.yaml
│       │   ├── rbac.yaml
│       │   └── service.yaml
│       └── kp-web/           # React UI Frontend resources
│           ├── deployment.yaml
│           ├── ingress.yaml
│           └── service.yaml
└── README.md             # Project documentation
```

---

## Decoupled Containers

### 1. Frontend UI (`ui/Dockerfile`)
The frontend is built using standard multi-stage builds:
- **Build Stage**: Compiles React files into `dist/`.
- **Run Stage**: Packages assets with `nginx:alpine` and loads a proxy configuration template (`nginx.conf.template`).
- **Dynamic API Routing**: Nginx uses `envsubst` to replace `${BACKEND_API_URL}` with the value of the environment variable at startup, preventing CORS issues.
- **Build command**:
  ```bash
  docker build -t karpenter-pulse-ui:latest ./ui
  ```

### 2. Go Backend (`backend/Dockerfile`)
- **Build Stage**: Compiles the Go binary.
- **Run Stage**: Packages the compiled binary inside a minimal, secure `alpine` image containing root trust-certificates to query AWS/Kubernetes APIs.
- **Build command**:
  ```bash
  docker build -t karpenter-pulse-backend:latest ./backend
  ```

---

## Helm Chart Installation

The unified Helm chart (`/helm`) deploys the complete Karpenter Pulse application suite—including the Go API backend, cluster RBAC readers, and the React UI frontend.

### Option 1: Official GitHub Pages Helm Repository (Recommended)

Add the Karpenter Pulse Helm chart repository:

```bash
helm repo add karpenter-pulse https://karpenter-pulse.kurigor.com/
helm repo update
```

Install the chart:

```bash
helm install karpenter-pulse karpenter-pulse/karpenter-pulse \
  --namespace karpenter-pulse \
  --create-namespace
```

### Option 2: OCI Registry (Google Artifact Registry)

```bash
helm install karpenter-pulse oci://europe-north1-docker.pkg.dev/karpenter-pulse/karpenter-pulse/karpenter-pulse \
  --version 1.0.0 \
  --namespace karpenter-pulse \
  --create-namespace
```

### Option 3: Local Development Installation

```bash
helm upgrade --install karpenter-pulse ./helm \
  --namespace karpenter-pulse \
  --create-namespace
```

---

## Configuration (`values.yaml`)

You can customize the deployment by passing a custom `values.yaml` file:

```bash
helm upgrade --install karpenter-pulse karpenter-pulse/karpenter-pulse \
  --namespace karpenter-pulse \
  --create-namespace \
  -f my-values.yaml
```

### Example `values.yaml`

```yaml
# Backend Configuration
backend:
  enabled: true
  replicaCount: 1

  image:
    repository: europe-north1-docker.pkg.dev/karpenter-pulse/karpenter-pulse/server
    pullPolicy: IfNotPresent
    tag: "1.0.0" # Defaults to Chart appVersion if omitted

  service:
    type: ClusterIP
    port: 4000

  # Cluster RBAC permissions to read nodes, pods, nodepools, nodeclaims
  rbac:
    create: true

  serviceAccount:
    create: true
    name: ""
    # Cloud Provider IAM Role Annotations for passwordless authentication
    annotations:
      # AWS EKS (IRSA) — grants permissions to poll SQS & query EC2 Pricing:
      eks.amazonaws.com/role-arn: "arn:aws:iam::123456789012:role/karpenter-pulse-backend"
      # Azure AKS (Workload Identity) — for Karpenter Provider on Azure:
      # azure.workload.identity/client-id: "00000000-0000-0000-0000-000000000000"
      # Google Cloud GKE (Workload Identity) — for Karpenter Provider on GCP:
      # iam.gke.io/gcp-service-account: "karpenter-pulse@PROJECT_ID.iam.gserviceaccount.com"

  config:
    awsRegion: "us-east-1"
    # SQS Queue URL for real-time AWS Spot Interruption & Rebalance notices.
    # When configured, the backend long-polls this queue, and the UI displays
    # live 2-minute countdown warnings with red pulsing alerts on affected nodes.
    # Leave empty ("") to disable SQS polling or operate in standalone simulation mode.
    sqsQueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/karpenter-pulse-spot-interruption-queue"
    clusterName: "my-cluster"
    logLevels: "INFO,SUCCESS,WARNING,ERROR"
    karpenterNamespace: "karpenter"
    karpenterLabelSelector: "app.kubernetes.io/name=karpenter"

  resources:
    limits:
      cpu: 200m
      memory: 256Mi
    requests:
      cpu: 50m
      memory: 64Mi

# Frontend Configuration
frontend:
  enabled: true
  replicaCount: 1

  image:
    repository: europe-north1-docker.pkg.dev/karpenter-pulse/karpenter-pulse/ui
    pullPolicy: IfNotPresent
    tag: "1.0.0" # Defaults to Chart appVersion if omitted

  service:
    type: ClusterIP
    port: 80

  ingress:
    enabled: false
    className: "nginx"
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
    hosts:
      - host: karpenter-pulse.example.com
        paths:
          - path: /
            pathType: ImplementationSpecific
    tls:
      - secretName: karpenter-pulse-tls
        hosts:
          - karpenter-pulse.example.com

  resources:
    limits:
      cpu: 100m
      memory: 128Mi
    requests:
      cpu: 10m
      memory: 32Mi
```

---

## Spot Interruption Queue & Cloud Provider IAM Setup

### 1. Spot Interruption Alerting (`backend.config.sqsQueueUrl`)

AWS Spot Instances provide significant cost reductions, but AWS can reclaim them at any time with a **2-minute Spot Instance Interruption Warning** or an **EC2 Rebalance Recommendation**.

Karpenter Pulse connects directly to an Amazon SQS queue to ingest these notices in real time:
- **Event Flow**: `EC2 Spot Interruption Warning` / `Rebalance Recommendation` ➔ **AWS EventBridge** ➔ **Amazon SQS Queue** ➔ **Karpenter Pulse Backend (`sqsQueueUrl`)** ➔ **React UI via WebSockets**.
- **Dashboard Experience**: When a notice is received, Karpenter Pulse immediately triggers a high-visibility red alert banner, marks the affected node with an amber/red pulsating highlight, and starts an active **2-minute countdown timer** so operators know a planned Spot interruption is taking place rather than an unexpected failure.

#### Required IAM Policy for SQS:
Attach the following IAM policy to the role assumed by Karpenter Pulse's backend service account:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KarpenterPulseSQSAccess",
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:<AWS_REGION>:<ACCOUNT_ID>:<QUEUE_NAME>"
    }
  ]
}
```

---

### 2. Multi-Cloud ServiceAccount IAM Annotations (`backend.serviceAccount.annotations`)

To authenticate securely to cloud provider APIs (such as AWS SQS, AWS Pricing API, Azure Resource Graph, or Google Cloud APIs) without hardcoding credentials, annotate the backend `ServiceAccount` with your cloud provider's Workload Identity:

#### A. AWS EKS (IRSA - IAM Roles for Service Accounts)
Binds the Kubernetes `ServiceAccount` to an AWS IAM Role via OpenID Connect (OIDC):

```yaml
backend:
  serviceAccount:
    create: true
    annotations:
      eks.amazonaws.com/role-arn: "arn:aws:iam::<ACCOUNT_ID>:role/karpenter-pulse-backend-role"
```

> **EKS Pod Identity (Alternative):** If your cluster uses AWS EKS Pod Identity instead of IRSA, keep `annotations: {}` and create an EKS Pod Identity Association using the AWS CLI or Terraform:
> ```bash
> aws eks create-pod-identity-association \
>   --cluster-name <CLUSTER_NAME> \
>   --namespace karpenter-pulse \
>   --service-account karpenter-pulse-brain \
>   --role-arn arn:aws:iam::<ACCOUNT_ID>:role/karpenter-pulse-backend-role
> ```

#### B. Azure AKS (Azure Workload Identity)
When running Karpenter Provider for Azure, bind the backend `ServiceAccount` to an Azure Managed Identity:

```yaml
backend:
  serviceAccount:
    create: true
    annotations:
      azure.workload.identity/client-id: "<AZURE_MANAGED_IDENTITY_CLIENT_ID>"
      # Optional: specify tenant ID if multi-tenant
      # azure.workload.identity/tenant-id: "<AZURE_TENANT_ID>"
```

#### C. Google Cloud GKE (GCP Workload Identity)
With Karpenter now supporting Google Cloud (Karpenter Provider for GCP), bind the Kubernetes `ServiceAccount` to a Google Service Account (GSA):

```yaml
backend:
  serviceAccount:
    create: true
    annotations:
      iam.gke.io/gcp-service-account: "karpenter-pulse-sa@<GCP_PROJECT_ID>.iam.gserviceaccount.com"
```

Ensure Workload Identity binding is configured in GCP:
```bash
gcloud iam service-accounts add-iam-policy-binding \
  karpenter-pulse-sa@<GCP_PROJECT_ID>.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:<GCP_PROJECT_ID>.svc.id.goog[karpenter-pulse/karpenter-pulse-brain]"
```

