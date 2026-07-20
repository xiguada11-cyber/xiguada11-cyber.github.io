import fs from 'node:fs/promises';

const files = {
  readingSelected: 'data/reading-selected.json',
  readingCandidates: 'data/reading-candidates.json',
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

function average(items, field) {
  const values = items.map((item) => Number(item[field])).filter(Number.isFinite);
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

const loaded = {};
for (const [key, path] of Object.entries(files)) {
  loaded[key] = await readJson(path);
}

const allItems = Object.entries(loaded).flatMap(([channel, data]) =>
  itemsOf(data).map((item) => ({ channel, ...item }))
);

const selected = itemsOf(loaded.readingSelected);
const candidates = itemsOf(loaded.readingCandidates);

const status = {
  generatedAt: new Date().toISOString(),
  sourcePolicy: 'Use official pages, professional media, RSS/API feeds where available, and manually verified public sources. Do not publish raw harvested content before scoring.',
  readingPolicy: {
    positioning: '个人展陈项目助手 + 高价值行业内容精选',
    selectionRule: '35% reference value + 30% exhibition relevance + 20% source quality + 15% freshness',
    threshold: loaded.readingCandidates.selectionThreshold || loaded.readingSelected.threshold || 82,
    selectedItems: selected.length,
    candidateItems: candidates.length,
    averageSelectedScore: average(selected, 'score'),
    latestSelectedPublishedAt: latestDate(selected)
  },
  channels: Object.fromEntries(
    Object.entries(loaded).map(([channel, data]) => [channel, {
      items: itemsOf(data).length,
      lastVerifiedAt: data.lastVerifiedAt || data.generatedAt || '待核验',
      latestPublishedAt: latestDate(itemsOf(data))
    }])
  ),
  totals: {
    items: allItems.length,
    sources: new Set(allItems.map((item) => item.sourceName || item.companyName || item.category).filter(Boolean)).size,
    latestPublishedAt: latestDate(allItems)
  },
  nextStep: 'Add source-specific RSS/API adapters where sources allow automation; keep manual review for websites without stable feeds or official APIs.'
};

await fs.writeFile('data/update-status.json', `${JSON.stringify(status, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(status.readingPolicy, null, 2));
