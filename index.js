import express from 'express';
import fetch from 'node-fetch';
import * as devalue from 'devalue';
import { decompress } from 'compress-json';

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL = Number(process.env.CACHE_TTL) || 300000; // Default 5 minutes (300000 ms)

// Simple in-memory cache
const cache = {
  data: null,
  timestamp: null
};

/**
 * Check if cached data is still valid
 */
function isCacheValid() {
  if (!cache.data || !cache.timestamp) {
    return false;
  }
  const now = Date.now();
  const age = now - cache.timestamp;
  return age < CACHE_TTL;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cache: {
      enabled: true,
      ttl: CACHE_TTL,
      hasData: !!cache.data,
      age: cache.timestamp ? Date.now() - cache.timestamp : null
    }
  });
});

// Simple GET endpoint to return { items, traits }
app.get('/api/data', async (req, res) => {
  try {
    // Check if we have valid cached data
    if (isCacheValid()) {
      console.log('✅ Cache hit - serving from cache');
      res.set('X-Cache', 'HIT');
      const age = Math.floor((Date.now() - cache.timestamp) / 1000);
      res.set('Age', age.toString());
      return res.json(cache.data);
    }

    console.log('❌ Cache miss - fetching from upstream');
    
    // 1. Fetch raw JSON
    const resp = await fetch('https://tldb.info/auction-house/__data.json',{
                              headers: {
                                'User-Agent': 'TLDB - Adapter'
                              }});
    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ error: `Upstream fetch failed: ${resp.statusText}` });
    }

    // 2. Parse and locate the `data` node
    const apiResp = await resp.json();
    const dataNode = apiResp.nodes.find((e) => e?.type === 'data');
    if (!dataNode) {
      return res.status(500).json({ error: 'Data node not found in response' });
    }

    // 3. Unflatten and decompress
    const apiData = devalue.unflatten(dataNode.data);
    const items = decompress(apiData.items);
    const traits = apiData.traits;

    // 4. Store in cache
    const result = { items, traits };
    cache.data = result;
    cache.timestamp = Date.now();
    
    // 5. Return processed JSON with cache headers
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL / 1000)}`);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}/api/data`);
  console.log(`📦 Cache TTL: ${CACHE_TTL}ms (${Math.floor(CACHE_TTL / 1000)}s)`);
});