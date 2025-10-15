# Hybrid Data Explorer

A modern, cloud-native web application designed to provide a seamless, secure, and user-friendly interface for business users to query data from both legacy SAP BW systems and a modern Google BigQuery data warehouse.

## Features

-   **No SQL Required**: Empowers non-technical users to build queries by selecting entities, columns, and filters from a simple UI.
-   **Hybrid Data Support**: Intelligently routes data requests to the correct source system (BigQuery or SAP) based on a centrally managed configuration table.
-   **Secure by Design**: Leverages Google Cloud's Identity-Aware Proxy (IAP) to ensure only authenticated and authorized users can access the application.
-   **Serverless & Scalable**: Built on Cloud Run and Cloud Functions, the application scales automatically to meet demand.
-   **Admin Interface**: Includes a configuration panel for administrators to manage data entities and their routing rules.

## Technology Stack

-   **Frontend**: React.js, Tailwind CSS
-   **Backend**: Node.js, Express
-   **Data Fetching**: Python on Cloud Functions (2nd Gen)
-   **Hosting**: Google Cloud Run
-   **Database**: Google BigQuery
-   **Security**: Identity-Aware Proxy (IAP) with Workforce Identity Federation
-   **Containerization**: Docker

## Project Structure

```
/
|-- backend/              # Node.js backend for config management and query proxy
|-- cloud-functions/      # Python Cloud Function for BigQuery data fetching
|-- frontend/             # React.js single-page application
|-- .gitignore
|-- README.md
```

---

## GCP Deployment Guide

This guide provides the steps to deploy the entire application to Google Cloud Platform.

### Prerequisites

1.  **Google Cloud Project**: A GCP project with billing enabled.
2.  **gcloud CLI**: The [Google Cloud SDK](https://cloud.google.com/sdk/install) installed and authenticated.
3.  **Required APIs**: Enable the following APIs in your GCP project:
    -   Cloud Build API (`cloudbuild.googleapis.com`)
    -   Cloud Run API (`run.googleapis.com`)
    -   Cloud Functions API (`cloudfunctions.googleapis.com`)
    -   BigQuery API (`bigquery.googleapis.com`)
    -   Identity-Aware Proxy API (`iap.googleapis.com`)
    -   IAM API (`iam.googleapis.com`)
4.  **Permissions**: You need roles like `Project Owner` or `Editor`, plus `Project IAM Admin` to manage permissions.
5.  **Project Info**: Replace `YOUR_PROJECT_ID` and `YOUR_REGION` (e.g., `us-central1`) in all commands.

### Phase 1: Infrastructure Setup

#### 1. Create Service Accounts

Create dedicated service accounts for the backend and the data-fetching function for security.

```bash
# Service account for the backend Cloud Run service
gcloud iam service-accounts create backend-sa --display-name="Backend Service Account"

# Service account for the data-fetching Cloud Function
gcloud iam service-accounts create data-fetcher-sa --display-name="Data Fetcher Service Account"
```

#### 2. Grant IAM Roles

-   Grant the data-fetcher service account the ability to read BigQuery data.
-   Grant the backend service account the ability to manage the BigQuery config table and invoke the Cloud Function.

```bash
# Allow the data fetcher to run BigQuery jobs and read data
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:data-fetcher-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:data-fetcher-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

# Allow the backend to edit the BigQuery configuration table
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```
*(The invoker role will be added after the function is deployed).*

#### 3. Create BigQuery Configuration Table

Create the dataset and table that will store the application's configuration.

```bash
# Create the dataset
bq --location=US mk --dataset YOUR_PROJECT_ID:data_explorer_config

# Create the table
bq mk --table YOUR_PROJECT_ID:data_explorer_config.entities \
  entity_name:STRING,display_name:STRING,source_of_system:STRING,source_details:JSON
```

### Phase 2: Backend Services Deployment

#### 1. Deploy the Data Fetcher Cloud Function

This function securely queries BigQuery.

```bash
# Navigate to the cloud-functions directory
cd cloud-functions

gcloud functions deploy query-bigquery \
  --gen2 \
  --runtime=python311 \
  --region=YOUR_REGION \
  --source=. \
  --entry-point=query_bigquery \
  --trigger-http \
  --no-allow-unauthenticated \
  --service-account="data-fetcher-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com"

# After deployment, copy the function URL. It will look like:
# [https://query-bigquery-....run.app](https://query-bigquery-....run.app)
```

#### 2. Grant Backend Invoker Permission for the Cloud Function

Allow the backend service account to securely call the data-fetching function.

```bash
gcloud functions add-invoker-policy-binding query-bigquery \
  --member="serviceAccount:backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --region=YOUR_REGION
```

#### 3. Deploy the Backend Service to Cloud Run

This service manages configuration and proxies data requests.

```bash
# Navigate to the root project directory
cd ..

# Build the container image
gcloud builds submit ./backend --tag "gcr.io/YOUR_PROJECT_ID/data-explorer-backend:latest"

# Deploy the service
# PASTE the function URL you copied in the previous step
gcloud run deploy data-explorer-backend \
  --image "gcr.io/YOUR_PROJECT_ID/data-explorer-backend:latest" \
  --service-account "backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --platform managed \
  --region YOUR_REGION \
  --set-env-vars="FUNCTION_URL=PASTE_YOUR_FUNCTION_URL_HERE" \
  --no-allow-unauthenticated
```

### Phase 3: Frontend Deployment

#### Deploy the React Frontend to Cloud Run

```bash
# Build the container image from the project root
gcloud builds submit ./frontend --tag "gcr.io/YOUR_PROJECT_ID/data-explorer-frontend:latest"

# Deploy the frontend service
gcloud run deploy data-explorer-frontend \
  --image "gcr.io/YOUR_PROJECT_ID/data-explorer-frontend:latest" \
  --platform managed \
  --region YOUR_REGION \
  --no-allow-unauthenticated
```

### Phase 4: Security with IAP

Secure both services so that only authenticated users from your organization can access them.

#### 1. Configure OAuth Consent Screen and Credentials

-   Go to **APIs & Services -> OAuth consent screen** in the Google Cloud Console.
-   Select **Internal** and fill out the required application details.
-   Go to **APIs & Services -> Credentials**. Click **Create Credentials -> OAuth client ID**.
-   Select **Web application** and add the URLs of your frontend and backend services to the **Authorized redirect URIs**. You can get these URLs from the Cloud Run dashboard.
-   Copy the **Client ID** and **Client Secret**.

#### 2. Secure BOTH Services with IAP

Run these commands for both `data-explorer-frontend` and `data-explorer-backend`.

```bash
# Secure the Frontend Service
gcloud run services update data-explorer-frontend \
  --region YOUR_REGION \
  --iap=enabled,oauth2-client-id=YOUR_OAUTH_CLIENT_ID,oauth2-client-secret=YOUR_OAUTH_CLIENT_SECRET

# Secure the Backend Service
gcloud run services update data-explorer-backend \
  --region YOUR_REGION \
  --iap=enabled,oauth2-client-id=YOUR_OAUTH_CLIENT_ID,oauth2-client-secret=YOUR_OAUTH_CLIENT_SECRET
```

#### 3. Grant Users Access via IAP

-   Go to **Security -> Identity-Aware Proxy** in the Cloud Console.
-   Find your two Cloud Run services in the list.
-   Select each one, and in the right-hand panel, click **Add Principal**.
-   Add the users, groups, or domains you want to grant access to, and assign them the **IAP-secured Web App User** role.

Your application is now fully deployed and secured. Access the URL of the `data-explorer-frontend` service to use the app.