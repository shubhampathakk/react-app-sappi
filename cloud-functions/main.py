import functions_framework
from flask import jsonify
from google.cloud import bigquery
import re

client = bigquery.Client()

IDENTIFIER_REGEX = re.compile(r"^[a-zA-Z0-9_-]+$")
OPERATOR_REGEX = re.compile(r"^(>|>=|<|<=|=|!=|IN|NOT IN)$")

def sanitize_identifier(identifier):
    """Validates that an identifier contains only allowed characters."""
    if not IDENTIFIER_REGEX.match(identifier):
        raise ValueError(f"Invalid identifier: {identifier}")
    return identifier

def sanitize_operator(operator):
    """Validates that an operator is in the allowed list."""
    if not OPERATOR_REGEX.match(operator.upper()):
        raise ValueError(f"Invalid operator: {operator}")
    return operator.upper()

@functions_framework.http
def query_bigquery(request):
    """
    HTTP Cloud Function to query BigQuery with dynamic parameters.
    """
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = { 'Access-Control-Allow-Origin': '*' }

    if request.method != 'POST':
        return jsonify({"success": False, "error": "Method not allowed. Use POST."}), 405, headers

    request_json = request.get_json(silent=True)
    if not request_json:
        return jsonify({"success": False, "error": "Invalid JSON payload."}), 400, headers

    try:
        project_id = sanitize_identifier(request_json['projectId'])
        dataset_id = sanitize_identifier(request_json['datasetId'])
        table_id = sanitize_identifier(request_json['tableId'])
        columns = [sanitize_identifier(col) for col in request_json.get('columns', [])]
        filters = request_json.get('filters', [])
        limit = int(request_json.get('limit', 1000))

        if not columns:
            return jsonify({"success": False, "error": "At least one column must be selected."}), 400, headers
        
        if limit <= 0 or limit > 5000:
             return jsonify({"success": False, "error": "Limit must be between 1 and 5000."}), 400, headers

    except (ValueError, KeyError, TypeError) as e:
        return jsonify({"success": False, "error": f"Invalid or missing parameter: {e}"}), 400, headers

    table_ref = f"`{project_id}.{dataset_id}.{table_id}`"
    select_clause = ", ".join([f"`{col}`" for col in columns])
    query = f"SELECT {select_clause} FROM {table_ref}"
    
    query_params = []
    where_clauses = []

    if filters:
        for i, f in enumerate(filters):
            try:
                col = sanitize_identifier(f['column'])
                op = sanitize_operator(f['operator'])
                val = f['value']

                if op in ["IN", "NOT IN"]:
                    if isinstance(val, str):
                        placeholders = ", ".join([f"@param_{i}_{j}" for j in range(len(val.split(',')))])
                        where_clauses.append(f"`{col}` {op} ({placeholders})")
                        for j, v in enumerate(val.split(',')):
                           query_params.append(bigquery.ScalarQueryParameter(f'param_{i}_{j}', 'STRING', v.strip()))
                    else:
                         return jsonify({"success": False, "error": f"Value for IN/NOT IN operator must be a comma-separated string."}), 400, headers
                else:
                    where_clauses.append(f"`{col}` {op} @param_{i}")
                    param_type = "STRING"
                    if isinstance(val, bool): param_type = "BOOL"
                    elif isinstance(val, int): param_type = "INT64"
                    elif isinstance(val, float): param_type = "FLOAT64"
                    query_params.append(bigquery.ScalarQueryParameter(f'param_{i}', param_type, val))

            except (ValueError, KeyError, TypeError) as e:
                return jsonify({"success": False, "error": f"Invalid filter configuration: {e}"}), 400, headers
    
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)
        
    query += f" LIMIT {limit}"

    job_config = bigquery.QueryJobConfig(query_parameters=query_params)

    try:
        print(f"Executing query: {query}")
        query_job = client.query(query, job_config=job_config)
        results = query_job.result()
        data = [dict(row) for row in results]
        return jsonify({"success": True, "data": data}), 200, headers

    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"success": False, "error": f"BigQuery query failed: {e}"}), 500, headers

