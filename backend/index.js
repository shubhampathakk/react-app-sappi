const express = require('express');
const { BigQuery } = require('@google-cloud/bigquery');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const bigquery = new BigQuery();

const BQ_PROJECT = process.env.GCP_PROJECT || 'your-gcp-project-id';
const BQ_DATASET = 'data_explorer_config';
const BQ_TABLE = 'entities';

const CONFIG_TABLE = `\`${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\``;

const checkAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    console.log("Auth check passed (mock).");
    next();
};

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

app.post('/api/config', checkAuth, async (req, res) => {
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

app.put('/api/config/:entity_name', checkAuth, async (req, res) => {
    const { entity_name } = req.params;
    const { display_name, source_of_system, source_details } = req.body;
    
    if (!display_name || !source_of_system || !source_details) {
        return res.status(400).json({ error: 'Missing required fields for update.' });
    }

    try {
        const query = `
            MERGE ${CONFIG_TABLE} T
            USING (SELECT @entity_name AS entity_name) S
            ON T.entity_name = S.entity_name
            WHEN MATCHED THEN
                UPDATE SET 
                    display_name = @display_name,
                    source_of_system = @source_of_system,
                    source_details = @source_details
        `;

        const options = {
            query: query,
            params: {
                entity_name: entity_name,
                display_name: display_name,
                source_of_system: source_of_system,
                source_details: JSON.stringify(source_details),
            },
        };

        await bigquery.createQueryJob(options);
        res.status(200).json({ message: `Entity '${entity_name}' updated successfully.`});

    } catch (error) {
        console.error('ERROR updating config:', error);
        res.status(500).json({ error: 'Failed to update configuration entity.' });
    }
});

app.delete('/api/config/:entity_name', checkAuth, async (req, res) => {
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});

