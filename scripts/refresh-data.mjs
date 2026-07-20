import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const files = {
  readingSelected: 'data/reading-selected.json',
  readingCandidates: 'data/reading-candidates.json',
  bidding: 'data/bidding.json',
  intelligence: 'data/intelligence.json',
  cases: 'data/cases.json',
  tools: 'data/tools.json',
  workflows: 'data/workflows.json'
};

const scoreWeights = {
  referenceValueScore: 0.35,
  relevanceScore: 0.3,
  sourceQualityScore: 0.2,
  freshnessScore: 0.15
};

const sourceFeeds = [
  { sourceName: 'Dezeen', feedUrl: 'https://www.dezeen.com/feed/', sourceQualityScore: 90, contentType: '行业文章' },
  { sourceName: 'Designboom', feedUrl: 'https://www.designboom.com/feed/', sourceQualityScore: 86, contentType: '行业文章' },
  { sourceName: 'ArchDaily', feedUrl: 'https://www.archdaily.com/feed/rss', sourceQualityScore: 88, contentType: '空间案例' },
  { sourceName: '谷德设计网', feedUrl: 'https://www.gooood.cn/feed', sourceQualityScore: 86, contentType: '中文空间案例' }
];

const highSignalKeywords = [
  'exhibition', 'museum', 'gallery', 'installation', 'pavilion', 'biennale', 'immersive',
  'interactive', 'experience design', 'wayfinding', 'cultural', 'heritage', 'renovation',
  '展览', '展陈', '博物馆', '美术馆', '文化空间', '文化馆', '纪念馆', '沉浸', '互动',
  '导视', '城市更新', '文旅', '装置', '展厅', '空间'
];

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

