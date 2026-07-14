# Configuring Google Cloud OIDC Workload Identity Federation for GitHub Actions

This guide explains how to configure Google Cloud Platform (GCP) Workload Identity Federation (WIF) to allow GitHub Actions to securely build and push container images and Helm charts to Google Artifact Registry without long-lived Service Account JSON keys.

---

## 1. Secrets to Add to your GitHub Repository

Go to your repository **Settings > Secrets and variables > Actions** and create the following secrets:

| GitHub Secret Name | Example Value | Description |
| :--- | :--- | :--- |
| **`GCP_SERVICE_ACCOUNT`** | `github-actions-sa@<PROJECT-ID>.iam.gserviceaccount.com` | The email address of the GCP service account created in Step 1. |
| **`GCP_WORKLOAD_IDENTITY_PROVIDER`** | `projects/<PROJECT-NUMBER>/locations/global/workloadIdentityPools/github-pool/providers/github-provider` | The full resource path of the Workload Identity Provider created in Step 4. |
| **`GCP_PROJECT_ID`** | `<PROJECT-ID>` | Your Google Cloud Project ID. |
| **`GCP_REPOSITORY`** | `<REPOSITORY-NAME>` | The name of your Artifact Registry repository. |

---

## 2. GCP Setup Commands (Using `gcloud` CLI)

Run the following commands in your shell to create the required resources and bind permissions:

### Step 1: Create the GCP Service Account

Create a service account that the GitHub pipeline will assume:

```bash
gcloud iam service-accounts create "github-actions-sa" \
    --description="Service account for GitHub Actions CI/CD" \
    --display-name="GitHub Actions SA"
```

### Step 2: Grant Artifact Registry Writer Access

Grant the service account permissions to push images and Helm charts to your Artifact Registry:

```bash
gcloud artifacts repositories add-iam-policy-binding <REPOSITORY-NAME> \
    --location=<LOCATION> \
    --member="serviceAccount:github-actions-sa@<PROJECT-ID>.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"
```

*   *Replace `<PROJECT-ID>` with your Google Cloud Project ID.*
*   *Replace `<REPOSITORY-NAME>` and `<LOCATION>` with your repository details (e.g. location `us` or `us-central1`).*

### Step 3: Create the Workload Identity Pool

Create an identity pool to manage federated identities from GitHub:

```bash
gcloud iam workload-identity-pools create "github-pool" \
    --location="global" \
    --display-name="GitHub Actions Pool"
```

### Step 4: Create the OIDC Identity Provider

Create a provider inside the pool that trusts GitHub's token issuer:

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
    --location="global" \
    --workload-identity-pool="github-pool" \
    --display-name="GitHub Actions Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --issuer-uri="https://token.actions.githubusercontent.com"
```

### Step 5: Bind the Service Account to your GitHub Repository

Allow workflows running inside your specific GitHub repository to assume the service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "github-actions-sa@<PROJECT-ID>.iam.gserviceaccount.com" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/<PROJECT-NUMBER>/locations/global/workloadIdentityPools/github-pool/attribute.repository/IgorKurylo1988/karpenter-pulse"
```

*   *Replace `<PROJECT-ID>` with your GCP Project ID.*
*   *Replace `<PROJECT-NUMBER>` with your numerical GCP Project Number (e.g., `123456789012` found on your GCP console home dashboard).*
*   *Replace `IgorKurylo1988/karpenter-pulse` if your GitHub repository organization or name is different.*
