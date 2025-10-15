Hybrid Data Explorer
A modern, self-service interface for exploring hybrid data sources on Google Cloud.

The Hybrid Data Explorer is a cloud-native web application designed to provide a seamless, secure, and user-friendly interface for business users to query data from both legacy SAP BW systems and a modern Google BigQuery data warehouse. It is built to facilitate a phased data migration by providing a single pane of glass for data exploration.

Dynamically build queries using a point-and-click interface.

Intelligently routes requests to either SAP or BigQuery based on configuration.

Securely authenticates enterprise users via Workforce Identity Federation and ADFS.

Features
No SQL Required: Empowers non-technical users to build complex queries by selecting entities, columns, and filters from a simple UI.

Hybrid Data Support: Intelligently routes data requests to the correct source system (BigQuery or SAP) based on a centrally managed configuration table.

Secure by Design: Leverages Google Cloud's Identity-Aware Proxy (IAP) and IAM to ensure only authenticated and authorized users can access the application and its data.

Serverless & Scalable: Built on Cloud Run and Cloud Functions, the application scales automatically to meet demand and requires no server management.

Admin Interface: Includes a configuration panel for administrators to manage data entities and their routing rules without code changes.

Technology Stack
The Hybrid Data Explorer uses a number of powerful technologies to work properly:

React.js - A JavaScript library for building user interfaces.

Node.js & Express - For the backend-for-frontend (BFF) and configuration API.

Python - For the serverless data-fetching function.

Google Cloud Run - For hosting the containerized frontend and backend services.

Google Cloud Functions - For the secure, serverless data-fetching microservice.

Google BigQuery - As the primary cloud data warehouse.

Identity-Aware Proxy (IAP) - For securing access to the web applications.

Docker - For containerizing the applications for consistent deployment.

Nginx - As a lightweight, high-performance web server for the React frontend.

Tailwind CSS - For styling the user interface.

Project Structure
/
|-- backend/
|-- cloud-functions/
|-- frontend/
|-- README.md

Deployment
This application is designed to be deployed entirely on Google Cloud Platform. Full, step-by-step instructions are provided below.

Prerequisites
Before you begin, ensure you have the following installed and configured:

Google Cloud SDK (gcloud CLI)

Node.js and npm

Python 3.9+ and pip

Docker

Deployment Steps
This guide provides a complete, step-by-step process for deploying the application on Google Cloud Platform.

Phase 1: Core Infrastructure and Service Accounts
(This section assumes you have already created the necessary service accounts (data-fetcher-sa, backend-sa) and granted them the appropriate IAM roles as per the initial setup.)

Phase 2: Backend Services Deployment
Deploy the Python (Data Fetcher) Cloud Function
From the cloud-functions directory, run the command:

gcloud functions deploy query-bigquery \
  --gen2 \
  --runtime python311 \
  --region YOUR_REGION \
  --source . \
  --entry-point query_bigquery \
  --trigger-http \
  --no-allow-unauthenticated \
  --service-account "data-fetcher-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com"

Note: After deployment, copy the URL of this function. You will need it in the next step.

Deploy the Backend (BFF & Config) Service to Cloud Run
Build the container image from the project root:

gcloud builds submit ./backend --tag gcr.io/YOUR_PROJECT_ID/data-explorer-backend

Deploy the service, passing the function URL as an environment variable:

gcloud run deploy data-explorer-backend \
  --image gcr.io/YOUR_PROJECT_ID/data-explorer-backend \
  --service-account "backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --platform managed \
  --region YOUR_REGION \
  --set-env-vars="FUNCTION_URL=PASTE_YOUR_FUNCTION_URL_HERE" \
  --no-allow-unauthenticated

Phase 3: Workforce Identity Federation with ADFS
(This section assumes you have already configured your Workforce Pool to connect with your ADFS instance.)

Phase 4: Frontend Deployment and Security
Grant Backend SA Invoker Permission for the Cloud Function

gcloud functions add-invoker-policy-binding query-bigquery \
  --member="serviceAccount:backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --region=YOUR_REGION

Deploy the React Frontend to Cloud Run
Build the container image from the project root:

gcloud builds submit ./frontend --tag gcr.io/YOUR_PROJECT_ID/data-explorer-frontend

Deploy the frontend service:

gcloud run deploy data-explorer-frontend \
  --image gcr.io/YOUR_PROJECT_ID/data-explorer-frontend \
  --platform managed \
  --region YOUR_REGION \
  --no-allow-unauthenticated

Secure BOTH Frontend and Backend with Identity-Aware Proxy (IAP)
First, you will need an OAuth Client ID and Secret. If you haven't already, create them by following the official GCP documentation.

Secure the Frontend Service:

gcloud run services update data-explorer-frontend \
  --region YOUR_REGION \
  --iap=enabled,oauth2-client-id=YOUR_OAUTH_CLIENT_ID,oauth2-client-secret=YOUR_OAUTH_CLIENT_SECRET

Secure the Backend Service:

gcloud run services update data-explorer-backend \
  --region YOUR_REGION \
  --iap=enabled,oauth2-client-id=YOUR_OAUTH_CLIENT_ID,oauth2-client-secret=YOUR_OAUTH_CLIENT_SECRET

Phase 5: Final Configuration
Your application is now fully deployed. The IAM permissions ensure that only the backend service can invoke the data-fetching function, and IAP ensures that only authenticated workforce users can access the frontend and backend URLs.