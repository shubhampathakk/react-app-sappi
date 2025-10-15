const express = require('express');
const { BigQuery } = require('@google-cloud/bigquery');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// Configure CORS to allow requests from your frontend service URL
// In production, you should restrict this to the specific URL of your frontend Cloud Run service
app.use(cors());

const bigquery = new BigQuery();
const auth = new GoogleAuth();

const BQ_PROJECT = process.env.GCP_PROJECT || 'your-gcp-project-id';
const BQ_DATASET = 'data_explorer_config';
const BQ_TABLE = 'entities';
const FUNCTION_URL = process.env.FUNCTION_URL; // e.g., https://query-bigquery-....run.app

if (!FUNCTION_URL) {
    console.warn("WARNING: FUNCTION_URL environment variable is not set. Query proxy will not work.");
}

const CONFIG_TABLE = `\`${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\``;

// This middleware is no longer needed for service-to-service auth,
// as GCP validates the token before the request hits the container.
// User authentication is handled by IAP. The user's email is available in
// the 'x-goog-authenticated-user-email' header if you need it for authorization logic.
/*
const checkAuth = (req, res, next) => { ... };
*/

app.get('/api/config', async (req, res) => {
    try {
        const query = `SELECT * FROM ${CONFIG_TABLE} ORDER BY display_name`;
        const [rows] = await bigquery.query(query);
        res.status(200).json(rows);
    } catch (error) {
        console.error('ERROR fetching config:', error);
        res.status(500).json({ error: 'Failed to fetch configuration.' });
    }
});

app.post('/api/config', async (req, res) => {
    const { entity_name, display_name, source_of_system, source_details } = req.body;
    if (!entity_name || !display_name || !source_of_system || !source_details) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const newEntity = {
            entity_name,
            display_name,
            source_of_system,
            source_details: JSON.stringify(source_details),
        };
        await bigquery.dataset(BQ_DATASET).table(BQ_TABLE).insert(newEntity);
        res.status(201).json(newEntity);
    } catch (error) {
        console.error('ERROR creating config:', error);
        res.status(500).json({ error: 'Failed to create configuration entity.' });
    }
});

app.put('/api/config/:entity_name', async (req, res) => {
    const { entity_name } = req.params;
    const { display_name, source_of_system, source_details } = req.body;
    
    if (!display_name || !source_of_system || !source_details) {
        return res.status(400).json({ error: 'Missing required fields for update.' });
    }

    try {
        const query = `
            UPDATE ${CONFIG_TABLE}
            SET display_name = @display_name,
                source_of_system = @source_of_system,
                source_details = JSON @source_details_json
            WHERE entity_name = @entity_name
        `;

        const options = {
            query: query,
            params: {
                entity_name: entity_name,
                display_name: display_name,
                source_of_system: source_of_system,
                source_details_json: JSON.stringify(source_details),
            },
        };

        await bigquery.query(options);
        res.status(200).json({ message: `Entity '${entity_name}' updated successfully.`});

    } catch (error) {
        console.error('ERROR updating config:', error);
        res.status(500).json({ error: 'Failed to update configuration entity.' });
    }
});

app.delete('/api/config/:entity_name', async (req, res) => {
    const { entity_name } = req.params;

    try {
        const query = `DELETE FROM ${CONFIG_TABLE} WHERE entity_name = @entity_name`;
        const options = {
            query: query,
            params: { entity_name: entity_name },
        };
        await bigquery.query(options);
        res.status(204).send();
    } catch (error) {
        console.error('ERROR deleting config:', error);
        res.status(500).json({ error: 'Failed to delete configuration entity.' });
    }
});


// NEW: Proxy endpoint for querying data
app.post('/api/query', async (req, res) => {
    const { entity, query } = req.body;

    if (!entity || !query) {
        return res.status(400).json({ error: 'Invalid payload. "entity" and "query" are required.' });
    }

    // Route to BigQuery via the secure Cloud Function
    if (entity.source_of_system === 'SCM-BQ') {
        if (!FUNCTION_URL) {
            return res.status(500).json({ error: 'Query function URL is not configured.' });
        }
        
        try {
            const sourceDetails = typeof entity.source_details === 'string' 
                ? JSON.parse(entity.source_details) 
                : entity.source_details;

            const functionPayload = {
                projectId: sourceDetails.projectId,
                datasetId: sourceDetails.datasetId,
                tableId: sourceDetails.tableId,
                ...query
            };
            
            // Get an OIDC token to authenticate the call to the Cloud Function
            const client = await auth.getIdTokenClient(FUNCTION_URL);
            
            const response = await client.request({
                url: FUNCTION_URL,
                method: 'POST',
                data: functionPayload
            });

            // Forward the response from the Cloud Function to the client
            res.status(response.status).json(response.data);

        } catch (error) {
            console.error('Error proxying to Cloud Function:', error.response ? error.response.data : error.message);
            res.status(500).json({ error: 'Failed to execute BigQuery query.' });
        }
    } 
    // Route to SAP BW via Apigee
    else if (entity.source_of_system === 'SAP-BW') {
        const sourceDetails = typeof entity.source_details === 'string' 
            ? JSON.parse(entity.source_details) 
            : entity.source_details;
        const apigeeProxyUrl = sourceDetails.apigeeUrl;

        if (!apigeeProxyUrl) {
            return res.status(400).json({ error: "Apigee proxy URL not defined for this SAP entity." });
        }
        
        try {
            // This makes a request from the Cloud Run service to Apigee.
            // You would configure Apigee to handle auth to the final SAP system.
            const response = await fetch(apigeeProxyUrl, {
                method: 'POST',
                body: JSON.stringify(query),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            res.status(response.status).json({ success: true, data: data });

        } catch(error) {
            console.error('Error proxying to Apigee:', error.message);
            res.status(500).json({ error: 'Failed to execute SAP query via Apigee.' });
        }
    } 
    else {
        return res.status(400).json({ error: `Unsupported source system: ${entity.source_of_system}` });
    }
});


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});

