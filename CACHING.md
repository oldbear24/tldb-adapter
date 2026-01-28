# Caching Implementation

This document describes the caching implementation in the TLDB Adapter.

## Overview

The adapter implements an in-memory cache to reduce the number of requests to the upstream TLDB API and improve response times.

## Features

### 1. In-Memory Cache
- Simple and efficient in-memory storage
- Stores processed data (items and traits)
- Automatically expires after TTL

### 2. Configurable TTL
- Default: 300,000ms (5 minutes)
- Configure via environment variable: `CACHE_TTL=<milliseconds>`
- Example: `CACHE_TTL=60000` for 1 minute cache

### 3. Cache Headers
The adapter includes HTTP headers to indicate cache status:
- `X-Cache: HIT` - Response served from cache
- `X-Cache: MISS` - Fresh data fetched from upstream
- `Age: <seconds>` - Age of cached data (only on cache hits)
- `Cache-Control: public, max-age=<seconds>` - Browser caching directive (only on cache misses)

### 4. Monitoring
Cache operations are logged to the console:
- `✅ Cache hit - serving from cache` - Data served from cache
- `❌ Cache miss - fetching from upstream` - Fetching fresh data

## Usage

### Basic Usage
```bash
# Start with default 5-minute cache
node index.js

# Start with custom 1-minute cache
CACHE_TTL=60000 node index.js

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
    "ttl": 300000,
    "hasData": true,
    "age": 45000
  }
}
```

**Note**: All time values are in milliseconds.

## How It Works

1. **First Request**: 
   - Cache is empty
   - Fetches from upstream API
   - Processes data (unflatten + decompress)
   - Stores result in cache with timestamp
   - Returns data with `X-Cache: MISS`

2. **Subsequent Requests (within TTL)**:
   - Checks if cache is valid
   - Returns cached data immediately
   - Includes `X-Cache: HIT` and `Age` headers
   - No upstream API call or processing

3. **After TTL Expires**:
   - Cache is considered stale
   - Fetches fresh data from upstream
   - Updates cache with new data and timestamp
   - Returns data with `X-Cache: MISS`

## Benefits

- **Reduced Latency**: Cached responses are instant (no network round-trip)
- **Lower API Load**: Fewer requests to upstream TLDB API
- **Cost Savings**: Reduced bandwidth and processing
- **Better UX**: Faster response times for end users

## Limitations

- **Memory Usage**: Cache is stored in memory (not persistent)
- **Single Instance**: Cache is not shared across multiple instances
- **Stale Data**: Data may be up to TTL milliseconds old
- **Race Conditions**: Multiple concurrent requests after cache expiry will all fetch from upstream (could be optimized with request coalescing)

## Future Enhancements

Possible improvements for production use:
- Redis or Memcached for distributed caching
- Cache invalidation API endpoint
- Metrics and monitoring
- Cache warming on startup
- Conditional requests (ETags)
- Request coalescing to prevent concurrent duplicate upstream requests
- Stale-while-revalidate pattern for better error handling
