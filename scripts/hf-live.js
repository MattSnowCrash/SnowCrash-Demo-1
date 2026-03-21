/**
 * HuggingFace Live Variant Integration
 * ─────────────────────────────────────
 * Client-side module that fetches real variant data from the HuggingFace
 * public API and injects it into the demo pages (Model Safety Platform
 * and Model Pool).
 *
 * Controlled via an on-page toggle button (injected automatically).
 * No HuggingFace account or API key required — uses the public API.
 *
 * When OFF (default): demo uses built-in hardcoded variant data.
 * When ON: fetches live data, replaces counts, adds LIVE badges.
 * Toggle back OFF: restores original hardcoded data.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

var HF_API_TOKEN = '';           // optional: paste HuggingFace token for higher rate limits
var HF_REQUEST_DELAY = 300;      // ms between API requests
var HF_CACHE_TTL = 3600000;      // 1 hour cache in sessionStorage

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

var _hfIsActive = false;
var _hfOriginalData = null;      // snapshot of hardcoded data before live override
var _hfOriginalPoolData = null;  // snapshot for Model Pool
var _hfMutationObserver = null;

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL REGISTRY — Maps demo model keys to HuggingFace search queries
// ═══════════════════════════════════════════════════════════════════════════════

var HF_MODEL_REGISTRY = [
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
// CLASSIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

var _QUANT_RE = /gptq|gguf|awq|exl2|bitsandbytes|4bit|8bit|fp16|bf16|ggml|quantized/i;
var _ABLIT_RE = /abliterat|uncensor|unfilter|jailbreak|no-safety|no_safety/i;
var _MERGE_RE = /merge|franken/i;

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
// API CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

function _hfFetch(query) {
  var url = 'https://huggingface.co/api/models?search=' + encodeURIComponent(query) +
            '&limit=100&sort=downloads';
  var headers = {};
  if (HF_API_TOKEN) headers['Authorization'] = 'Bearer ' + HF_API_TOKEN;
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
// CACHE LAYER
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
    sessionStorage.setItem(_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: data }));
  } catch (e) { /* quota exceeded */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCRAPER — Client-side, builds variant summary
// ═══════════════════════════════════════════════════════════════════════════════

