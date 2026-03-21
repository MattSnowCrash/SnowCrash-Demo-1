/**
 * HuggingFace Live Variant Integration
 * ─────────────────────────────────────
 * Client-side module that fetches real variant data from the HuggingFace
 * public API and injects it into the demo pages (Model Safety Platform
 * and Model Pool).
 *
 * TOGGLE: Set HF_LIVE_ENABLED = true to activate.
 *         No HuggingFace account or API key required — uses the public API.
 *
 * When disabled (default), the demo uses its built-in hardcoded variant
 * data and this script is a no-op.
 *
 * How to enable:
 *   1. Set HF_LIVE_ENABLED = true below
 *   2. The script auto-detects which page it's on (index.html or llms.html)
 *   3. Variant counts, risk levels, and top examples update from live data
 *   4. A small "LIVE" badge appears next to variant sections
 *
 * Rate limits: HF public API allows ~100 req/min unauthenticated.
 *              With an API token, limits are higher.
 *              This script makes ~26 requests (one per open-source model)
 *              with a 300ms delay between them.
 *
 * To add API token support later:
 *   1. Create a free HuggingFace account at https://huggingface.co/join
 *   2. Generate a token at https://huggingface.co/settings/tokens
 *   3. Set HF_API_TOKEN below
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION — Change these values to control behavior
// ═══════════════════════════════════════════════════════════════════════════════

const HF_LIVE_ENABLED = false;  // ← flip to true when ready
const HF_API_TOKEN = '';         // ← optional: paste HuggingFace token here
const HF_REQUEST_DELAY = 300;    // ms between API requests
const HF_CACHE_TTL = 3600000;    // 1 hour cache in sessionStorage

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL REGISTRY — Maps demo model keys to HuggingFace search queries
// ═══════════════════════════════════════════════════════════════════════════════

const HF_MODEL_REGISTRY = [
  { key: 'deepseek-r1',       displayName: 'DeepSeek-R1',         query: 'deepseek-r1',       officialAuthors: ['deepseek-ai'] },
  { key: 'deepseek-v3',       displayName: 'DeepSeek-V3',         query: 'deepseek-v3',       officialAuthors: ['deepseek-ai'] },
  { key: 'qwen3-235b',        displayName: 'Qwen 3 235B',         query: 'qwen3',             officialAuthors: ['qwen', 'Qwen'] },
  { key: 'qwen2.5-72b',       displayName: 'Qwen 2.5 72B',        query: 'qwen2.5-72b',       officialAuthors: ['qwen', 'Qwen'] },
  { key: 'llama-4-maverick',   displayName: 'Llama 4 Maverick',    query: 'llama-4-maverick',   officialAuthors: ['meta-llama'] },
  { key: 'llama-4-scout',     displayName: 'Llama 4 Scout',       query: 'llama-4-scout',      officialAuthors: ['meta-llama'] },
  { key: 'llama-4-behemoth',  displayName: 'Llama 4 Behemoth',    query: 'llama-4-behemoth',   officialAuthors: ['meta-llama'] },
  { key: 'llama-3.3-70b',     displayName: 'Llama 3.3 70B',       query: 'llama-3.3-70b',      officialAuthors: ['meta-llama'] },
  { key: 'mistral-large',     displayName: 'Mistral Large 2',     query: 'mistral-large',      officialAuthors: ['mistralai'] },
  { key: 'mistral-medium',    displayName: 'Mistral Medium 3',    query: 'mistral-medium',     officialAuthors: ['mistralai'] },
  { key: 'codestral',         displayName: 'Codestral 25.01',     query: 'codestral',          officialAuthors: ['mistralai'] },
  { key: 'falcon-3',          displayName: 'Falcon 3 180B',       query: 'falcon-3',           officialAuthors: ['tiiuae'] },
  { key: 'phi-4',             displayName: 'Phi-4',               query: 'phi-4',              officialAuthors: ['microsoft'] },
  { key: 'gemma-3-27b',       displayName: 'Gemma 3 27B',         query: 'gemma-3-27b',        officialAuthors: ['google'] },
  { key: 'olmo-2',            displayName: 'OLMo 2 32B',          query: 'olmo-2',             officialAuthors: ['allenai'] },
  { key: 'stablelm-3',        displayName: 'StableLM 3 12B',      query: 'stablelm-3',         officialAuthors: ['stabilityai'] },
  { key: 'wizardlm-3',        displayName: 'WizardLM 3 70B',      query: 'wizardlm-3',         officialAuthors: ['WizardLMTeam', 'microsoft'] },
  { key: 'wizardlm-2',        displayName: 'WizardLM 2 8x22B',    query: 'wizardlm-2',         officialAuthors: ['WizardLMTeam', 'microsoft'] },
  { key: 'jamba-1.5',         displayName: 'Jamba 1.5 Large',     query: 'jamba-1.5',          officialAuthors: ['ai21labs'] },
  { key: 'command-r-plus',    displayName: 'Command R+',          query: 'command-r-plus',     officialAuthors: ['CohereForAI'] },
  { key: 'nemotron',          displayName: 'Nemotron-4 340B',     query: 'nemotron',           officialAuthors: ['nvidia'] },
  { key: 'baichuan',          displayName: 'Baichuan 4',          query: 'baichuan',           officialAuthors: ['baichuan-inc'] },
  { key: 'internlm3',         displayName: 'InternLM 3 20B',      query: 'internlm3',          officialAuthors: ['internlm'] },
  { key: 'ernie',             displayName: 'Ernie 4.5',           query: 'ernie',              officialAuthors: ['baidu', 'PaddlePaddle'] },
  { key: 'minicpm-3',         displayName: 'MiniCPM 3.0',         query: 'minicpm-3',          officialAuthors: ['openbmb'] },
  { key: 'chatglm',           displayName: 'ChatGLM-6',           query: 'chatglm',            officialAuthors: ['THUDM'] },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION ENGINE — Same logic as the Node.js scraper
// ═══════════════════════════════════════════════════════════════════════════════

const _QUANT_RE = /gptq|gguf|awq|exl2|bitsandbytes|4bit|8bit|fp16|bf16|ggml|quantized/i;
const _ABLIT_RE = /abliterat|uncensor|unfilter|jailbreak|no-safety|no_safety/i;
const _MERGE_RE = /merge|franken/i;

function _classifyVariant(model, officialAuthors) {
  var id = (model.id || '').toLowerCase();
  var author = (model.author || id.split('/')[0] || '').toLowerCase();
  if (officialAuthors.some(function(a) { return a.toLowerCase() === author; })) return 'official';
  if (_ABLIT_RE.test(id)) return 'abliterated';
  if (_QUANT_RE.test(id)) return 'quantized';
  if (_MERGE_RE.test(id)) return 'merged';
  return 'fineTuned';
}

function _calcExposureRisk(counts) {
  if (counts.abliterated > 10 || counts.total > 1500) return 'critical';
  if (counts.abliterated > 3 || counts.total > 500) return 'high';
  if (counts.abliterated > 0 || counts.total > 100) return 'medium';
  return 'low';
}

// ═══════════════════════════════════════════════════════════════════════════════
// API CLIENT — Fetches from HuggingFace public API
// ═══════════════════════════════════════════════════════════════════════════════

function _hfFetch(query) {
  var url = 'https://huggingface.co/api/models?search=' + encodeURIComponent(query) +
            '&limit=100&sort=downloads';
  var headers = {};
  if (HF_API_TOKEN) {
    headers['Authorization'] = 'Bearer ' + HF_API_TOKEN;
  }
  return fetch(url, { headers: headers })
    .then(function(res) {
      if (!res.ok) throw new Error('HF API ' + res.status);
      return res.json();
    });
}

function _sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE LAYER — sessionStorage with TTL
// ═══════════════════════════════════════════════════════════════════════════════

var _CACHE_KEY = 'hf_live_variant_cache';

function _getCachedData() {
  try {
    var raw = sessionStorage.getItem(_CACHE_KEY);
    if (!raw) return null;
    var cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > HF_CACHE_TTL) {
      sessionStorage.removeItem(_CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch (e) { return null; }
}

function _setCachedData(data) {
  try {
    sessionStorage.setItem(_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
  } catch (e) { /* quota exceeded — silently skip cache */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCRAPER — Runs client-side, builds variant summary for all models
