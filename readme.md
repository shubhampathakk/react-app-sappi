# Hybrid Data Explorer

A modern, secure, and serverless web application designed to provide a unified, self-service interface for business users to query data from hybrid sources, including Google BigQuery and legacy SAP BW systems.

## About This Project

This application solves a common challenge during a phased cloud migration: business users need a single tool to access data that lives in two different worlds. Part of the data (e.g., SCM data) has been migrated to Google BigQuery, while other data (e.g., Finance data) still resides in an on-premise SAP BW system.

The Hybrid Data Explorer provides a simple, no-SQL query builder UI where users can:

* Select a "Data Entity" they want to query (e.g., "Sales Report" or "Inventory Levels").
* Choose the specific columns they want to see.
* Apply filters to refine their results.

Based on a central configuration table stored in BigQuery, the application's backend intelligently routes the user's request to the correct data source—either the secure BigQuery Cloud Function or an Apigee proxy for SAP—and returns the results in a clean, tabular format.

The entire application is built on a scalable, serverless Google Cloud stack and secured using Identity-Aware Proxy (IAP) to ensure only authenticated enterprise users can access it.

## Architecture Diagram


This diagram shows the end-to-end flow of user authentication and data requests.

**Authentication Flow:**

1.  The user's browser attempts to access the Frontend Cloud Run service.
2.  Identity-Aware Proxy (IAP) intercepts the request.
3.  IAP redirects the user to the Google login page to authenticate (as per Workforce Identity Federation setup).
4.  After successful login, IAP grants the user access to the frontend.

**Data Flow (BigQuery Example):**

1.  The user builds a query in the React frontend and clicks "Execute."
2.  The browser sends an IAP-authenticated request to the Backend Cloud Run service (`/api/query`).
3.  The Backend service reads its configuration from BigQuery to identify the data source.
4.  For a "SCM-BQ" entity, the backend generates an OIDC token and calls the secure Python Cloud Function.
5.  The Cloud Function validates all parameters, constructs a safe SQL query, and executes it against the BigQuery Data Warehouse.
6.  The data is returned as JSON through the backend to the frontend and displayed to the user.

## Technology Stack

* **Frontend**: React.js, Tailwind CSS
* **Web Server**: Nginx (serving the static React build)
* **Backend**: Node.js, Express
* **Data Fetching**: Python 2nd Gen Cloud Function
* **Hosting**: Google Cloud Run (for Frontend and Backend)
* **Database**: Google BigQuery (for both config data and SCM data warehouse)
* **Security**: Identity-Aware Proxy (IAP)
* **Containerization**: Docker

## Project Structure

```
/
|-- backend/              # Node.js backend for config management and query proxy
|   |-- Dockerfile
|   |-- index.js
|   |-- package.json
|   `-- .dockerignore
|
|-- cloud-functions/      # Python Cloud Function for BigQuery data fetching
|   |-- main.py
|   `-- requirements.txt
|
|-- frontend/             # React.js single-page application
|   |-- Dockerfile
|   |-- nginx.conf.template
|   |-- entrypoint.sh
|   |-- src/
|   |   `-- App.jsx
|   `-- .dockerignore
|
`-- README.md             # This file
```

## GCP Deployment Guide

This guide provides the complete, tested steps to deploy the entire application to Google Cloud Platform.

### Prerequisites

* **GCP Project**: A Google Cloud project with billing enabled.
* **gcloud CLI**: The Google Cloud SDK installed and authenticated (`gcloud auth login`).
* **Required APIs**: Enable the following APIs in your project:
    * Cloud Build API (`cloudbuild.googleapis.com`)
    * Cloud Run API (`run.googleapis.com`)
    * Cloud Functions API (`cloudfunctions.googleapis.com`)
    * BigQuery API (`bigquery.googleapis.com`)
    * Identity-Aware Proxy API (`iap.googleapis.com`)
    * IAM API (`iam.googleapis.com`)
* **Permissions**: You must have roles like `Project Owner` or `Project Editor`, `IAM Admin`, and `Service Account Admin`.
* **Environment Variables**: Replace these placeholders in all commands:
    * `YOUR_PROJECT_ID`: Your GCP Project ID.
    * `YOUR_REGION`: Your deployment region (e.g., `us-central1`).
    * `YOUR_EMAIL_ADDRESS`: The email you use to log into GCP (e.g., `user@example.com`).

---

### Phase 1: Infrastructure Setup

#### 1. Create Service Accounts

```bash
# Service account for the backend Cloud Run service
gcloud iam service-accounts create backend-sa \
  --display-name="Backend Service Account" \
  --project=YOUR_PROJECT_ID

# Service account for the data-fetching Cloud Function
gcloud iam service-accounts create data-fetcher-sa \
  --display-name="Data Fetcher Service Account" \
  --project=YOUR_PROJECT_ID
```

#### 2. Grant IAM Roles

```bash
# Allow the data fetcher to run BigQuery jobs and read data
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:data-fetcher-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:data-fetcher-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