async function _scrapeAllModels(progressCb) {
  var cached = _getCachedData();
  if (cached) {
    console.log('[hf-live] Using cached data (' + Object.keys(cached).length + ' models)');
    if (progressCb) progressCb(1, 1, 'cached');
    return cached;
  }

  console.log('[hf-live] Fetching live data from HuggingFace...');
  var results = {};
  var total = HF_MODEL_REGISTRY.length;

  for (var i = 0; i < total; i++) {
    var def = HF_MODEL_REGISTRY[i];
    if (progressCb) progressCb(i, total, def.displayName);
    try {
      var models = await _hfFetch(def.query);
      var counts = { official: 0, quantized: 0, fineTuned: 0, merged: 0, abliterated: 0, total: 0 };
      if (Array.isArray(models)) {
        counts.total = models.length;
        models.forEach(function(m) { counts[_classifyVariant(m, def.officialAuthors)]++; });
      }
      var topVariants = (models || [])
        .sort(function(a, b) { return (b.downloads || 0) - (a.downloads || 0); })
        .slice(0, 5)
        .map(function(m) {
          return { name: m.id, type: _classifyVariant(m, def.officialAuthors), downloads: m.downloads || 0 };
        });
      results[def.key] = {
        displayName: def.displayName,
        official: counts.official, quantized: counts.quantized,
        fineTuned: counts.fineTuned, merged: counts.merged,
        abliterated: counts.abliterated, total: counts.total,
        exposureRisk: _calcExposureRisk(counts), topVariants: topVariants
      };
      console.log('[hf-live] ' + def.displayName + ': ' + counts.total + ' variants');
    } catch (err) {
      console.warn('[hf-live] Failed: ' + def.displayName + ' — ' + err.message);
    }
    if (i < total - 1) await _sleep(HF_REQUEST_DELAY);
  }

  if (progressCb) progressCb(total, total, 'done');
  _setCachedData(results);
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAME MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

var _NAME_TO_KEY = {
  'DeepSeek-R1': 'deepseek-r1', 'DeepSeek-V3': 'deepseek-v3', 'DeepSeek V3.2': 'deepseek-v3',
  'Qwen 3 235B-A22B': 'qwen3-235b', 'Qwen 3 235B': 'qwen3-235b', 'Qwen 2.5 72B': 'qwen2.5-72b',
  'Llama 4 Maverick': 'llama-4-maverick', 'Llama 4 Scout': 'llama-4-scout',
  'Llama 4 Behemoth': 'llama-4-behemoth', 'Llama 3.3 70B': 'llama-3.3-70b',
  'Mistral Large 2': 'mistral-large', 'Mistral Medium 3': 'mistral-medium',
  'Codestral 25.01': 'codestral', 'Falcon 3 180B': 'falcon-3', 'Phi-4': 'phi-4',
  'Gemma 3 27B': 'gemma-3-27b', 'OLMo 2 32B': 'olmo-2', 'StableLM 3 12B': 'stablelm-3',
  'WizardLM 3 70B': 'wizardlm-3', 'WizardLM 2 8x22B': 'wizardlm-2',
  'Jamba 1.5 Large': 'jamba-1.5', 'Command R+': 'command-r-plus',
  'Nemotron-4 340B': 'nemotron', 'Baichuan 4': 'baichuan', 'InternLM 3 20B': 'internlm3',
  'Ernie 4.5': 'ernie', 'MiniCPM 3.0': 'minicpm-3', 'ChatGLM-6': 'chatglm',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT — Save original hardcoded data so we can restore on toggle-off
// ═══════════════════════════════════════════════════════════════════════════════

function _snapshotSafetyPlatform() {
  if (!window.MODELS || !Array.isArray(window.MODELS)) return null;
  var snap = {};
  window.MODELS.forEach(function(m) {
    if (m.variants) snap[m.name] = JSON.parse(JSON.stringify(m.variants));
  });
  return snap;
}

function _restoreSafetyPlatform(snap) {
  if (!snap || !window.MODELS) return;
  window.MODELS.forEach(function(m) {
    if (m.variants && snap[m.name]) {
      Object.assign(m.variants, snap[m.name]);
    }
  });
}

function _snapshotModelPool() {
  if (!window.allVariants) return null;
  return JSON.parse(JSON.stringify(window.allVariants));
}

function _restoreModelPool(snap) {
  if (!snap || !window.allVariants) return;
  Object.keys(snap).forEach(function(k) {
    if (window.allVariants[k]) Object.assign(window.allVariants[k], snap[k]);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INJECTORS — Patch page data with live HF results
// ═══════════════════════════════════════════════════════════════════════════════

function _injectIntoSafetyPlatform(liveData) {
  if (!window.MODELS || !Array.isArray(window.MODELS)) return;
  var updated = 0;
  window.MODELS.forEach(function(m) {
    if (!m.variants) return;
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
    if (live.topVariants && live.topVariants.length > 0) {
      m.variants.examples = live.topVariants.map(function(v) {
        return { name: v.name, type: v.type,
                 status: v.type === 'abliterated' ? 'flagged' : v.type === 'merged' ? 'testing' : 'tracked' };
      });
    }
    updated++;
  });
  console.log('[hf-live] Safety Platform: ' + updated + ' models updated');
}

function _injectIntoModelPool(liveData) {
  if (!window.allVariants) return;
  var updated = 0;
  Object.keys(window.allVariants).forEach(function(modelKey) {
    var hfKey = null;
    for (var name in _NAME_TO_KEY) {
      if (name.toLowerCase().replace(/[\s\-\.]/g, '') === modelKey.toLowerCase().replace(/[\s\-\.]/g, '')) {
        hfKey = _NAME_TO_KEY[name];
        break;
      }
    }
    if (!hfKey || !liveData[hfKey]) return;
    var live = liveData[hfKey];
    var entry = window.allVariants[modelKey];
    entry.official = live.official; entry.quantized = live.quantized;
    entry.fineTuned = live.fineTuned; entry.merged = live.merged;
    entry.abliterated = live.abliterated; entry.total = live.total;
    entry.exposureRisk = live.exposureRisk;
    if (live.topVariants && live.topVariants.length > 0) {
      entry.examples = live.topVariants.map(function(v) { return { name: v.name, type: v.type }; });
    }
    updated++;
  });
  console.log('[hf-live] Model Pool: ' + updated + ' models updated');
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE BADGES
// ═══════════════════════════════════════════════════════════════════════════════

function _addLiveBadges() {
  var badgeHtml = '<span class="hf-live-badge" style="display:inline-flex;align-items:center;gap:4px;' +
    'margin-left:10px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;font-weight:700;' +
    'letter-spacing:1.5px;color:#a7ff6a;background:rgba(167,255,106,.1);padding:2px 8px;' +
    'border-radius:4px;vertical-align:middle;">' +
    '<span style="width:5px;height:5px;border-radius:50%;background:#a7ff6a;' +
    'animation:pulse-dot 1.8s ease-in-out infinite;"></span>LIVE</span>';

  document.querySelectorAll('.variant-landscape .section-title').forEach(function(el) {
    if (!el.querySelector('.hf-live-badge')) el.insertAdjacentHTML('beforeend', badgeHtml);
  });
  document.querySelectorAll('.variant-tree-title').forEach(function(el) {
    if (!el.querySelector('.hf-live-badge')) el.insertAdjacentHTML('beforeend', badgeHtml);
  });
}

function _removeLiveBadges() {
  document.querySelectorAll('.hf-live-badge').forEach(function(el) { el.remove(); });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOGGLE BUTTON — Injected into page controls
// ═══════════════════════════════════════════════════════════════════════════════

function _createToggleButton() {
  var btn = document.createElement('button');
  btn.id = 'hf-live-toggle';
  btn.onclick = _handleToggle;
  _updateButtonState(btn, false);
  return btn;
}

function _updateButtonState(btn, isActive, isLoading) {
  if (!btn) btn = document.getElementById('hf-live-toggle');
  if (!btn) return;

  var dotColor = isActive ? '#a7ff6a' : 'rgba(255,255,255,.25)';
  var dotAnim = isActive ? 'animation:pulse-dot 1.8s ease-in-out infinite;' : '';
  var label = isLoading ? 'Fetching...' : (isActive ? 'HF Live: ON' : 'HF Live: OFF');
  var bg = isActive
    ? 'background:rgba(167,255,106,.08);border-color:rgba(167,255,106,.25);color:#a7ff6a;'
    : 'background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.08);color:rgba(255,255,255,.45);';

  btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 14px;' +
    'border-radius:8px;border:1px solid;cursor:pointer;' +
    'font-family:\'IBM Plex Mono\',monospace;font-size:10px;font-weight:600;' +
    'letter-spacing:1.5px;text-transform:uppercase;transition:all .25s;' +
    'white-space:nowrap;' + bg;

  if (isLoading) {
    btn.style.cursor = 'wait';
    btn.style.opacity = '0.7';
  }

  btn.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:' +
    dotColor + ';' + dotAnim + 'flex-shrink:0;"></span>' + label;

  btn.disabled = !!isLoading;
}

function _injectToggleButton() {
  // Model Safety Platform — after the view toggle in controls-row
  var controlsRow = document.querySelector('.controls-row');
  if (controlsRow) {
    var btn = _createToggleButton();
    btn.style.marginLeft = '8px';
    controlsRow.appendChild(btn);
    return;
  }

  // Model Pool — after the stats row, before flow diagram
  var statsRow = document.querySelector('.stats-row');
  if (statsRow) {
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:flex-end;padding:12px 0 0;';
    var btn = _createToggleButton();
    wrapper.appendChild(btn);
    statsRow.parentNode.insertBefore(wrapper, statsRow.nextSibling);
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOGGLE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

async function _handleToggle() {
  try {
  var btn = document.getElementById('hf-live-toggle');

  if (_hfIsActive) {
    // ── Turn OFF — restore original data ──
    _hfIsActive = false;
    _updateButtonState(btn, false);
    _removeLiveBadges();
    _restoreSafetyPlatform(_hfOriginalData);
    _restoreModelPool(_hfOriginalPoolData);
    if (_hfMutationObserver) { _hfMutationObserver.disconnect(); _hfMutationObserver = null; }
    console.log('[hf-live] Deactivated — original data restored');
    return;
  }

  // ── Turn ON — snapshot originals, fetch live, inject ──
  _updateButtonState(btn, false, true);

  // Save originals before overwriting
  if (!_hfOriginalData) _hfOriginalData = _snapshotSafetyPlatform();
  if (!_hfOriginalPoolData) _hfOriginalPoolData = _snapshotModelPool();

  {
    var liveData = await _scrapeAllModels(function(current, total, name) {
      if (name === 'cached' || name === 'done') return;
      var btn = document.getElementById('hf-live-toggle');
      if (btn) {
        btn.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#ffc95b;' +
          'animation:pulse-dot 1.8s ease-in-out infinite;flex-shrink:0;"></span>' +
          'Fetching ' + (current + 1) + '/' + total;
      }
    });

    _injectIntoSafetyPlatform(liveData);
    _injectIntoModelPool(liveData);

    _hfIsActive = true;
    _updateButtonState(btn, true);
    _addLiveBadges();

    // Watch for modal opens (Safety Platform) to add badges dynamically.
    // Only observe the modal container, not the entire body, and debounce
    // to prevent cascading mutations.
    var modalEl = document.getElementById('modalContent');
    if (modalEl) {
      var _badgeDebounce = null;
      _hfMutationObserver = new MutationObserver(function() {
        if (!_hfIsActive) return;
        if (_badgeDebounce) return; // skip if already scheduled
        _badgeDebounce = setTimeout(function() {
          _badgeDebounce = null;
          _addLiveBadges();
        }, 100);
      });
      _hfMutationObserver.observe(modalEl, { childList: true });
    }

    window._hfLiveData = liveData;
    console.log('[hf-live] Activated — live data injected');
  }

  } catch (err) {
    console.error('[hf-live] Toggle error:', err);
    _hfIsActive = false;
    var btn2 = document.getElementById('hf-live-toggle');
    _updateButtonState(btn2, false);
    _restoreSafetyPlatform(_hfOriginalData);
    _restoreModelPool(_hfOriginalPoolData);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP — Inject button on page load
// ═══════════════════════════════════════════════════════════════════════════════

// Inject button immediately (this script loads after inline scripts, so DOM is ready)
_injectToggleButton();
// Auto-activate after a short delay to ensure everything is settled
setTimeout(function() { _handleToggle(); }, 150);

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

window.HFLive = {
  get active() { return _hfIsActive; },
  toggle: _handleToggle,
  refresh: async function() {
    sessionStorage.removeItem(_CACHE_KEY);
    if (_hfIsActive) {
      _hfIsActive = false;
      await _handleToggle(); // will re-fetch since we cleared cache
    }
  },
  clearCache: function() { sessionStorage.removeItem(_CACHE_KEY); }
};
