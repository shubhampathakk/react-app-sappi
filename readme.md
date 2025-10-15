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


new content:

Hybrid Data Explorer

A modern, secure, and serverless web application designed to provide a unified, self-service interface for business users to query data from hybrid sources, including Google BigQuery and legacy SAP BW systems.

About This Project

This application solves a common challenge during a phased cloud migration: business users need a single tool to access data that lives in two different worlds. Part of the data (e.g., SCM data) has been migrated to Google BigQuery, while other data (e.g., Finance data) still resides in an on-premise SAP BW system.

The Hybrid Data Explorer provides a simple, no-SQL query builder UI where users can:

Select a "Data Entity" they want to query (e.g., "Sales Report" or "Inventory Levels").

Choose the specific columns they want to see.

Apply filters to refine their results.

Based on a central configuration table stored in BigQuery, the application's backend intelligently routes the user's request to the correct data source—either the secure BigQuery Cloud Function or an Apigee proxy for SAP—and returns the results in a clean, tabular format.

The entire application is built on a scalable, serverless Google Cloud stack and secured using Identity-Aware Proxy (IAP) to ensure only authenticated enterprise users can access it.

Architecture Diagram

This diagram shows the end-to-end flow of user authentication and data requests.

Authentication Flow:

The user's browser attempts to access the Frontend Cloud Run service.

Identity-Aware Proxy (IAP) intercepts the request.

IAP redirects the user to the Google login page to authenticate (as per Workforce Identity Federation setup).

After successful login, IAP grants the user access to the frontend.

Data Flow (BigQuery Example):

The user builds a query in the React frontend and clicks "Execute."

The browser sends an authenticated request to the Backend Cloud Run service (/api/query).

The Backend service reads its configuration from BigQuery to identify the data source.

For a "SCM-BQ" entity, the backend generates an OIDC token and calls the secure Python Cloud Function.

The Cloud Function validates all parameters, constructs a safe SQL query, and executes it against the BigQuery Data Warehouse.

The data is returned as JSON through the backend to the frontend and displayed to the user.

Technology Stack

Frontend: React.js, Tailwind CSS

Web Server: Nginx (serving the static React build)

Backend: Node.js, Express

Data Fetching: Python 2nd Gen Cloud Function

Hosting: Google Cloud Run (for Frontend and Backend)

Database: Google BigQuery (for both config data and SCM data warehouse)

Security: Identity-Aware Proxy (IAP)

Containerization: Docker

Project Structure