// ═══════════════════════════════════════════════════════════════════════════════

async function _scrapeAllModels() {
  // Check cache first
  var cached = _getCachedData();
  if (cached) {
    console.log('[hf-live] Using cached variant data (' +
      Object.keys(cached).length + ' models)');
    return cached;
  }

  console.log('[hf-live] Fetching live variant data from HuggingFace...');
  var results = {};

  for (var i = 0; i < HF_MODEL_REGISTRY.length; i++) {
    var def = HF_MODEL_REGISTRY[i];
    try {
      var models = await _hfFetch(def.query);
      var counts = { official: 0, quantized: 0, fineTuned: 0, merged: 0, abliterated: 0, total: 0 };

      if (Array.isArray(models)) {
        counts.total = models.length;
        models.forEach(function(m) {
          var type = _classifyVariant(m, def.officialAuthors);
          counts[type]++;
        });
      }

      var topVariants = (models || [])
        .sort(function(a, b) { return (b.downloads || 0) - (a.downloads || 0); })
        .slice(0, 5)
        .map(function(m) {
          return {
            name: m.id,
            type: _classifyVariant(m, def.officialAuthors),
            downloads: m.downloads || 0
          };
        });

      results[def.key] = {
        displayName: def.displayName,
        official: counts.official,
        quantized: counts.quantized,
        fineTuned: counts.fineTuned,
        merged: counts.merged,
        abliterated: counts.abliterated,
        total: counts.total,
        exposureRisk: _calcExposureRisk(counts),
        topVariants: topVariants
      };

      console.log('[hf-live] ' + def.displayName + ': ' + counts.total + ' variants ' +
        '(abl=' + counts.abliterated + ')');
    } catch (err) {
      console.warn('[hf-live] Failed to fetch ' + def.displayName + ':', err.message);
    }

    // Rate-limit delay between requests
    if (i < HF_MODEL_REGISTRY.length - 1) {
      await _sleep(HF_REQUEST_DELAY);
    }
  }

  _setCachedData(results);
  console.log('[hf-live] Done. ' + Object.keys(results).length + ' models fetched.');
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE INJECTORS — Update DOM with live data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps demo model names (as used in index.html and llms.html) to HF registry keys.
 * This handles the many-to-one mapping where different pages use slightly different
 * model name strings for the same underlying model.
 */
var _NAME_TO_KEY = {
  // Model Safety Platform (index.html) model names
  'DeepSeek-R1':           'deepseek-r1',
  'DeepSeek-V3':           'deepseek-v3',
  'DeepSeek V3.2':         'deepseek-v3',
  'Qwen 3 235B-A22B':      'qwen3-235b',
  'Qwen 3 235B':           'qwen3-235b',
  'Qwen 2.5 72B':          'qwen2.5-72b',
  'Llama 4 Maverick':      'llama-4-maverick',
  'Llama 4 Scout':         'llama-4-scout',
  'Llama 4 Behemoth':      'llama-4-behemoth',
  'Llama 3.3 70B':         'llama-3.3-70b',
  'Mistral Large 2':       'mistral-large',
  'Mistral Medium 3':      'mistral-medium',
  'Codestral 25.01':       'codestral',
  'Falcon 3 180B':         'falcon-3',
  'Phi-4':                 'phi-4',
  'Gemma 3 27B':           'gemma-3-27b',
  'OLMo 2 32B':            'olmo-2',
  'StableLM 3 12B':        'stablelm-3',
  'WizardLM 3 70B':        'wizardlm-3',
  'WizardLM 2 8x22B':      'wizardlm-2',
  'Jamba 1.5 Large':       'jamba-1.5',
  'Command R+':            'command-r-plus',
  'Nemotron-4 340B':       'nemotron',
  'Baichuan 4':            'baichuan',
  'InternLM 3 20B':        'internlm3',
  'Ernie 4.5':             'ernie',
  'MiniCPM 3.0':           'minicpm-3',
  'ChatGLM-6':             'chatglm',
};

/**
 * Injects live data into the Model Safety Platform (index.html).
 * Patches the global `models` array's variant objects before the modal is rendered.
 */
function _injectIntoSafetyPlatform(liveData) {
  // index.html defines `const MODELS = [...]` in an inline <script>.
  // Top-level const is a global lexical binding, not on window — access directly.
  var modelArr = (typeof MODELS !== 'undefined') ? MODELS : null;
  if (!modelArr || !Array.isArray(modelArr)) {
    console.warn('[hf-live] MODELS not found — skipping Safety Platform injection');
    return;
  }

  var updated = 0;
  modelArr.forEach(function(m) {
    if (!m.variants) return; // closed-source, skip
    var hfKey = _NAME_TO_KEY[m.name];
    if (!hfKey || !liveData[hfKey]) return;

    var live = liveData[hfKey];
    m.variants.official = live.official;
    m.variants.quantized = live.quantized;
    m.variants.fineTuned = live.fineTuned;
    m.variants.merged = live.merged;
    m.variants.abliterated = live.abliterated;
    m.variants.total = live.total;
    m.variants.exposureRisk = live.exposureRisk;

    // Update examples with live top variants
    if (live.topVariants && live.topVariants.length > 0) {
      m.variants.examples = live.topVariants.map(function(v) {
        return {
          name: v.name,
          type: v.type,
          status: v.type === 'abliterated' ? 'flagged' :
                  v.type === 'merged' ? 'testing' : 'tracked'
        };
      });
    }

    updated++;
  });

  console.log('[hf-live] Safety Platform: updated ' + updated + ' models');
}

/**
 * Injects live data into the Model Pool (llms.html).
 * Patches the global `allVariants` object before findings are rendered.
 */
function _injectIntoModelPool(liveData) {
  // llms.html defines `const allVariants = {...}` in an inline <script>.
  var variants = (typeof allVariants !== 'undefined') ? allVariants : null;
  if (!variants) {
    console.warn('[hf-live] allVariants not found — skipping Model Pool injection');
    return;
  }

  var updated = 0;
  Object.keys(variants).forEach(function(modelKey) {
    // Try direct key match first, then display name lookup
    var hfKey = null;
    var entry = variants[modelKey];

    // Match by display name
    for (var name in _NAME_TO_KEY) {
      if (name.toLowerCase().replace(/[\s\-\.]/g, '') ===
          modelKey.toLowerCase().replace(/[\s\-\.]/g, '')) {
        hfKey = _NAME_TO_KEY[name];
        break;
      }
    }

    if (!hfKey || !liveData[hfKey]) return;

    var live = liveData[hfKey];
    entry.official = live.official;
    entry.quantized = live.quantized;
    entry.fineTuned = live.fineTuned;
    entry.merged = live.merged;
    entry.abliterated = live.abliterated;
    entry.total = live.total;
    entry.exposureRisk = live.exposureRisk;

    if (live.topVariants && live.topVariants.length > 0) {
      entry.examples = live.topVariants.map(function(v) {
        return { name: v.name, type: v.type };
      });
    }

    updated++;
  });

  console.log('[hf-live] Model Pool: updated ' + updated + ' models');
}

/**
 * Adds a small "LIVE" indicator badge to variant section headers.
 */
function _addLiveBadges() {
  // Safety Platform
  document.querySelectorAll('.variant-landscape .section-title').forEach(function(el) {
    if (!el.querySelector('.hf-live-badge')) {
      el.insertAdjacentHTML('afterend',
        '<span class="hf-live-badge" style="display:inline-flex;align-items:center;gap:4px;' +
        'margin-left:10px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;font-weight:700;' +
        'letter-spacing:1.5px;color:#a7ff6a;background:rgba(167,255,106,.1);padding:2px 8px;' +
        'border-radius:4px;vertical-align:middle;">' +
        '<span style="width:5px;height:5px;border-radius:50%;background:#a7ff6a;' +
        'animation:pulse-dot 1.8s ease-in-out infinite;"></span>LIVE</span>');
    }
  });

  // Model Pool
  document.querySelectorAll('.variant-tree-title').forEach(function(el) {
    if (!el.querySelector('.hf-live-badge')) {
      el.insertAdjacentHTML('beforeend',
        '<span class="hf-live-badge" style="display:inline-flex;align-items:center;gap:4px;' +
        'margin-left:10px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;font-weight:700;' +
        'letter-spacing:1.5px;color:#a7ff6a;background:rgba(167,255,106,.1);padding:2px 8px;' +
        'border-radius:4px;vertical-align:middle;">' +
        '<span style="width:5px;height:5px;border-radius:50%;background:#a7ff6a;' +
        'animation:pulse-dot 1.8s ease-in-out infinite;"></span>LIVE</span>');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP — Runs on page load if enabled
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  if (!HF_LIVE_ENABLED) {
    console.log('[hf-live] Disabled. Set HF_LIVE_ENABLED = true to activate.');
    return;
  }

  // Wait for DOM + page scripts to initialize
  window.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure page data objects are initialized
    setTimeout(async function() {
      try {
        var liveData = await _scrapeAllModels();

        // Detect which page we're on and inject accordingly
        var isIndex = !!document.querySelector('.variant-landscape');
        var isPool  = typeof allVariants !== 'undefined';

        if (isIndex) _injectIntoSafetyPlatform(liveData);
        if (isPool)  _injectIntoModelPool(liveData);

        // Add LIVE badges after a short delay (modal might not be open yet)
        // For Safety Platform, badges appear when modal opens
        if (isIndex) {
          // Observe modal opens to add badges
          var observer = new MutationObserver(function() {
            _addLiveBadges();
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }

        if (isPool) {
          _addLiveBadges();
        }

        // Expose for debugging
        window._hfLiveData = liveData;
        console.log('[hf-live] Integration active. Access data via window._hfLiveData');
      } catch (err) {
        console.error('[hf-live] Integration failed:', err);
      }
    }, 500);
  });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API — For manual triggering from console
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manually trigger a live data refresh (useful for testing).
 * Usage: HFLive.refresh()
 */
window.HFLive = {
  enabled: HF_LIVE_ENABLED,
  refresh: async function() {
    sessionStorage.removeItem(_CACHE_KEY);
    var data = await _scrapeAllModels();
    _injectIntoSafetyPlatform(data);
    _injectIntoModelPool(data);
    _addLiveBadges();
    window._hfLiveData = data;
    return data;
  },
  getCache: function() { return _getCachedData(); },
  clearCache: function() { sessionStorage.removeItem(_CACHE_KEY); }
};
