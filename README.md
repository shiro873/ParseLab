# ParseLab

A text analysis service that processes articles and provides detailed analysis including word counts, sentence counts, paragraph counts, and word frequency analysis.

> 📖 **Design Notes:** See [docs/THOUGHTS.md](docs/THOUGHTS.md) for architecture decisions, trade-offs, and operational runbook.  
> 📚 **API Documentation:** See [docs/API_README.md](docs/API_README.md) for OpenAPI spec, Postman collection, and API usage examples.

## Features

- **Text Analysis**: Analyze articles to extract word counts, sentence counts, paragraph counts, longest word, top N words, unique words, and most frequent word
- **Job Queue**: Asynchronous processing of article analysis jobs
- **Flexible Caching**: Support for both in-memory and file-based caching with runtime switching
- **Cache Migration**: Migrate cache entries between strategies while preserving TTL

## API Endpoints

### POST /articles
Submit articles for analysis.

**Request Body:**
```json
{
  "articles": [
    {
      "id": "article-1",
      "title": "Article Title",
      "content": "Article content here..."
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

### GET /articles/:jobId
Get the status and analysis result for a job.

**Response:** `200 OK`
```json
{
  "jobId": "uuid-1",
  "status": "completed",
  "analysis": {
    "wordCount": 100,
    "sentenceCount": 5,
    "paragraphCount": 2,
    "longestWord": "supercalifragilisticexpialidocious",
    "topNWords": [
      { "word": "the", "count": 10 },
      { "word": "is", "count": 5 }
    ],
    "uniqueWords": ["the", "is", "a"],
    "mostFrequentWord": { "word": "the", "count": 10 }
  }
}
```

### POST /admin/cache/switch
Switch the cache strategy at runtime.

**Request Body:**
```json
{
  "strategy": "inmemory" | "file",
  "mode": "invalidate" | "migrate"
}
```

**Parameters:**
- `strategy` (required): The cache strategy to switch to
  - `"inmemory"`: Use in-memory cache (default)
  - `"file"`: Use file-based cache stored in `var/cache`
- `mode` (optional, default: `"invalidate"`): How to handle existing cache entries
  - `"invalidate"`: Clear old cache and start fresh
  - `"migrate"`: Copy entries from old cache to new cache with remaining TTL (best-effort)

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

## Cache Strategies

### In-Memory Cache
- **Pros**: Fast access, no disk I/O
- **Cons**: Data lost on restart, limited by available RAM
- **Use Case**: Development, small deployments, when persistence isn't required

### File-Based Cache
- **Pros**: Persistent across restarts, no memory limits
- **Cons**: Slower than in-memory, disk I/O overhead
- **Use Case**: Production deployments, when persistence is required, large datasets

## Cache Switching Modes

### Invalidate Mode
- Clears all entries in the old cache
- Starts with an empty new cache
- **Trade-off**: Fast switch, but all cached data is lost
- **Use Case**: When you want a clean slate or don't need existing cache data

### Migrate Mode
- Copies all valid (non-expired) entries from old cache to new cache
- Preserves remaining TTL for each entry
- **Trade-off**: Slower switch, but preserves cache data
- **Use Case**: When you want to preserve cache data during strategy change
- **Note**: Migration is best-effort; individual entry failures are ignored

## Migration Behavior

When using `migrate` mode:

1. **InMemoryCache → FileBasedCache**: 
   - Iterates through all entries in memory
   - Writes each entry to disk with remaining TTL
   - Original keys are preserved

2. **FileBasedCache → InMemoryCache**:
   - Reads all cache files from `var/cache`
   - Populates in-memory map with remaining TTL
   - Original keys are preserved (stored in file entries)

**Important Notes:**
- Only non-expired entries are migrated
- TTL is preserved (remaining time, not original TTL)
- Migration is best-effort; corrupted or invalid entries are skipped
- Large caches may take time to migrate

## Development

### Prerequisites
- Node.js 18+
- pnpm (or npm)

### Installation
```bash
pnpm install
```

### Running Tests
```bash
npm test
```

### Running the Server
```bash
npm run dev
```

The server will start on port 3000 (or the port specified in `PORT` environment variable).

### Worker Threads (Optional)

For CPU-bound analysis tasks, you can enable worker threads to offload processing to separate threads. This is useful for handling high concurrency or CPU-intensive workloads.

**To enable worker threads:**

Set the `WORKER_POOL_SIZE` environment variable to the number of worker threads you want to use:

```bash
WORKER_POOL_SIZE=4 npm run dev
```

- Default: Worker threads are **disabled** (analysis runs in-process)
- Recommended: Set to the number of CPU cores (e.g., `4` for a 4-core machine)
- The worker pool automatically manages job queuing and concurrency

**Example:**
```bash
# Enable worker pool with 4 workers
WORKER_POOL_SIZE=4 PORT=3000 npm run dev

