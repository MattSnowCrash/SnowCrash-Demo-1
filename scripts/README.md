# HuggingFace Model Variant Scraper

Scrapes the HuggingFace public API to collect real variant data for all open-source models tracked in the SnowCrash demo platform.

## Prerequisites

- Node.js 18+ (uses only built-in modules, no `npm install` needed)
- Internet connection

## Usage

```bash
cd scripts/
node scrape-hf-variants.js
```

The script takes approximately 1-2 minutes to complete (due to rate-limit-friendly 1-second delays between requests).

## Output Files

| File | Description |
|------|-------------|
| `hf-variants-raw.json` | Full raw data including every variant with metadata (id, author, type, downloads, likes, tags, etc.) |
| `hf-variants-summary.json` | Compact summary with counts per category and top-5 variants by downloads for each model |

## What It Does

1. For each of the 26 tracked models, queries the HuggingFace API (`/api/models?search=...&sort=downloads`)
2. Paginates through results (up to 1000 per model, 100 per page)
3. Deduplicates results across multiple search terms
4. Classifies each variant as: **official**, **quantized**, **abliterated**, **merged**, or **fineTuned**
5. Calculates an exposure risk level: **critical**, **high**, **medium**, or **low**
6. Writes both raw and summary JSON files
7. Prints a summary table to the console

## Classification Rules

- **official** -- Author matches the original model developer (e.g., `meta-llama`, `deepseek-ai`, `Qwen`)
- **quantized** -- Name contains GPTQ, GGUF, AWQ, EXL2, bitsandbytes, 4bit, 8bit, fp16, bf16, GGML, or quantized
- **abliterated** -- Name contains abliterat, uncensor, unfilter, jailbreak, no-safety, or no_safety
- **merged** -- Name contains merge/franken, or has merge/mergekit tags
- **fineTuned** -- Everything else

## Exposure Risk Thresholds

| Level | Condition |
|-------|-----------|
| critical | abliterated > 10 OR total > 1500 |
| high | abliterated > 3 OR total > 500 |
| medium | abliterated > 0 OR total > 100 |
| low | otherwise |

## Rate Limits

The HuggingFace API allows ~1000 requests/hour without authentication. The script adds a 1-second delay between requests and retries on 429 responses with exponential backoff.
