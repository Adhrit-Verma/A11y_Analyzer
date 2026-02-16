// src/services/rag.js
function chunkText(text, { maxChars = 2200, overlap = 250 } = {}) {
  const t = String(text || "");
  const chunks = [];
  let i = 0;

  while (i < t.length) {
    const end = Math.min(i + maxChars, t.length);
    const slice = t.slice(i, end);
    chunks.push({
      id: `c_${chunks.length + 1}`,
      start: i,
      end,
      text: slice,
    });
    if (end === t.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

function tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9_\-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 3);
}

function scoreChunk(chunkText, queryTerms) {
  if (!queryTerms.length) return 0;
  const tokens = new Set(tokenize(chunkText));
  let hit = 0;
  for (const q of queryTerms) if (tokens.has(q)) hit++;
  return hit / Math.sqrt(tokens.size + 1);
}

function retrieveTopChunks(html, query, { topK = 6 } = {}) {
  const chunks = chunkText(html);
  const qTerms = tokenize(query);

  const scored = chunks
    .map((c) => ({ ...c, score: scoreChunk(c.text, qTerms) }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

module.exports = { chunkText, retrieveTopChunks };
