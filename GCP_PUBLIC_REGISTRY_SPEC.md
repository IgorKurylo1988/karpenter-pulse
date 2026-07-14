# GCP Public Registry and Automatic Helm Chart Versioning Specification

This document provides a guide for configuring a public Google Artifact Registry repository and details the automated semantic versioning pipeline implemented within Karpenter Pulse's GitHub Actions workflows.

---

## 1. Configuring GCP Artifact Registry for Public Read Access

By default, Google Artifact Registry repositories require authentication. To allow public access (e.g., Kubernetes cluster nodes pulling images, or Helm CLI clients pulling charts without service account keys), you must bind the **Artifact Registry Reader** role (`roles/artifactregistry.reader`) to the `allUsers` principal at the repository level.

> [!IMPORTANT]
> The public access configuration applies to all images and Helm charts stored in the selected repository. Ensure that you do not store private, sensitive, or proprietary code in this repository.

### Option A: Using the `gcloud` CLI (Recommended)

Run the following command in your terminal:

```bash
gcloud artifacts repositories add-iam-policy-binding <REPOSITORY-NAME> \
    --location=<LOCATION> \
    --member="allUsers" \
    --role="roles/artifactregistry.reader"
```

*   Replace `<REPOSITORY-NAME>` with the name of your Artifact Registry repository.
*   Replace `<LOCATION>` with the GCP region of your repository (e.g., `us-central1`, `us`).

**Example:**
```bash
gcloud artifacts repositories add-iam-policy-binding karpenter-pulse-repo \
    --location=us \
    --member="allUsers" \
    --role="roles/artifactregistry.reader"
```

### Option B: Using the Google Cloud Console

