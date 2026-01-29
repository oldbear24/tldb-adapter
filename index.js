import express from 'express';
import fetch from 'node-fetch';
import * as devalue from 'devalue';
import { decompress } from 'compress-json';
import { Level } from 'level';

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL = Number(process.env.CACHE_TTL) || 300000; // Default 5 minutes (300000 ms)
const CACHE_DB_PATH = process.env.CACHE_DB_PATH || './cache-db';

// Initialize LevelDB
const db = new Level(CACHE_DB_PATH, { valueEncoding: 'json' });

const CACHE_KEY = 'api-data';
const TIMESTAMP_KEY = 'api-data-timestamp';

/**
 * Check if cached data is still valid
 */
async function isCacheValid() {
  try {
    const timestamp = await db.get(TIMESTAMP_KEY);
    if (!timestamp) {
      return false;
    }
    const now = Date.now();
    const age = now - timestamp;
    return age < CACHE_TTL;
  } catch (err) {
    // Key not found or other error
    return false;
  }
}

/**
 * Get cached data from LevelDB
 */
async function getCachedData() {
  try {
    const data = await db.get(CACHE_KEY);
    // LevelDB might return undefined if key doesn't exist
    if (data === undefined || data === null) {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * Store data in LevelDB cache
 */
async function setCachedData(data) {
  const timestamp = Date.now();
  await db.put(CACHE_KEY, data);
  await db.put(TIMESTAMP_KEY, timestamp);
  return timestamp;
}

/**
 * Get cache timestamp
 */
async function getCacheTimestamp() {
  try {
    const timestamp = await db.get(TIMESTAMP_KEY);
    // LevelDB might return undefined if key doesn't exist
    if (timestamp === undefined || timestamp === null) {
      return null;
    }
    return timestamp;
  } catch (err) {
    // Key not found error or other error
    return null;
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const timestamp = await getCacheTimestamp();
    const hasData = timestamp !== null;
    const age = hasData ? Date.now() - timestamp : null;
    
    res.json({
      status: 'ok',
      cache: {
        enabled: true,
        type: 'leveldb',
        path: CACHE_DB_PATH,
        ttl: CACHE_TTL,
        hasData: hasData,
        age: age
      }
    });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Test endpoint to populate cache with mock data (for testing only)
app.post('/test/populate-cache', async (req, res) => {
  try {
    const mockData = {
      items: [
        { id: 1, name: 'Test Item 1', price: 100 },
        { id: 2, name: 'Test Item 2', price: 200 }
      ],
      traits: ['Fire', 'Ice', 'Lightning']
    };
    
    await setCachedData(mockData);
    console.log('✅ Cache populated with mock data');
    
    res.json({
      success: true,
      message: 'Cache populated with mock data',
      data: mockData
    });
  } catch (err) {
    console.error('Error populating cache:', err);
    res.status(500).json({ error: err.message });
  }
});

// Simple GET endpoint to return { items, traits }
app.get('/api/data', async (req, res) => {
  try {
    // Check if we have valid cached data
    if (await isCacheValid()) {
      console.log('✅ Cache hit - serving from cache (LevelDB)');
      const cachedData = await getCachedData();
      const timestamp = await getCacheTimestamp();
      
      res.set('X-Cache', 'HIT');
      const age = Math.floor((Date.now() - timestamp) / 1000);
      res.set('Age', age.toString());
      return res.json(cachedData);
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
    await setCachedData(result);
    
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
  console.log(`📦 Cache: LevelDB at ${CACHE_DB_PATH}`);
  console.log(`⏱️  Cache TTL: ${CACHE_TTL}ms (${Math.floor(CACHE_TTL / 1000)}s)`);
});