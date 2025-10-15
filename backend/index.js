const express = require('express');
const { BigQuery } = require('@google-cloud/bigquery');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');

const app = express();
app.use(express.json());

// IMPROVED: More specific CORS configuration for better security.
// This is a dynamic way to get the frontend's expected URL.
const { CLOUD_RUN_HASH, CLOUD_RUN_REGION } = (() => {
    const serviceName = process.env.K_SERVICE || '';
    if (serviceName.includes('-')) {
        const parts = serviceName.split('-');
        return {
            CLOUD_RUN_HASH: parts[parts.length - 2],
            CLOUD_RUN_REGION: parts[parts.length - 1],
        };
    }
    return {};
})();

const frontendUrl = CLOUD_RUN_HASH && CLOUD_RUN_REGION
    ? `https://data-explorer-frontend-${CLOUD_RUN_HASH}-${CLOUD_RUN_REGION}.a.run.app`
    : null;

const corsOptions = {
    origin: frontendUrl || 'http://localhost:3000', // Fallback for local dev
};

app.use(cors(corsOptions));


const bigquery = new BigQuery();
const auth = new GoogleAuth();

const BQ_PROJECT = process.env.GCP_PROJECT || bigquery.projectId;
const BQ_DATASET = 'data_explorer_config';
const BQ_TABLE = 'entities';
const FUNCTION_URL = process.env.FUNCTION_URL;

if (!FUNCTION_URL) {
    console.warn("FATAL: FUNCTION_URL environment variable is not set. The query proxy will not work.");
}

const CONFIG_TABLE = `\`${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\``;

// No-op middleware. IAP handles authentication. The user's identity is in the
// 'x-goog-authenticated-user-email' header, which can be used for authorization.
const checkAuth = (req, res, next) => {
    // Example: console.log('Authenticated user:', req.header('x-goog-authenticated-user-email'));
    next();
};

app.get('/api/config', checkAuth, async (req, res) => {
    try {
        const query = `SELECT * FROM ${CONFIG_TABLE} ORDER BY display_name`;
        const [rows] = await bigquery.query(query);
        res.status(200).json(rows);
    } catch (error) {
        console.error('ERROR fetching config:', error);
        res.status(500).json({ error: 'Failed to fetch configuration from BigQuery.' });
    }
});

app.post('/api/config', checkAuth, async (req, res) => {
    const { entity_name, display_name, source_of_system, source_details } = req.body;
    if (!entity_name || !display_name || !source_of_system || !source_details) {
        return res.status(400).json({ error: 'Missing required fields: entity_name, display_name, source_of_system, source_details.' });
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
        if (error.code === 6) { // ALREADY_EXISTS
            return res.status(409).json({ error: `Configuration entity '${entity_name}' already exists.` });
        }
        res.status(500).json({ error: 'Failed to create configuration entity.' });
    }
});

app.put('/api/config/:entity_name', checkAuth, async (req, res) => {
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
                entity_name,
                display_name,
                source_of_system,
                source_details_json: JSON.stringify(source_details),
            },
        };

        const [job] = await bigquery.query(options);
        if (job.numDmlAffectedRows === '0') {
             return res.status(404).json({ error: `Entity '${entity_name}' not found.`});
        }
        res.status(200).json({ message: `Entity '${entity_name}' updated successfully.`});
    } catch (error) {
        console.error(`ERROR updating config for ${entity_name}:`, error);
        res.status(500).json({ error: 'Failed to update configuration entity.' });
    }
});

app.delete('/api/config/:entity_name', checkAuth, async (req, res) => {
    const { entity_name } = req.params;
    try {
        const query = `DELETE FROM ${CONFIG_TABLE} WHERE entity_name = @entity_name`;
        const options = { query: query, params: { entity_name } };

        const [job] = await bigquery.query(options);
        if (job.numDmlAffectedRows === '0') {
            return res.status(404).json({ error: `Entity '${entity_name}' not found.`});
        }
        res.status(204).send();
    } catch (error) {
        console.error(`ERROR deleting config for ${entity_name}:`, error);
        res.status(500).json({ error: 'Failed to delete configuration entity.' });
    }
});

// Proxy endpoint for querying data
app.post('/api/query', checkAuth, async (req, res) => {
    const { entity, query } = req.body;

    if (!entity || !query) {
        return res.status(400).json({ error: 'Invalid payload. "entity" and "query" are required.' });
    }

    if (entity.source_of_system === 'SCM-BQ') {
        if (!FUNCTION_URL) {
            return res.status(500).json({ error: 'Query function URL is not configured on the backend.' });
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

            const client = await auth.getIdTokenClient(FUNCTION_URL);
            const response = await client.request({
                url: FUNCTION_URL,
                method: 'POST',
                data: functionPayload,
                headers: { 'Content-Type': 'application/json' }
            });

            res.status(response.status).json(response.data);
        } catch (error) {
            console.error('Error proxying to Cloud Function:', error.response ? error.response.data : error.message);
            const status = error.response ? error.response.status : 500;
            const data = error.response ? error.response.data : { error: 'Failed to execute BigQuery query via proxy.' };
            res.status(status).json(data);
        }
    }
    // The prompt mentions Apigee for SAP-BW but provides no implementation details.
    // This is a placeholder for that functionality.
    else if (entity.source_of_system === 'SAP-BW') {
        res.status(501).json({ error: "SAP-BW querying is not implemented yet." });
    }
    else {
        return res.status(400).json({ error: `Unsupported source system: ${entity.source_of_system}` });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});