# Allow the backend to read/write the BigQuery configuration table
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```

#### 3. Create BigQuery Configuration Table

```bash
# Create the dataset
bq --location=US mk --dataset YOUR_PROJECT_ID:data_explorer_config

# Create the table
bq mk --table YOUR_PROJECT_ID:data_explorer_config.entities \
  entity_name:STRING,display_name:STRING,source_of_system:STRING,source_details:JSON
```

---

### Phase 2: Backend Services Deployment

#### 1. Deploy the Data Fetcher Cloud Function

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
  --service-account="data-fetcher-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --project=YOUR_PROJECT_ID

# IMPORTANT: After deployment, copy the function URL (Trigger URL)
# It will look like: [https://query-bigquery-....run.app](https://query-bigquery-....run.app)
```

#### 2. Grant Backend Invoker Permission for the Cloud Function

This allows the `backend-sa` service account to call your new Cloud Function.

```bash
gcloud functions add-invoker-policy-binding query-bigquery \
  --member="serviceAccount:backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --region=YOUR_REGION \
  --project=YOUR_PROJECT_ID
```

#### 3. Deploy the Backend Service to Cloud Run

```bash
# Navigate to the root project directory
cd ..

# Build the container image
gcloud builds submit ./backend \
  --tag "gcr.io/YOUR_PROJECT_ID/data-explorer-backend:latest" \
  --project=YOUR_PROJECT_ID

# Deploy the service
# PASTE the function URL you copied in the previous step
gcloud run deploy data-explorer-backend \
  --image "gcr.io/YOUR_PROJECT_ID/data-explorer-backend:latest" \
  --service-account "backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --platform managed \
  --region YOUR_REGION \
  --set-env-vars="FUNCTION_URL=PASTE_YOUR_FUNCTION_URL_HERE" \
  --no-allow-unauthenticated \
  --ingress=all \
  --project=YOUR_PROJECT_ID
```

---

### Phase 3: Frontend Deployment

```bash
# Build the container image from the project root
gcloud builds submit ./frontend \
  --tag "gcr.io/YOUR_PROJECT_ID/data-explorer-frontend:latest" \
  --project=YOUR_PROJECT_ID

# Deploy the frontend service
gcloud run deploy data-explorer-frontend \
  --image "gcr.io/YOUR_PROJECT_ID/data-explorer-frontend:latest" \
  --platform managed \
  --region YOUR_REGION \
  --no-allow-unauthenticated \
  --ingress=all \
  --project=YOUR_PROJECT_ID
```

---

### Phase 4: Security with IAP

#### 1. Configure OAuth Consent Screen

* In the GCP Console, go to **APIs & Services -> OAuth consent screen**.
* Select **Internal** and fill in the required app name and user support details.

#### 2. Create OAuth 2.0 Credentials (if you haven't)

* Go to **APIs & Services -> Credentials**.
* Click **+ CREATE CREDENTIALS -> OAuth client ID**.
* Select **Web application** and give it a name.
* **Important**: Leave "Authorized redirect URIs" blank.

#### 3. Secure BOTH Services with IAP

Run these commands to enable IAP.

```bash
gcloud beta run services update data-explorer-frontend \
  --region YOUR_REGION \
  --iap \
  --project=YOUR_PROJECT_ID

gcloud beta run services update data-explorer-backend \
  --region YOUR_REGION \
  --iap \
  --project=YOUR_PROJECT_ID
```

#### 4. Grant Users Access to the Application

This is the final and most important step.

```bash
# Grant access to the Frontend Service
gcloud beta iap web add-iam-policy-binding \
  --resource-type=cloud-run \
  --service=data-explorer-frontend \
  --region=YOUR_REGION \
  --member=user:YOUR_EMAIL_ADDRESS \
  --role=roles/iap.httpsResourceAccessor \
  --project=YOUR_PROJECT_ID

# Grant access to the Backend Service
gcloud beta iap web add-iam-policy-binding \
  --resource-type=cloud-run \
  --service=data-explorer-backend \
  --region=YOUR_REGION \
  --member=user:YOUR_EMAIL_ADDRESS \
  --role=roles/iap.httpsResourceAccessor \
  --project=YOUR_PROJECT_ID
```

After running these commands, **wait 5-10 minutes** for the permissions to propagate.

---

### Phase 5: Test the Application

Open the URL of your `data-explorer-frontend` service. You should be redirected to the Google login page. After logging in, the application should load, and your API calls should now work.

#### Troubleshooting

* **I get a `403` "You don't have access" error.**
    * **Solution**: This is expected! It means IAP is working but you haven't been granted access yet. Run the `gcloud beta iap web add-iam-policy-binding` commands from **Phase 4, Step 4** for *both* services and wait 5-10 minutes.

* **The app loads, but I still get a `403` in the console.**
    * **Solution**: This means you have access to the frontend but not the backend. Ensure you ran the `gcloud beta iap web add-iam-policy-binding` command for the `data-explorer-backend` service.