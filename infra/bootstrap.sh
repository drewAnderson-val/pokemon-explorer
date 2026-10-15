#!/usr/bin/env bash
# One-time setup for the GCP project: everything Pulumi and GitHub Actions need
# before `pulumi up` can run. Safe to re-run; existing resources are skipped.
#
#   ./infra/bootstrap.sh
#
# Prints the GitHub repository variables to set at the end.
set -euo pipefail

PROJECT=finny-take-home
REGION=us-central1
GITHUB_REPO=drewAnderson-val/pokemon-explorer
STATE_BUCKET="${PROJECT}-pulumi-state"
DEPLOYER=github-deployer
POOL=github
PROVIDER=github-oidc

DEPLOYER_EMAIL="${DEPLOYER}@${PROJECT}.iam.gserviceaccount.com"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

gcloud services enable --project="$PROJECT" \
  run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

# Pulumi state backend
if ! gcloud storage buckets describe "gs://${STATE_BUCKET}" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${STATE_BUCKET}" --project="$PROJECT" \
    --location="$REGION" --uniform-bucket-level-access
  gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning
fi

# Service account GitHub Actions impersonates
if ! gcloud iam service-accounts describe "$DEPLOYER_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$DEPLOYER" --project="$PROJECT" \
    --display-name="GitHub Actions deployer"
fi

for role in roles/run.admin roles/artifactregistry.admin \
  roles/iam.serviceAccountAdmin roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT" --condition=None --quiet \
    --member="serviceAccount:${DEPLOYER_EMAIL}" --role="$role" >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://${STATE_BUCKET}" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role=roles/storage.objectAdmin >/dev/null

# Keyless auth: GitHub OIDC tokens from this repo only
if ! gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT" \
    --location=global --display-name="GitHub Actions"
fi
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT" \
  --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$PROJECT" \
    --location=global --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}'"
fi

POOL_ID="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" --project="$PROJECT" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GITHUB_REPO}" >/dev/null

cat <<EOF

Bootstrap complete. GitHub repository variables:
  GCP_WORKLOAD_IDENTITY_PROVIDER=${POOL_ID}/providers/${PROVIDER}
  GCP_SERVICE_ACCOUNT=${DEPLOYER_EMAIL}
  PULUMI_BACKEND_URL=gs://${STATE_BUCKET}
EOF
