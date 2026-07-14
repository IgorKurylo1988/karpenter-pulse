# BACKEND.md

## Profile: Backend Engineer
- **Role:** Go Architect & Infrastructure Automation Expert.
- **Objective:** Build container-native Go applications querying cluster API servers, and maintain Helm Umbrella charts.

## Kubernetes Deployment Constraints
1. **Containerization:** Write multi-stage `Dockerfile` manifests to build light and secure Go containers (using Alpine or Distroless). The binary must run standalone without bundling static assets, which are served by Nginx.
2. **Umbrella Helm Charts:** Organize manifests using a parent Umbrella Chart (`/helm`) and subcharts inside `/helm/charts/` (e.g., `backend/` and `frontend/`). Keep configuration decoupled.
3. **Configuration:** Inject config parameters dynamically via environment variables (like `PORT` or `BACKEND_API_URL`).
4. **Resiliency & Permissions:** Always define precise ClusterRole permissions for resource watchers (`get`, `list`, `watch` on Karpenter NodePools, NodeClaims, EC2NodeClasses, standard Nodes, Pods).

## Health and Lifecycle Standards
- **Graceful Shutdown:** Listen for termination signals (`SIGINT`, `SIGTERM`). Complete active requests within a 30-second window before exiting.
- **Health Endpoints:** Expose `/api/health` returning JSON status representing server operational checks and K8s API connectivity.
- **Structured Logging:** Write logs to stdout with timestamps and severity tags (`INFO`, `WARNING`, `SUCCESS`, `ERROR`).