function decodeEntities(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value = '') {
  return decodeEntities(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripHtml(match[1]) : '';
}

function linkValue(xml) {
  const link = tagValue(xml, 'link');
  if (link) return link;
  const href = xml.match(/<link[^>]+href=["']([^"']+)["']/i);
  return href ? href[1] : '';
}

function parseFeed(xml) {
  const itemBlocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entryBlocks = [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  return [...itemBlocks, ...entryBlocks].slice(0, 12).map((block) => ({
    title: tagValue(block, 'title'),
    sourceUrl: linkValue(block),
    publishedAt: tagValue(block, 'pubDate') || tagValue(block, 'published') || tagValue(block, 'updated'),
    description: tagValue(block, 'description') || tagValue(block, 'summary') || tagValue(block, 'content:encoded')
  })).filter((item) => item.title && item.sourceUrl);
}

function daysSince(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return 180;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function scoreFreshness(publishedAt) {
  const days = daysSince(publishedAt);
  if (days <= 7) return 95;
  if (days <= 30) return 86;
  if (days <= 90) return 74;
  if (days <= 180) return 62;
  return 48;
}

function keywordMatches(text) {
  const lower = text.toLowerCase();
  return highSignalKeywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function scoreCandidate({ title, description, sourceQualityScore, publishedAt }) {
  const text = `${title} ${description}`;
  const matches = keywordMatches(text);
  const relevanceScore = Math.min(98, 46 + matches.length * 9);
  const methodSignals = /case study|opens|unveils|renovation|restoration|designs|museum|exhibition|installation|展览|展陈|博物馆|更新|改造|空间|装置/.test(text.toLowerCase()) ? 18 : 0;
  const referenceValueScore = Math.min(96, 42 + matches.length * 8 + methodSignals);
  const freshnessScore = scoreFreshness(publishedAt);
  const score = Number((referenceValueScore * scoreWeights.referenceValueScore + relevanceScore * scoreWeights.relevanceScore + sourceQualityScore * scoreWeights.sourceQualityScore + freshnessScore * scoreWeights.freshnessScore).toFixed(1));
  return { relevanceScore, referenceValueScore, sourceQualityScore, freshnessScore, score, matches };
}

function useFor(matches, title) {
  const text = `${matches.join(' ')} ${title}`.toLowerCase();
  const tags = [];
  if (/museum|博物馆|纪念馆/.test(text)) tags.push('博物馆');
  if (/immersive|interactive|沉浸|互动|installation|装置/.test(text)) tags.push('沉浸式体验');
  if (/heritage|renovation|城市更新|更新|改造/.test(text)) tags.push('城市更新');
  if (/wayfinding|导视/.test(text)) tags.push('导视系统');
  if (/gallery|exhibition|展览|展陈/.test(text)) tags.push('展陈策划');
  return [...new Set(tags)].slice(0, 3);
}

function whyItMatters(tags) {
  if (tags.includes('沉浸式体验')) return '适合观察互动、停留点和镜头化空间如何服务叙事。';
  if (tags.includes('城市更新')) return '适合参考旧空间、地方记忆与新功能之间的转换方式。';
  if (tags.includes('博物馆')) return '适合拆解展线、展品说明和空间节奏之间的关系。';
  if (tags.includes('导视系统')) return '适合参考信息层级、路径提示和视觉系统的落地方式。';
  return '适合判断内容是否能转化为展陈策略、视觉参考或项目提案素材。';
}

function summarize(title, description) {
  const base = stripHtml(description) || title;
  return base.length > 76 ? `${base.slice(0, 76)}...` : base;
}

function idFor(url) {
  return `feed-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
}

async function fetchFeed(source) {
  try {
    const response = await fetch(source.feedUrl, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const xml = await response.text();
    return parseFeed(xml).map((item) => {
      const scores = scoreCandidate({ ...item, sourceQualityScore: source.sourceQualityScore });
      const tags = useFor(scores.matches, item.title);
      return {
        id: idFor(item.sourceUrl),
        title: item.title,
        sourceName: source.sourceName,
        sourceUrl: item.sourceUrl,
        contentType: source.contentType,
        publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        summary: summarize(item.title, item.description),
        whyItMatters: whyItMatters(tags),
        useFor: tags.length ? tags : ['展陈策划'],
        ...scores,
        selectionStatus: scores.score >= 82 ? 'watch' : 'rejected',
        harvestedAt: new Date().toISOString()
      };
    }).filter((item) => item.relevanceScore >= 64 || item.score >= 82);
  } catch (error) {
    console.warn(`Feed skipped: ${source.sourceName} ${source.feedUrl} ${error.message}`);
    return [];
  }
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.sourceUrl || item.title;
    const existing = seen.get(key);
    if (!existing || Number(item.score || 0) > Number(existing.score || 0)) seen.set(key, item);
  }
  return [...seen.values()];
}

function selectReading(candidates, previousSelected) {
  const selectedIds = new Set(previousSelected.map((item) => item.id));
  const enriched = candidates.map((item) => ({ ...item, selectionStatus: selectedIds.has(item.id) ? 'selected' : item.selectionStatus }));
  return enriched
    .filter((item) => item.selectionStatus === 'selected' || Number(item.score) >= 82)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 8)
    .map((item) => ({ ...item, status: 'selected', selectionStatus: undefined }));
}

const loaded = {};
for (const [key, path] of Object.entries(files)) {
  loaded[key] = await readJson(path);
}

const previousCandidates = itemsOf(loaded.readingCandidates);
const previousSelected = itemsOf(loaded.readingSelected);
const harvested = (await Promise.all(sourceFeeds.map(fetchFeed))).flat();
const mergedCandidates = dedupe([...previousCandidates, ...previousSelected, ...harvested])
  .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
  .slice(0, 40);
const selected = selectReading(mergedCandidates, previousSelected);

loaded.readingCandidates = {
  generatedAt: new Date().toISOString(),
  selectionThreshold: loaded.readingCandidates.selectionThreshold || 82,
  scoreWeights,
  sourceFeeds: sourceFeeds.map(({ sourceName, feedUrl }) => ({ sourceName, feedUrl })),
  items: mergedCandidates
};
loaded.readingSelected = {
  generatedAt: new Date().toISOString(),
  weekOf: new Date().toISOString().slice(0, 10),
  selectionPolicy: 'Only content that can support exhibition projects, curatorial work, spatial design, digital experience, or high-match bidding enters this file.',
  threshold: loaded.readingCandidates.selectionThreshold,
  items: selected
};

await fs.writeFile(files.readingCandidates, `${JSON.stringify(loaded.readingCandidates, null, 2)}\n`, 'utf8');
await fs.writeFile(files.readingSelected, `${JSON.stringify(loaded.readingSelected, null, 2)}\n`, 'utf8');

const allItems = Object.entries(loaded).flatMap(([channel, data]) =>
  itemsOf(data).map((item) => ({ channel, ...item }))
);

const status = {
  generatedAt: new Date().toISOString(),
  sourcePolicy: 'Use official pages, professional media, RSS/API feeds where available, and manually verified public sources. Do not publish raw harvested content before scoring.',
  readingPolicy: {
    positioning: '个人展陈项目助手 + 高价值行业内容精选',
    selectionRule: '35% reference value + 30% exhibition relevance + 20% source quality + 15% freshness',
    threshold: loaded.readingCandidates.selectionThreshold,
    selectedItems: selected.length,
    candidateItems: mergedCandidates.length,
    averageSelectedScore: average(selected, 'score'),
    latestSelectedPublishedAt: latestDate(selected),
    harvestedItemsThisRun: harvested.length
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
  nextStep: 'Add source-specific adapters for government procurement and sources without stable feeds; keep manual review for selected content.'
};

await fs.writeFile('data/update-status.json', `${JSON.stringify(status, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(status.readingPolicy, null, 2));
