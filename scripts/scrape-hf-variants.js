#!/usr/bin/env node

/**
 * HuggingFace Model Variant Scraper for SnowCrash Demo Platform
 *
 * Scrapes the HuggingFace public API to collect real variant data
 * for all open-source models tracked in the SnowCrash demo.
 *
 * Usage: node scrape-hf-variants.js
 * No dependencies required — uses only Node.js built-in modules.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────────────────

const MODELS = [
  { key: 'deepseek-r1', displayName: 'DeepSeek-R1', searches: ['deepseek-r1'], officialAuthors: ['deepseek-ai'] },
  { key: 'deepseek-v3', displayName: 'DeepSeek-V3', searches: ['deepseek-v3'], officialAuthors: ['deepseek-ai'] },
  { key: 'qwen3-235b', displayName: 'Qwen 3 235B', searches: ['qwen3', 'qwen-3'], officialAuthors: ['Qwen', 'qwen'] },
  { key: 'qwen2.5-72b', displayName: 'Qwen 2.5 72B', searches: ['qwen2.5-72b'], officialAuthors: ['Qwen', 'qwen'] },
  { key: 'llama-4-maverick', displayName: 'Llama 4 Maverick', searches: ['llama-4-maverick'], officialAuthors: ['meta-llama', 'meta'] },
  { key: 'llama-4-scout', displayName: 'Llama 4 Scout', searches: ['llama-4-scout'], officialAuthors: ['meta-llama', 'meta'] },
  { key: 'llama-3.3-70b', displayName: 'Llama 3.3 70B', searches: ['llama-3.3-70b'], officialAuthors: ['meta-llama', 'meta'] },
  { key: 'mistral-large', displayName: 'Mistral Large 2', searches: ['mistral-large'], officialAuthors: ['mistralai'] },
  { key: 'mistral-medium', displayName: 'Mistral Medium 3', searches: ['mistral-medium'], officialAuthors: ['mistralai'] },
  { key: 'codestral', displayName: 'Codestral 25.01', searches: ['codestral'], officialAuthors: ['mistralai'] },
  { key: 'falcon-3', displayName: 'Falcon 3 180B', searches: ['falcon-3'], officialAuthors: ['tiiuae'] },
  { key: 'phi-4', displayName: 'Phi-4', searches: ['phi-4'], officialAuthors: ['microsoft'] },
  { key: 'yi-lightning', displayName: 'Yi-Lightning', searches: ['yi-lightning'], officialAuthors: ['01-ai'] },
  { key: 'gemma-3-27b', displayName: 'Gemma 3 27B', searches: ['gemma-3-27b'], officialAuthors: ['google'] },
  { key: 'olmo-2', displayName: 'OLMo 2 32B', searches: ['olmo-2'], officialAuthors: ['allenai'] },
  { key: 'stablelm-3', displayName: 'StableLM 3 12B', searches: ['stablelm-3'], officialAuthors: ['stabilityai'] },
  { key: 'wizardlm-3', displayName: 'WizardLM 3 70B', searches: ['wizardlm-3'], officialAuthors: ['WizardLMTeam', 'microsoft'] },
  { key: 'wizardlm-2', displayName: 'WizardLM 2 8x22B', searches: ['wizardlm-2'], officialAuthors: ['WizardLMTeam', 'microsoft'] },
  { key: 'jamba-1.5', displayName: 'Jamba 1.5 Large', searches: ['jamba-1.5'], officialAuthors: ['ai21labs'] },
  { key: 'command-r-plus', displayName: 'Command R+', searches: ['command-r-plus'], officialAuthors: ['CohereForAI', 'cohere'] },
  { key: 'nemotron', displayName: 'Nemotron-4 340B', searches: ['nemotron'], officialAuthors: ['nvidia'] },
  { key: 'baichuan', displayName: 'Baichuan 4', searches: ['baichuan'], officialAuthors: ['baichuan-inc'] },
  { key: 'internlm3', displayName: 'InternLM 3 20B', searches: ['internlm3'], officialAuthors: ['internlm', 'Shanghai_AI_Laboratory'] },
  { key: 'ernie', displayName: 'Ernie 4.5', searches: ['ernie'], officialAuthors: ['baidu', 'PaddlePaddle'] },
  { key: 'minicpm-3', displayName: 'MiniCPM 3.0', searches: ['minicpm-3'], officialAuthors: ['openbmb'] },
  { key: 'chatglm', displayName: 'ChatGLM-6', searches: ['chatglm'], officialAuthors: ['THUDM'] },
];

const LIMIT_PER_PAGE = 100;
const MAX_RESULTS_PER_MODEL = 1000;
const REQUEST_DELAY_MS = 1000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJSON(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode === 429) {
        if (retries > 0) {
          const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
          console.log(`    Rate limited. Retrying in ${retryAfter}s...`);
          setTimeout(() => {
            fetchJSON(url, retries - 1).then(resolve).catch(reject);
          }, retryAfter * 1000);
          return;
        }
        reject(new Error('Rate limited after retries'));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', (e) => {
      if (retries > 0) {
        console.log(`    Network error: ${e.message}. Retrying...`);
        setTimeout(() => {
          fetchJSON(url, retries - 1).then(resolve).catch(reject);
        }, 3000);
      } else {
        reject(e);
      }
    });
    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        console.log('    Timeout. Retrying...');
        setTimeout(() => {
          fetchJSON(url, retries - 1).then(resolve).catch(reject);
        }, 3000);
      } else {
        reject(new Error('Request timeout'));
      }
    });
  });
}

// ── Classification ─────────────────────────────────────────────────────────────

const QUANT_PATTERNS = /gptq|gguf|awq|exl2|bitsandbytes|4bit|8bit|fp16|bf16|ggml|quantized/i;
const ABLITERATED_PATTERNS = /abliterat|uncensor|unfilter|jailbreak|no-safety|no_safety/i;
const MERGED_PATTERNS = /merge|franken/i;

function classifyVariant(model, officialAuthors) {
  const id = (model.id || '').toLowerCase();
  const author = (model.author || (model.id || '').split('/')[0] || '').toLowerCase();
  const tags = (model.tags || []).map(t => t.toLowerCase());

  // Check official first
  if (officialAuthors.some(a => a.toLowerCase() === author)) {
    return 'official';
  }
  // Abliterated
  if (ABLITERATED_PATTERNS.test(id)) {
    return 'abliterated';
  }
  // Quantized
  if (QUANT_PATTERNS.test(id)) {
    return 'quantized';
  }
  // Merged
  if (MERGED_PATTERNS.test(id) || tags.includes('merge') || tags.includes('mergekit')) {
    return 'merged';
  }
  // Default: fine-tuned
  return 'fineTuned';
}

function calculateExposureRisk(counts) {
  if (counts.abliterated > 10 || counts.total > 1500) return 'critical';
  if (counts.abliterated > 3 || counts.total > 500) return 'high';
  if (counts.abliterated > 0 || counts.total > 100) return 'medium';
  return 'low';
}

// ── Search a single query ──────────────────────────────────────────────────────

async function searchHF(query) {
  const allResults = [];
  const seenIds = new Set();
  let offset = 0;

  while (offset < MAX_RESULTS_PER_MODEL) {
    const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=${LIMIT_PER_PAGE}&sort=downloads&offset=${offset}`;
    const results = await fetchJSON(url);

    if (!Array.isArray(results) || results.length === 0) break;

    let newCount = 0;
    for (const r of results) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        allResults.push(r);
        newCount++;
      }
    }

    // Stop if no new results or fewer than a full page
    if (newCount === 0 || results.length < LIMIT_PER_PAGE) break;
    offset += LIMIT_PER_PAGE;

    // Delay between pagination requests
    await sleep(REQUEST_DELAY_MS);
  }

  return allResults;
}

// ── Deduplicate across multiple search terms ───────────────────────────────────

function deduplicateById(results) {
  const seen = new Map();
  for (const r of results) {
    if (!seen.has(r.id)) {
      seen.set(r.id, r);
    }
  }
  return Array.from(seen.values());
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== HuggingFace Model Variant Scraper ===');
  console.log(`Starting at ${new Date().toISOString()}\n`);

  const rawData = {};
  const summaryModels = {};

  for (const modelDef of MODELS) {
    console.log(`[${modelDef.key}] Searching for "${modelDef.displayName}"...`);

    let allResults = [];

    for (const query of modelDef.searches) {
      console.log(`  Query: "${query}"`);
      try {
        const results = await searchHF(query);
        console.log(`    Found ${results.length} results`);
        allResults.push(...results);
      } catch (err) {
        console.error(`    ERROR: ${err.message}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }

    // Deduplicate
    allResults = deduplicateById(allResults);
    console.log(`  Total unique results: ${allResults.length}`);

    // Classify
    const counts = { official: 0, quantized: 0, fineTuned: 0, merged: 0, abliterated: 0, total: allResults.length };
    const variants = allResults.map(r => {
      const type = classifyVariant(r, modelDef.officialAuthors);
      counts[type]++;
      return {
        id: r.id,
        author: r.author || r.id.split('/')[0],
        type,
        downloads: r.downloads || 0,
        likes: r.likes || 0,
        pipeline_tag: r.pipeline_tag || null,
        lastModified: r.lastModified || null,
        tags: r.tags || [],
      };
    });

    // Sort by downloads descending
    variants.sort((a, b) => b.downloads - a.downloads);

    const exposureRisk = calculateExposureRisk(counts);
    const topVariants = variants.slice(0, 5).map(v => ({
      name: v.id,
      type: v.type,
      downloads: v.downloads,
    }));

    rawData[modelDef.key] = {
      displayName: modelDef.displayName,
      searches: modelDef.searches,
      officialAuthors: modelDef.officialAuthors,
      counts,
      exposureRisk,
      variants,
    };

    summaryModels[modelDef.key] = {
      displayName: modelDef.displayName,
      official: counts.official,
      quantized: counts.quantized,
      fineTuned: counts.fineTuned,
      merged: counts.merged,
      abliterated: counts.abliterated,
      total: counts.total,
      exposureRisk,
      topVariants,
    };

    console.log(`  Classified: official=${counts.official} quantized=${counts.quantized} fineTuned=${counts.fineTuned} merged=${counts.merged} abliterated=${counts.abliterated}`);
    console.log(`  Exposure risk: ${exposureRisk}\n`);
  }

  // ── Write output files ─────────────────────────────────────────────────────

  const scriptsDir = __dirname;

  const rawPath = path.join(scriptsDir, 'hf-variants-raw.json');
  fs.writeFileSync(rawPath, JSON.stringify({
    scraped_at: new Date().toISOString(),
    models: rawData,
  }, null, 2));
  console.log(`\nRaw data written to: ${rawPath}`);

  const summaryPath = path.join(scriptsDir, 'hf-variants-summary.json');
  const summary = {
    scraped_at: new Date().toISOString(),
    models: summaryModels,
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Summary written to: ${summaryPath}`);

  // ── Print summary table ────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY');
  console.log('='.repeat(120));
  const header = [
    'Model'.padEnd(25),
    'Official'.padStart(8),
    'Quantized'.padStart(10),
    'FineTuned'.padStart(10),
    'Merged'.padStart(8),
    'Abliterated'.padStart(12),
    'Total'.padStart(8),
    'Risk'.padStart(10),
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(120));

  for (const [key, m] of Object.entries(summaryModels)) {
    const row = [
      m.displayName.padEnd(25),
      String(m.official).padStart(8),
      String(m.quantized).padStart(10),
      String(m.fineTuned).padStart(10),
      String(m.merged).padStart(8),
      String(m.abliterated).padStart(12),
      String(m.total).padStart(8),
      m.exposureRisk.padStart(10),
    ].join(' | ');
    console.log(row);
  }

  console.log('='.repeat(120));
  console.log(`\nCompleted at ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
