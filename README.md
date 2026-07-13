# Karpenter Pulse

Karpenter Pulse is a real-time visualization dashboard and monitor for Kubernetes clusters utilizing **Karpenter** for node autoscaling. It provides a visual overview of NodePools, EC2NodeClasses, NodeClaims, standard cluster nodes, and pending/unschedulable pods.

The project is structured as a decoupled microservices architecture with a parent **Helm Umbrella Chart** orchestrating deployment.

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
├── helm/                 # Parent Helm Umbrella Chart
│   ├── Chart.yaml        # Umbrella configuration
│   ├── values.yaml       # Override configurations for frontend & backend subcharts
│   └── charts/           # Decoupled subcharts
│       ├── frontend/     # Nginx UI subchart (Deployment, Service, Ingress)
│       └── backend/      # Go API subchart (Deployment, Service, RBAC)
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

## Helm Umbrella Chart

The main Helm Chart (`/helm`) operates as an **Umbrella Chart**, referencing and orchestrating two independent subcharts located in the `charts/` folder:

1. **`frontend` Subchart** (`helm/charts/frontend`): Deploys the Nginx container, creates a Service, and optionally binds an Ingress controller.
2. **`backend` Subchart** (`helm/charts/backend`): Deploys the Go binary container, configures readiness/liveness probes, and creates standard Kubernetes Cluster-wide RBAC permissions.

### Customizing Subcharts via Umbrella values.yaml
You can override any subchart value from the root `helm/values.yaml` file:
```yaml
frontend:
  replicaCount: 2
  image:
    repository: myregistry/karpenter-pulse-ui
    tag: v1.0.0
backend:
  replicaCount: 2
  image:
    repository: myregistry/karpenter-pulse-backend
    tag: v1.0.0
```

### Installation
Deploy the entire stack with a single command:
```bash
helm upgrade --install karpenter-pulse ./helm -n karpenter --create-namespace
```
This automatically deploys both subcharts, bindings, and permissions inside the `karpenter` namespace.
