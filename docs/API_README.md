# ParseLab API Documentation

Complete API documentation, OpenAPI specification, and Postman collection for the ParseLab text analysis service.

## Table of Contents

- [Viewing OpenAPI Documentation](#viewing-openapi-documentation)
- [Using Postman Collection](#using-postman-collection)
- [Quick Start with cURL](#quick-start-with-curl)
- [API Endpoints](#api-endpoints)
- [Security Recommendations](#security-recommendations)

## Viewing OpenAPI Documentation

### Option A: Swagger Editor (Online)

1. Go to [Swagger Editor](https://editor.swagger.io/)
2. Click **File** → **Import File**
3. Select `docs/openapi.yaml`
4. View the interactive API documentation

### Option B: Redoc CLI (Local)

```bash
# Install redoc-cli globally (optional)
npm install -g redoc-cli

# Serve the OpenAPI spec
npx redoc-cli serve docs/openapi.yaml
```

This will start a local server (usually at `http://localhost:8080`) with a beautiful, interactive API documentation.

### Option C: Swagger UI (Local)

```bash
# Install swagger-ui-dist
npm install -g swagger-ui-dist

# Serve with http-server
npx http-server -p 8080
# Then open http://localhost:8080 and point to docs/openapi.yaml
```

### Option D: Using npm script (if configured)

```bash
npm run docs:serve
```

## Using Postman Collection

### Import Collection

1. Open Postman
2. Click **Import** button (top left)
3. Select `docs/postman_collection.json`
4. The collection will appear in your workspace

### Import Environment

1. In Postman, click **Environments** (left sidebar)
2. Click **Import**
3. Select `docs/postman_environment.json`
4. Select the environment when making requests

### Using the Collection

1. **Set Environment**: Select "ParseLab Local" from the environment dropdown (top right)
2. **Update baseUrl**: If your server runs on a different port, edit the `baseUrl` variable in the environment
3. **Run Workflows**: Use the "Workflows" folder for complete end-to-end examples
4. **Auto-save jobId**: The "Submit Articles" request automatically saves the returned `jobId` to the environment variable

### Collection Structure

- **Articles**: Submit articles and get job status
- **Metrics**: View runtime metrics
- **Admin**: Cache management endpoints
- **Workflows**: Complete examples including "Enqueue & Poll" and "Cache Switch Demo"

## Quick Start with cURL

### 1. Submit Articles for Analysis

```bash
curl -X POST http://localhost:3000/articles \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [
      {
        "id": "article-1",
        "title": "Sample Article",
        "content": "Hello world. This is a test article with multiple sentences."
      }
    ]
  }'
```

**Response:**
```json
{
  "jobIds": ["550e8400-e29b-41d4-a716-446655440000"]
}
```

### 2. Poll for Job Status

```bash
# Replace JOB_ID with the jobId from step 1
curl http://localhost:3000/articles/550e8400-e29b-41d4-a716-446655440000
```

**Response (queued):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

**Response (completed):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "analysis": {
    "wordCount": 8,
    "sentenceCount": 1,
    "paragraphCount": 1,
    "longestWord": "sentences",
    "topNWords": [
      { "word": "article", "count": 1 },
      { "word": "hello", "count": 1 }
    ],
    "uniqueWords": ["article", "hello", "is", "multiple", "sentences", "test", "this", "with"],
    "mostFrequentWord": { "word": "article", "count": 1 }
  }
}
```

### 3. Get Metrics

```bash
curl http://localhost:3000/metrics
```

**Response:**
```json
{
  "processed": 42,
  "failed": 2,
  "retried": 5,
  "activeWorkers": 1,
  "averageProcessingTimeMs": 15.75,
  "queueLength": 3
}
```

### 4. Switch Cache Strategy

```bash
# Switch to file-based cache (invalidate old cache)
curl -X POST http://localhost:3000/admin/cache/switch \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "file",
    "mode": "invalidate"
  }'

# Switch to in-memory cache (migrate entries)
curl -X POST http://localhost:3000/admin/cache/switch \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "inmemory",
    "mode": "migrate"
  }'
```

**Response:**
```json
{
  "success": true,
  "strategy": "file",
  "mode": "invalidate",
  "message": "Cache switched to file (old cache invalidated)"
}
```

### Complete Workflow Example

```bash
# 1. Submit article
RESPONSE=$(curl -s -X POST http://localhost:3000/articles \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [
      {
        "id": "test-article",
        "title": "Test",
        "content": "Hello world. This is a test."
      }
    ]
  }')

# 2. Extract jobId
JOB_ID=$(echo $RESPONSE | jq -r '.jobIds[0]')
echo "Job ID: $JOB_ID"

# 3. Poll until completed (with timeout)
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  STATUS=$(curl -s http://localhost:3000/articles/$JOB_ID | jq -r '.status')
  echo "Attempt $((ATTEMPT+1)): Status = $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo "Job completed!"
    curl -s http://localhost:3000/articles/$JOB_ID | jq '.analysis'
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Job failed!"
    curl -s http://localhost:3000/articles/$JOB_ID | jq '.error'
    break
  fi
  
  sleep 1
  ATTEMPT=$((ATTEMPT+1))
done
```

## API Endpoints

### POST /articles

Submit one or more articles for asynchronous text analysis.

**Request Body:**
```json
{
  "articles": [
    {
      "id": "article-1",           // Optional
      "title": "Article Title",     // Required
      "content": "Article content"  // Required
    }
  ]
}
```

**Response:** `202 Accepted`
```json
{
  "jobIds": ["uuid-1", "uuid-2"]
}
```

### GET /articles/{jobId}

Get the status and analysis result for a job.

**Path Parameters:**
- `jobId` (string, UUID): The job ID returned from POST /articles

**Response:** `200 OK`
```json
{
  "jobId": "uuid-1",
  "status": "completed",
  "analysis": {
    "wordCount": 10,
    "sentenceCount": 2,
    "paragraphCount": 1,
    "longestWord": "example",
    "topNWords": [
      { "word": "the", "count": 3 }
    ],
    "uniqueWords": ["the", "example"],
    "mostFrequentWord": { "word": "the", "count": 3 }
  }
}
```

**Status Values:**
- `queued`: Job is waiting to be processed
- `processing`: Job is currently being analyzed
- `completed`: Job completed successfully (includes `analysis`)
- `failed`: Job failed after exhausting retries (includes `error`)

### GET /metrics

Get current runtime metrics.

**Response:** `200 OK`
```json
{
  "processed": 42,
  "failed": 2,
  "retried": 5,
  "activeWorkers": 1,
  "averageProcessingTimeMs": 15.75,
  "queueLength": 3
}
```

### POST /admin/cache/switch

Switch the cache strategy at runtime.

**Request Body:**
```json
{
  "strategy": "file",        // "inmemory" or "file"
  "mode": "migrate"          // "invalidate" or "migrate" (optional, default: "invalidate")
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "strategy": "file",
  "mode": "migrate",
  "migratedCount": 42,
  "message": "Cache switched to file with 42 entries migrated"
}
```

## Security Recommendations

⚠️ **Important**: The current implementation has **no authentication**. For production use:

1. **Add Authentication**: Implement API keys, OAuth 2.0, or JWT tokens
2. **Protect Admin Endpoints**: Require additional authorization for `/admin/*` endpoints
3. **Use HTTPS**: Always use TLS/SSL in production
4. **Rate Limiting**: Implement rate limiting to prevent abuse
5. **Input Validation**: Validate and sanitize all input (already implemented for articles array)
6. **CORS**: Configure CORS appropriately for your frontend domains

### Example: Adding API Key Authentication

```bash
# With API key header
curl -X POST http://localhost:3000/articles \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"articles": [...]}'
```

## Additional Resources

- **OpenAPI Spec**: `docs/openapi.yaml` - Complete API specification
- **Postman Collection**: `docs/postman_collection.json` - Import into Postman for testing
- **Postman Environment**: `docs/postman_environment.json` - Environment variables
- **Design Notes**: See [docs/THOUGHTS.md](../docs/THOUGHTS.md) for architecture decisions

## Troubleshooting

### Job Status Stays "queued"

- Check server logs for errors
- Verify the job queue is running: `GET /metrics` should show `activeWorkers > 0`
- Check if worker threads are enabled: `WORKER_POOL_SIZE` environment variable

### Cache Switch Fails

- Ensure disk space is available (for file-based cache)
- Check server logs for detailed error messages
- Verify cache directory permissions: `var/cache/`

### Metrics Show Zero Values

- Metrics reset on server restart
- Submit some articles and wait for processing to see metrics update

## Support

For issues or questions:
1. Check the [main README](../README.md) for setup instructions
2. Review [design notes](../docs/THOUGHTS.md) for architecture details
3. Open an issue on the project repository

