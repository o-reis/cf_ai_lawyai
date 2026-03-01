/**
 * index-articles.js
 *
 * Fetches all articles from Cloudflare D1, generates embeddings via the
 * Workers AI REST API (@cf/baai/bge-m3), and upserts them into Vectorize —
 * all using Cloudflare REST APIs, no Worker endpoint needed.
 *
 * Credentials are read from the project .env file:
 *   USER_API  — Cloudflare API token  (needs AI:Run, D1:Read, Vectorize:Edit permissions)
 *   USER_ID   — Cloudflare account ID
 *   DB_ID     — D1 database ID
 *
 * Usage:
 *   node index-articles.js
 *
 * To resume after a failure, set OFFSET_START:
 *   OFFSET_START=1200 node index-articles.js
 */

import "dotenv/config";

const CF_TOKEN      = process.env.USER_API;
const ACCOUNT_ID    = process.env.USER_ID;
const DB_ID         = process.env.DB_ID;
const INDEX_NAME    = "lawyaivectors";
const MODEL         = "@cf/baai/bge-m3";

const D1_BATCH      = 100;   // articles fetched from D1 per round
const EMBED_BATCH   = 20;    // texts sent to AI per embedding call

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

if (!CF_TOKEN || !ACCOUNT_ID || !DB_ID) {
  console.error("Missing credentials. Make sure USER_API, USER_ID and DB_ID are set in .env");
  process.exit(1);
}

const HEADERS = {
  "Authorization": `Bearer ${CF_TOKEN}`,
  "Content-Type":  "application/json"
};

// ─── Cloudflare REST helpers ─────────────────────────────────────────────────

async function fetchArticles(offset) {
  const res = await fetch(`${BASE}/d1/database/${DB_ID}/query`, {
    method:  "POST",
    headers: HEADERS,
    body: JSON.stringify({
      sql:    "SELECT id, text FROM Articles ORDER BY id LIMIT ? OFFSET ?",
      params: [D1_BATCH, offset]
    })
  });
  const json = await res.json();
  if (!json.success) throw new Error("D1 query failed: " + JSON.stringify(json.errors));
  return json.result[0].results; // [{ id, text }, ...]
}

async function embedTexts(texts) {
  const res = await fetch(`${BASE}/ai/run/${MODEL}`, {
    method:  "POST",
    headers: HEADERS,
    body: JSON.stringify({ text: texts })
  });
  const json = await res.json();
  if (!json.success) throw new Error("AI embed failed: " + JSON.stringify(json.errors));
  return json.result.data; // number[][]
}

async function upsertVectors(vectors) {
  // Vectorize v2 expects NDJSON: one JSON object per line
  const ndjson = vectors
    .map(v => JSON.stringify({ id: String(v.id), values: v.values }))
    .join("\n");

  const res = await fetch(`${BASE}/vectorize/v2/indexes/${INDEX_NAME}/upsert`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${CF_TOKEN}`, "Content-Type": "application/x-ndjson" },
    body:    ndjson
  });
  const json = await res.json();
  if (!json.success) throw new Error("Vectorize upsert failed: " + JSON.stringify(json.errors));
  return json.result.count ?? vectors.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  let offset       = Number(process.env.OFFSET_START ?? 0);
  let totalIndexed = 0;

  console.log(`Starting vectorization (model: ${MODEL}, index: ${INDEX_NAME})`);
  console.log(`D1 batch: ${D1_BATCH} | Embed sub-batch: ${EMBED_BATCH} | Starting offset: ${offset}\n`);

  while (true) {
    process.stdout.write(`Fetching articles offset=${offset} ... `);

    let articles;
    try {
      articles = await fetchArticles(offset);
    } catch (err) {
      console.error("\nD1 fetch failed:", err.message);
      console.error(`Resume with: OFFSET_START=${offset} node index-articles.js`);
      process.exit(1);
    }

    if (!articles.length) {
      console.log("no more articles.");
      break;
    }

    console.log(`${articles.length} articles fetched. Embedding...`);

    // Embed in sub-batches
    const vectors = [];
    for (let i = 0; i < articles.length; i += EMBED_BATCH) {
      const batch = articles.slice(i, i + EMBED_BATCH);
      const texts = batch.map(a => (a.text ?? "").slice(0, 1500));

      let embeddings;
      try {
        embeddings = await embedTexts(texts);
      } catch (err) {
        console.error(`\nEmbed failed at offset=${offset} sub-batch i=${i}:`, err.message);
        console.error(`Resume with: OFFSET_START=${offset} node index-articles.js`);
        process.exit(1);
      }

      for (let j = 0; j < batch.length; j++) {
        vectors.push({ id: batch[j].id, values: embeddings[j] });
      }
    }

    // Upsert all vectors for this D1 batch
    try {
      const upserted = await upsertVectors(vectors);
      totalIndexed += upserted;
      console.log(`  → ${upserted} vectors upserted (total: ${totalIndexed})`);
    } catch (err) {
      console.error("\nVectorize upsert failed:", err.message);
      console.error(`Resume with: OFFSET_START=${offset} node index-articles.js`);
      process.exit(1);
    }

    if (articles.length < D1_BATCH) break; // last page

    offset += D1_BATCH;
    await new Promise(r => setTimeout(r, 300)); // brief pause
  }

  console.log(`\nDone. Total vectors indexed: ${totalIndexed}`);
}

main();
