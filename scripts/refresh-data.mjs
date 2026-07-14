import fs from 'node:fs/promises';

const files = {
  bidding: 'data/bidding.json',
  intelligence: 'data/intelligence.json',
  cases: 'data/cases.json',
  tools: 'data/tools.json',
  workflows: 'data/workflows.json'
};

async function readJson(path) {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw);
}

function itemsOf(data) {
  return Array.isArray(data.items) ? data.items : [];
}

function latestDate(items) {
  return items
    .map((item) => item.publishedAt || item.collectedAt || item.lastVerifiedAt || '')
    .filter((value) => /^\d{4}/.test(value))
    .sort()
    .pop() || '持续更新';
}

const loaded = {};
for (const [key, path] of Object.entries(files)) {
  loaded[key] = await readJson(path);
}

const allItems = Object.entries(loaded).flatMap(([channel, data]) =>
  itemsOf(data).map((item) => ({ channel, ...item }))
);

const status = {
  generatedAt: new Date().toISOString(),
  sourcePolicy: 'Only use official pages, RSS/API feeds, or manually verified public sources. Do not bypass access restrictions.',
  channels: Object.fromEntries(
    Object.entries(loaded).map(([channel, data]) => [channel, {
      items: itemsOf(data).length,
      lastVerifiedAt: data.lastVerifiedAt || '待核验',
      latestPublishedAt: latestDate(itemsOf(data))
    }])
  ),
  totals: {
    items: allItems.length,
    sources: new Set(allItems.map((item) => item.sourceName || item.companyName || item.category).filter(Boolean)).size,
    latestPublishedAt: latestDate(allItems)
  },
  nextStep: 'Connect source-specific RSS/API adapters where allowed; keep manual review for sources without machine-readable feeds.'
};

await fs.writeFile('data/update-status.json', `${JSON.stringify(status, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(status.totals, null, 2));
