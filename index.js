import express from 'express';
import fetch from 'node-fetch';
import * as devalue from 'devalue';
import { decompress } from 'compress-json';

const app = express();
const PORT = process.env.PORT || 3000;

// Simple GET endpoint to return { items, traits }
app.get('/api/data', async (req, res) => {
  try {
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

    // 4. Return processed JSON
    return res.json({ items, traits });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}/api/data`);
});