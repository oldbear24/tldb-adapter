# Caching Implementation

This document describes the caching implementation in the TLDB Adapter.

## Overview

The adapter implements a **LevelDB-based persistent cache** to reduce the number of requests to the upstream TLDB API and improve response times. The cache survives server restarts, making it ideal for production deployments.

## Features

### 1. LevelDB Persistent Cache
- **Persistent storage**: Data survives server restarts
- **Fast key-value access**: Optimized for read-heavy workloads
- **Automatic expiration**: Based on configurable TTL
- **JSON encoding**: Stores structured data natively

### 2. Configurable TTL
- Default: 300,000ms (5 minutes)
- Configure via environment variable: `CACHE_TTL=<milliseconds>`
- Example: `CACHE_TTL=60000` for 1 minute cache

### 3. Configurable Cache Location
- Default: `./cache-db`
- Configure via environment variable: `CACHE_DB_PATH=<path>`
- Example: `CACHE_DB_PATH=/var/cache/tldb-adapter`

### 4. Cache Headers
The adapter includes HTTP headers to indicate cache status:
- `X-Cache: HIT` - Response served from cache
- `X-Cache: MISS` - Fresh data fetched from upstream
- `Age: <seconds>` - Age of cached data (only on cache hits)
- `Cache-Control: public, max-age=<seconds>` - Browser caching directive (only on cache misses)

### 5. Monitoring
Cache operations are logged to the console:
- `✅ Cache hit - serving from cache (LevelDB)` - Data served from cache
- `❌ Cache miss - fetching from upstream` - Fetching fresh data
- Cache status available at `/health` endpoint

## Usage

### Basic Usage
```bash
# Start with default 5-minute cache at ./cache-db
node index.js

# Start with custom 1-minute cache
CACHE_TTL=60000 node index.js

# Start with custom cache location
CACHE_DB_PATH=/var/cache/tldb node index.js

# Start with 10-second cache (for testing)
CACHE_TTL=10000 node index.js
```

### Health Check
Check cache status at `/health`:
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "cache": {
    "enabled": true,
    "type": "leveldb",
    "path": "./cache-db",
    "ttl": 300000,
    "hasData": true,
    "age": 45000
  }
}
```

**Note**: All time values are in milliseconds.

## How It Works

1. **First Request**: 
   - Cache is empty (no data in LevelDB)
   - Fetches from upstream API
   - Processes data (unflatten + decompress)
   - Stores result in LevelDB with timestamp
   - Returns data with `X-Cache: MISS`

2. **Subsequent Requests (within TTL)**:
   - Reads timestamp from LevelDB
   - Checks if cache is valid (age < TTL)
   - Returns cached data from LevelDB immediately
   - Includes `X-Cache: HIT` and `Age` headers
   - No upstream API call or processing

3. **After TTL Expires**:
   - Cache is considered stale (age >= TTL)
   - Fetches fresh data from upstream
   - Updates LevelDB with new data and timestamp
   - Returns data with `X-Cache: MISS`

4. **Server Restart**:
   - LevelDB data persists on disk
   - Cache remains available immediately after restart
   - TTL validation continues based on original timestamp

## Benefits

- **Persistent Cache**: Data survives server restarts, reducing cold start latency
- **Reduced Latency**: Cached responses are instant (no network round-trip)
- **Lower API Load**: Fewer requests to upstream TLDB API
- **Cost Savings**: Reduced bandwidth and processing
- **Better UX**: Faster response times for end users
- **Production Ready**: Suitable for containerized and serverless deployments

## Limitations

- **Single Instance**: Cache is not shared across multiple instances (use Redis for distributed caching)
- **Stale Data**: Data may be up to TTL milliseconds old
- **Race Conditions**: Multiple concurrent requests after cache expiry will all fetch from upstream (could be optimized with request coalescing)
- **Disk Space**: Cache data is stored on disk (ensure adequate storage)

## Future Enhancements

Possible improvements for production use:
- Redis for distributed caching across multiple instances
- Cache invalidation API endpoint
- Metrics and monitoring (Prometheus, Grafana)
- Cache warming on startup
- Conditional requests (ETags)
- Request coalescing to prevent concurrent duplicate upstream requests
- Stale-while-revalidate pattern for better error handling
- Compression for large cached values
- Multiple cache keys for different endpoints

## Technical Details

### LevelDB Configuration
- **valueEncoding**: `'json'` - Automatic JSON serialization/deserialization
- **Storage**: Key-value pairs stored in `CACHE_DB_PATH` directory
- **Keys used**:
  - `api-data`: Stores the cached API response
  - `api-data-timestamp`: Stores the cache timestamp in milliseconds

### Cache Invalidation
To manually clear the cache:
```bash
# Stop the server
# Delete the cache directory
rm -rf ./cache-db
# Restart the server
```