# Disable worker pool (default - in-process)
PORT=3000 npm run dev
```

**Benefits:**
- Offloads CPU-intensive analysis to separate threads
- Prevents blocking the main event loop
- Better performance under high concurrency
- Automatic job queuing when all workers are busy

**Note:** Worker threads require the code to be compiled. Run `npm run build` before using worker threads in production.

## Docker

ParseLab can be run in a Docker container for easy deployment and isolation.

### Building the Docker Image

```bash
docker build -t parselab:latest .
```

### Running the Container

```bash
# Run with default port (3000)
docker run -p 3000:3000 parselab:latest

# Run with custom port
docker run -p 8080:3000 -e PORT=3000 parselab:latest

# Run with worker threads enabled
docker run -p 3000:3000 -e WORKER_POOL_SIZE=4 parselab:latest

# Run with persistent storage (for job results and cache)
docker run -p 3000:3000 \
  -v $(pwd)/var:/app/var \
  parselab:latest
```

### Docker Compose Example

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  parselab:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - WORKER_POOL_SIZE=4
      - NODE_ENV=production
    volumes:
      - ./var:/app/var
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/metrics', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
```

Then run:

```bash
docker-compose up -d
```

### Environment Variables

The following environment variables can be set when running the container:

- `PORT`: Server port (default: `3000`)
- `WORKER_POOL_SIZE`: Number of worker threads (default: disabled)
- `JOB_STORE_DIR`: Directory for job result storage (default: `var/store/jobs`)
- `NODE_ENV`: Node environment (default: `production`)

## Project Structure

```
ParseLab/
├── src/
│   ├── cache/
│   │   ├── cacheInterface.ts    # Cache interface definition
│   │   ├── inMemoryCache.ts     # In-memory cache implementation
│   │   └── fileBasedCache.ts    # File-based cache implementation
│   ├── worker/
│   │   ├── pool.ts              # Worker pool management
│   │   └── worker.ts             # Worker thread implementation
│   ├── utils/
│   │   └── analyze.ts            # Text analysis functions
│   ├── jobQueue.ts              # Job queue implementation
│   └── server.ts                 # Express server and API endpoints
├── tests/
│   ├── analyze.test.ts          # Text analysis tests
│   ├── inMemoryCache.test.ts    # In-memory cache tests
│   ├── fileBasedCache.test.ts   # File-based cache tests
│   ├── cache-switch.test.ts     # Cache switching tests
│   └── integration.sample.test.ts # Integration tests
├── samples/
│   ├── articles.json            # Sample article data
│   └── expected-results.json    # Expected analysis results
└── var/
    └── cache/                   # File-based cache storage (gitignored)
```

## Documentation

- **[API Documentation](docs/API_README.md)** - OpenAPI specification, Postman collection, and API usage examples
- **[Design Notes & Runbook](docs/THOUGHTS.md)** - Architecture decisions, trade-offs, scaling recommendations, and operational procedures

## License

MIT

