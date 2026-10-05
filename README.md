# Karpenter Pulse

Karpenter Pulse is a real-time visualization dashboard and monitor for Kubernetes clusters utilizing **Karpenter** for node autoscaling. It provides a visual overview of NodePools, EC2NodeClasses, NodeClaims, standard cluster nodes, and pending/unschedulable pods.

The project is structured as a decoupled microservices architecture (React UI frontend + Go API backend) packaged and deployed via a single, unified **Helm Chart**.

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
helm repo add karpenter-pulse https://igorkurylo1988.github.io/karpenter-pulse/
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
helm install karpenter-pulse oci://europe-north1-docker.pkg.dev/<PROJECT_ID>/karpenter-pulse/karpenter-pulse \
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
    repository: europe-north1-docker.pkg.dev/<PROJECT_ID>/karpenter-pulse/server
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

  config:
    awsRegion: "us-east-1"
    sqsQueueUrl: ""
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
    repository: europe-north1-docker.pkg.dev/<PROJECT_ID>/karpenter-pulse/ui
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
