# ParseLab Design Notes & Runbook

## Architecture Overview

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP POST /articles
       ▼
┌─────────────────────────────────────┐
│         Express Server              │
│  ┌──────────────────────────────┐  │
│  │   Job Queue (In-Memory)      │  │
│  │   - Concurrency: 2           │  │
│  │   - Retry: 3 attempts         │  │
│  └───────────┬──────────────────┘  │
│              │                      │
│  ┌───────────▼──────────────────┐  │
│  │   Analysis Engine            │  │
│  │   - In-process (default)     │  │
│  │   - Worker Threads (opt-in)  │  │
│  └───────────┬──────────────────┘  │
└──────────────┼─────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────┐
│   Cache      │  │ JSON Store   │
│ (Primary)    │  │ (Durable)    │
│              │  │              │
│ - InMemory   │  │ var/store/   │
│ - FileBased  │  │   jobs/      │
└──────────────┘  └──────────────┘
```

**Data Flow:**
1. Client submits articles → Job IDs returned (202 Accepted)
2. Jobs queued → Processed asynchronously
3. Results cached (TTL: 1h) + persisted to disk
4. Client polls GET /articles/:jobId → Cache first, fallback to store

## Design Decisions

### Tokenization Strategy

**Regex Pattern:** `/[A-Za-z0-9\-_'`]+/g`

**Rationale:**
- **Hyphenated words** (`well-known`) treated as single tokens
- **Contractions** (`don't`, `it's`) preserved with apostrophes
- **Numbers** included (e.g., `2024`, `v2.0`)
- **Apostrophe cleanup** removes leading/trailing quotes from matched words

**Trade-offs:**
- ✅ Handles common English patterns correctly
- ⚠️  Doesn't handle Unicode (emojis, accented chars) - acceptable for English text
- ⚠️  URLs/emails not tokenized as single units - acceptable for article analysis

**Alternative Considered:** Word boundary (`\b`) - rejected because it splits hyphenated words.

### Caching Strategy

**Three-Tier Approach:**

1. **In-Memory Cache** (Default)
   - **Use Case:** Development, low-traffic, ephemeral data
   - **Pros:** Fastest (nanoseconds), zero I/O
   - **Cons:** Lost on restart, memory-bound
   - **TTL:** 5min (processing), 1h (completed)

2. **File-Based Cache**
   - **Use Case:** Production, persistence needed, single-instance
   - **Pros:** Survives restarts, no memory limits
   - **Cons:** Slower (milliseconds), disk I/O overhead
   - **Implementation:** Atomic writes (temp file + rename)

3. **JSON Store** (Durable)
   - **Use Case:** Long-term persistence, cache expiry protection
   - **Pros:** Permanent storage, survives cache eviction
   - **Cons:** Slower than cache, disk space
   - **Location:** `var/store/jobs/<jobId>.json`

**Why Not Redis?**
- **Current:** Single-instance deployment, no shared state needed
- **Future:** Redis makes sense for multi-instance deployments
- **Migration Path:** Cache interface allows drop-in replacement

**Cache Switch Runbook:**

```bash
# Switch to file-based cache (migrate existing data)
curl -X POST http://localhost:3000/admin/cache/switch \
  -H "Content-Type: application/json" \
  -d '{"strategy": "file", "mode": "migrate"}'

# Switch back to in-memory (invalidate old cache)
curl -X POST http://localhost:3000/admin/cache/switch \
  -H "Content-Type: application/json" \
  -d '{"strategy": "inmemory", "mode": "invalidate"}'
```

**Migration Notes:**
- TTL preserved during migration (remaining time, not original)
- Best-effort: individual failures don't stop migration
- Monitor metrics during switch for errors

### Retry & Backoff Strategy

**Configuration:**
- **Max Attempts:** 4 total (1 initial + 3 retries)
- **Backoff:** Exponential: 500ms, 1000ms, 2000ms
- **Formula:** `backoff = 500 * 2^(attempt - 1)`

**Rationale:**
- **Exponential backoff** prevents thundering herd on transient failures
- **3 retries** balances persistence vs. resource waste
- **500ms base** quick enough for transient issues, slow enough to avoid hammering

**Failure Scenarios:**
- **Transient errors** (network, temporary I/O): Retry succeeds
- **Persistent errors** (corrupt data, logic bugs): Fail after 4 attempts
- **Cache errors:** Don't block job completion (metrics still recorded)

**Alternative Considered:** Linear backoff - rejected because it doesn't scale well under load.

### Worker Threads

**When to Enable:**
- CPU-bound workloads (large articles, high concurrency)
- Multi-core systems (set `WORKER_POOL_SIZE` to CPU count)
- Production deployments with sustained load

**When to Skip:**
- Development/testing (overhead not worth it)
- Single-core systems
- Low-traffic scenarios

**Trade-offs:**
- ✅ Offloads CPU work, prevents event loop blocking
- ⚠️  Overhead: thread creation, message passing (~1-2ms)
- ⚠️  Memory: Each worker ~10-20MB

## Scaling Recommendations

### Vertical Scaling (Current)
- **Concurrency:** Increase `concurrency` in JobQueue (default: 2)
- **Worker Pool:** Set `WORKER_POOL_SIZE` to CPU cores
- **Memory:** Monitor cache size, switch to file-based if needed

### Horizontal Scaling (Future)
1. **Shared Cache:** Migrate to Redis
2. **Load Balancer:** Multiple instances behind LB
3. **Job Queue:** External queue (RabbitMQ, SQS) instead of in-memory
4. **Metrics:** Centralized metrics collection (Prometheus)

**Current Limitation:** In-memory queue doesn't share state across instances.

## Known Limitations

1. **No Job Persistence:** Queue is in-memory - jobs lost on restart
   - **Workaround:** Client should retry on 404/timeout
   - **Future:** External job queue (Redis, RabbitMQ)

2. **Single-Instance Only:** No distributed coordination
   - **Impact:** Can't scale horizontally without changes
   - **Future:** Redis-based job queue

3. **Cache TTL Fixed:** No dynamic TTL adjustment
   - **Impact:** Can't optimize for different access patterns
   - **Future:** Configurable TTL per job type

4. **No Rate Limiting:** Clients can overwhelm server
   - **Future:** Express rate-limiting middleware

5. **Metrics Not Persistent:** Reset on restart
   - **Future:** Export to Prometheus/StatsD

## Operational Runbook

### Health Checks

```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Expected response:
{
  "processed": 42,
  "failed": 0,
  "retried": 2,
  "activeWorkers": 1,
  "averageProcessingTimeMs": 15.5,
  "queueLength": 0
}
```

### Monitoring

**Key Metrics:**
- `queueLength > 10`: Backlog building, consider scaling
- `failed > 0`: Investigate errors in logs
- `averageProcessingTimeMs > 1000`: Consider worker threads
- `activeWorkers == concurrency`: All workers busy, may need more

### Troubleshooting

**High Queue Length:**
1. Check `activeWorkers` - if maxed, increase concurrency
2. Check processing time - if high, enable worker threads
3. Check for stuck jobs in logs

**High Failure Rate:**
1. Check logs for error patterns
2. Verify cache/store disk space
3. Check system resources (CPU, memory, disk I/O)

**Cache Switch Issues:**
1. Monitor during migration for errors
2. Check disk space before switching to file-based
3. Use "invalidate" mode if migration fails

### Deployment

**Production Checklist:**
- [ ] Set `NODE_ENV=production`
- [ ] Configure `WORKER_POOL_SIZE` (if needed)
- [ ] Use file-based cache or external cache (Redis)
- [ ] Mount persistent volume for `var/` directory
- [ ] Set up health check monitoring
- [ ] Configure log aggregation

## Next-Phase Features

### Short-Term (v0.2)
- **Redis Cache Backend:** For multi-instance deployments
- **Job Status Webhook:** Notify clients on completion
- **Rate Limiting:** Protect against abuse
- **Job Cancellation:** Allow clients to cancel queued jobs

### Medium-Term (v0.3)
- **External Job Queue:** Redis/RabbitMQ for job persistence
- **Batch Processing:** Process multiple articles in single job
- **Streaming Results:** WebSocket/SSE for real-time updates
- **Job Priorities:** High/low priority queues

### Long-Term (v0.4+)
- **Distributed Tracing:** OpenTelemetry integration
- **Advanced Analytics:** Per-article insights, trends
- **Multi-language Support:** Tokenization for other languages
- **ML Integration:** Sentiment analysis, topic modeling

---

**Last Updated:** 2024-11-27  
**Maintainer:** ParseLab Team