1.  Open the [Google Cloud Console](https://console.cloud.google.com/).
2.  Navigate to **Artifact Registry > Repositories**.
3.  Click the name of the target repository.
4.  If the info panel is not visible on the right side, click **Show Info Panel** in the top-right corner.
5.  In the **Permissions** tab of the info panel, click **Add Principal**.
6.  In the **New principals** field, type:
    ```text
    allUsers
    ```
7.  In the **Select a role** dropdown, select:
    *   **Artifact Registry** > **Artifact Registry Reader** (`roles/artifactregistry.reader`)
8.  Click **Save**.
9.  A confirmation dialog will warn you that the resource will be publicly accessible. Click **Allow Public Access** to confirm.

---

## 2. Setting up Google Cloud OIDC Workload Identity Federation

To allow GitHub Actions to securely push container images and Helm charts to Google Artifact Registry without using long-lived service account JSON keys, you must set up **Workload Identity Federation**.

This creates a trust relationship between GitHub and GCP, allowing GitHub Actions to exchange short-lived OIDC tokens for Google API access tokens.

### Step 1: Create the Google Cloud Service Account

Create a dedicated service account that the GitHub pipeline will assume:

```bash
gcloud iam service-accounts create "github-actions-sa" \
    --description="Service account for GitHub Actions CI/CD" \
    --display-name="GitHub Actions SA"
```

### Step 2: Grant Artifact Registry Writer Permissions

Grant this service account the permissions to build and push artifacts to your repository:

```bash
gcloud artifacts repositories add-iam-policy-binding <REPOSITORY-NAME> \
    --location=<LOCATION> \
    --member="serviceAccount:github-actions-sa@<PROJECT-ID>.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"
```

*   Replace `<PROJECT-ID>` with your Google Cloud Project ID.
*   Replace `<REPOSITORY-NAME>` and `<LOCATION>` with your repository details.

### Step 3: Create the Workload Identity Pool

Create an IAM Workload Identity Pool to manage GitHub authentication:

```bash
gcloud iam workload-identity-pools create "github-pool" \
    --location="global" \
    --display-name="GitHub Actions Pool"
```

### Step 4: Create the OIDC Workload Identity Provider

Create a provider inside the pool that trusts GitHub's token issuer:

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
    --location="global" \
    --workload-identity-pool="github-pool" \
    --display-name="GitHub Actions Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --issuer-uri="https://token.actions.githubusercontent.com"
```

### Step 5: Bind the Service Account to the GitHub Repository

Allow GitHub Actions workflows running inside your specific repository to assume the service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "github-actions-sa@<PROJECT-ID>.iam.gserviceaccount.com" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/<PROJECT-NUMBER>/locations/global/workloadIdentityPools/github-pool/attribute.repository/<GITHUB-ORGANIZATION-OR-USER>/<REPOSITORY-NAME>"
```

*   Replace `<PROJECT-NUMBER>` with your numerical GCP Project Number (e.g. `123456789012`, found in the GCP Dashboard).
*   Replace `<GITHUB-ORGANIZATION-OR-USER>/<REPOSITORY-NAME>` with your repository slug (e.g., `IgorKurylo1988/karpenter-pulse`).

### Step 6: Define GitHub Repository Secrets

Add the following secrets under **Settings > Secrets and variables > Actions** in your GitHub repository:

| GitHub Secret Name | Value Example | Description |
| :--- | :--- | :--- |
| **`GCP_SERVICE_ACCOUNT`** | `github-actions-sa@<PROJECT-ID>.iam.gserviceaccount.com` | The email address of the GCP service account created in Step 1. |
| **`GCP_WORKLOAD_IDENTITY_PROVIDER`** | `projects/<PROJECT-NUMBER>/locations/global/workloadIdentityPools/github-pool/providers/github-provider` | The full resource path of the Workload Identity Provider created in Step 4. |
| **`GCP_PROJECT_ID`** | `<PROJECT-ID>` | Your Google Cloud Project ID. |
| **`GCP_REPOSITORY`** | `<REPOSITORY-NAME>` | The name of your Artifact Registry repository. |

---

## 2. Automated Semantic Versioning Pipeline

To streamline releasing Karpenter Pulse, container image tagging is synchronized with Helm Chart version bumping.

### Pipeline Architecture Flow

```mermaid
graph TD
    A[Git Tag Pushed: v1.2.3 / Release Published] --> B[GHA: Build and Push Container Images]
    B --> C[Extract SemVer from Tag -> 1.2.3]
    C --> D[Build & Push backend + frontend Docker images to GCP]
    D --> E[Trigger Reusable Workflow: Helm Chart Release]
    E --> F[Run: bump-version.py for all Chart.yaml files]
    F --> G[Update: version to 1.0.1 and appVersion to 1.2.3]
    G --> H[Commit & Push updated files back to main [skip ci]]
    H --> I[Lint Helm Charts]
    I --> J[Package & Push Subcharts and Umbrella Chart to GCP Artifact Registry]
```

### Pipeline Components

1.  **Helper Script:** `[.github/scripts/bump-version.py](file:///C:/Users/kuryl/Documents/dev/karpenter-pulse/.github/scripts/bump-version.py)`
    *   Parses `Chart.yaml` files.
    *   Increments the **patch** portion of the chart version (e.g., `1.0.0` -> `1.0.1`).
    *   Replaces the `appVersion` field with the clean SemVer tag (e.g. `1.2.3`).
    *   Preserves comments, formatting, and structures.

2.  **Docker Workflow:** `[.github/workflows/docker-build-push.yaml](file:///C:/Users/kuryl/Documents/dev/karpenter-pulse/.github/workflows/docker-build-push.yaml)`
    *   Triggered on new tags starting with `v*` or git releases.
    *   Launches multi-arch builds (`linux/amd64`, `linux/arm64`).
    *   Runs the sequential `trigger-helm-release` job downstream.

3.  **Helm Workflow:** `[.github/workflows/helm-release.yaml](file:///C:/Users/kuryl/Documents/dev/karpenter-pulse/.github/workflows/helm-release.yaml)`
    *   Receives the tag name parameter (`tag_name`).
    *   Executes the Python bumper script on `helm/Chart.yaml` and subcharts.
    *   Commits the changes back to `main` with a `[skip ci]` flag to avoid recursive runs.
    *   Lints, packages, and pushes OCI charts to GCP.

---

## 3. Local Execution & Testing

To run the version bumper locally using Python 3:

```bash
python .github/scripts/bump-version.py <PATH-TO-CHART-YAML> <NEW-TAG>
```

**Example:**
```bash
python .github/scripts/bump-version.py helm/Chart.yaml v1.2.3
```

**Console Output:**
```text
File: helm/Chart.yaml
  Old version: 1.0.0 -> New version: 1.0.1
  Setting appVersion to: 1.2.3
```