/
|-- backend/              # Node.js backend for config management and query proxy
|   |-- Dockerfile        # Optimized for non-root user and build cache
|   |-- index.js          # Express server with corrected CORS logic
|   |-- package.json      # Includes node-fetch and google-auth-library
|   `-- .dockerignore
|
|-- cloud-functions/      # Python Cloud Function for BigQuery data fetching
|   |-- main.py           # Secure, parameterized query builder
|   `-- requirements.txt
|
|-- frontend/             # React.js single-page application
|   |-- Dockerfile        # Optimized multi-stage build
|   |-- nginx.conf.template # Nginx config template
|   |-- entrypoint.sh     # Script to substitute $PORT at runtime
|   |-- src/
|   |   `-- App.jsx       # Main React component with corrected URL logic
|   `-- .dockerignore
|
`-- README.md             # This file


GCP Deployment Guide

This guide provides the complete, tested steps to deploy the entire application to Google Cloud Platform.

Prerequisites

GCP Project: A Google Cloud project with billing enabled.

gcloud CLI: The Google Cloud SDK installed and authenticated (gcloud auth login).

Required APIs: Enable the following APIs in your project:

Cloud Build API (cloudbuild.googleapis.com)

Cloud Run API (run.googleapis.com)

Cloud Functions API (cloudfunctions.googleapis.com)

BigQuery API (bigquery.googleapis.com)

Identity-Aware Proxy API (iap.googleapis.com)

IAM API (iam.googleapis.com)

Permissions: You must have roles like Project Owner or Project Editor, IAM Admin, and Service Account Admin.

Environment Variables: Replace these placeholders in all commands:

YOUR_PROJECT_ID: Your GCP Project ID.

YOUR_REGION: Your deployment region (e.g., us-central1).

YOUR_EMAIL_ADDRESS: The email you use to log into GCP (e.g., user@example.com).

Phase 1: Infrastructure Setup

1. Create Service Accounts

# Service account for the backend Cloud Run service
gcloud iam service-accounts create backend-sa --display-name="Backend Service Account"

# Service account for the data-fetching Cloud Function
gcloud iam service-accounts create data-fetcher-sa --display-name="Data Fetcher Service Account"


2. Grant IAM Roles

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


3. Create BigQuery Configuration Table

# Create the dataset
bq --location=US mk --dataset YOUR_PROJECT_ID:data_explorer_config

# Create the table
bq mk --table YOUR_PROJECT_ID:data_explorer_config.entities \
  entity_name:STRING,display_name:STRING,source_of_system:STRING,source_details:JSON


Phase 2: Backend Services Deployment

1. Deploy the Data Fetcher Cloud Function

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

# IMPORTANT: After deployment, copy the function URL (Trigger URL)


2. Grant Backend Invoker Permission for the Cloud Function

gcloud functions add-invoker-policy-binding query-bigquery \
  --member="serviceAccount:backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --region=YOUR_REGION


3. Deploy the Backend Service to Cloud Run

# Navigate to the root project directory
cd ..

# Build the container image
gcloud builds submit ./backend --tag "gcr.io/YOUR_PROJECT_ID/data-explorer-backend:latest"

# Deploy the service
gcloud run deploy data-explorer-backend \
  --image "gcr.io/YOUR_PROJECT_ID/data-explorer-backend:latest" \
  --service-account "backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --platform managed \
  --region YOUR_REGION \
  --set-env-vars="FUNCTION_URL=PASTE_YOUR_FUNCTION_URL_HERE" \
  --no-allow-unauthenticated \
  --ingress=all


Phase 3: Frontend Deployment

# Build the container image from the project root
gcloud builds submit ./frontend --tag "gcr.io/YOUR_PROJECT_ID/data-explorer-frontend:latest"

# Deploy the frontend service
gcloud run deploy data-explorer-frontend \
  --image "gcr.io/YOUR_PROJECT_ID/data-explorer-frontend:latest" \
  --platform managed \
  --region YOUR_REGION \
  --no-allow-unauthenticated \
  --ingress=all


Phase 4: Security with IAP

1. Configure OAuth Consent Screen

In the GCP Console, go to APIs & Services -> OAuth consent screen.

Select Internal and fill in the required app name and user support details.

2. Create OAuth 2.0 Credentials

Go to APIs & Services -> Credentials.

Click + CREATE CREDENTIALS -> OAuth client ID.

Select Web application and give it a name.

Important: Leave "Authorized redirect URIs" blank.

3. Secure BOTH Services with IAP

Run these commands to enable IAP. This is the simple, one-click method.

gcloud beta run services update data-explorer-frontend \
  --region YOUR_REGION \
  --iap

gcloud beta run services update data-explorer-backend \
  --region YOUR_REGION \
  --iap


4. Grant Users Access to the Application

This is the final and most important step. We will grant access using the command line, as the IAP UI can have delays.

# Grant access to the Frontend Service
gcloud beta iap web add-iam-policy-binding \
  --resource-type=cloud-run \
  --service=data-explorer-frontend \
  --region=YOUR_REGION \
  --member=user:YOUR_EMAIL_ADDRESS \
  --role=roles/iap.httpsResourceAccessor

# Grant access to the Backend Service
gcloud beta iap web add-iam-policy-binding \
  --resource-type=cloud-run \
  --service=data-explorer-backend \
  --region=YOUR_REGION \
  --member=user:YOUR_EMAIL_ADDRESS \
  --role=roles/iap.httpsResourceAccessor


After running these commands, wait 5-10 minutes for the permissions to propagate.

Phase 5: Test the Application

Open the URL of your data-explorer-frontend service. You should be redirected to the Google login page. After logging in, the application should load.

Troubleshooting

I get a "You don't have access" error.

This is expected! It means IAP is working. This error appears because you haven't been granted access yet.

Solution: Run the gcloud beta iap web add-iam-policy-binding commands from Phase 4, Step 4 and wait 5-10 minutes for the permissions to propagate.

My services don't appear on the main IAP Admin Page.

This is a common UI delay in the Google Cloud Console. Do not worry. The fact that you see the "You don't have access" error screen is definitive proof that IAP is enabled.

Solution: Trust the command-line tools. As long as the gcloud beta iap web add-iam-policy-binding commands succeed, your permissions will apply.

The app loads, but it's a white screen with errors in the console.

This is a CORS (Cross-Origin Resource Sharing) error. It means the frontend is being blocked from communicating with the backend.

Solution: This happens if the frontend URL is incorrect or the backend is not configured to allow it.

Verify the getBackendUrl function in frontend/src/App.jsx is correct.

Verify the corsOptions in backend/index.js is correctly configured to allow your frontend's URL.

After fixing any code, you must re-build and re-deploy both the frontend and backend services.