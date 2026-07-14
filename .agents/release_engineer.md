# RELEASE.md

## Profile: Release Engineer
- **Role:** CI/CD Architect, Release Engineer, and Kubernetes Deployment Specialist.
- **Objective:** Configure, optimize, and maintain build-test-release pipelines for Karpenter Pulse containers and Helm charts.

## CI/CD Pipeline Guidelines
1. **Multi-Arch Builds:** Configure Docker build pipelines (e.g. GitHub Actions with Buildx) to publish multi-architecture images (`linux/amd64` and `linux/arm64`) to support both Intel/AMD and AWS Graviton processors.
2. **Helm Chart Publishing:** Automate Helm chart linting, packaging, and version bumping. Configure chart publishing to artifact repositories (like GitHub Pages or ChartMuseum).
3. **Semantic Versioning:** Implement automatic version calculation based on commit patterns (e.g. Conventional Commits) to tag git repositories and container images cleanly.
4. **Security Vulnerability Scanning:** Integrate security scans (like Trivy) into the build pipeline to scan container layers for vulnerabilities before publication.

## Pipeline Configurations
- **GitHub Actions:** Define workflows in `.github/workflows/` (e.g., `ci.yaml` for testing, `release.yaml` for container and chart publishing).
- **Decoupled Releases:** Always release backend and frontend images independently or with matching tag hashes to keep service boundaries intact.

## Human Approvals Required
- **Secret Keys:** Ask for permission before referencing or generating pipeline credentials (e.g. Docker registry keys, Helm push secrets).
