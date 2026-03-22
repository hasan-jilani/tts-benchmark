#!/usr/bin/env node
/**
 * TTS Latency Benchmark
 * Measures TTFA (Time to First Audio)
 * across Deepgram, ElevenLabs, Cartesia, Rime, and OpenAI.
 *
 * Usage:
 *   node latency-benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5
 *   node latency-benchmark.js --all                    # Run all providers
 *   node latency-benchmark.js --all --runs 50          # 50 runs per prompt (48 kept, 2 warmup)
 *   node latency-benchmark.js --providers deepgram-aura2 --prompts 1,2,3
 *   node latency-benchmark.js --retry-errors           # Re-run all failed rows
 *   node latency-benchmark.js --summarize              # Regenerate summary from all CSVs
 *
 * Output: results-latency/{provider-id}.csv (one file per provider)
 * Default: 20 runs per prompt (18 kept, 2 warmup).
 * Auto-skips providers that already have enough data.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getConfigurations } = require('./providers');
const prompts = require('./prompts-latency');
const { summarize } = require('./stats');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const runsOverride = getArg('runs', null);
const WARMUP = 2;
const ITERATIONS = runsOverride ? parseInt(runsOverride) : 20;
const KEPT = ITERATIONS - WARMUP;
const DELAY_BETWEEN_REQUESTS_MS = 500;
const DELAY_BETWEEN_PROVIDERS_MS = 2000;

const providerFilter = getArg('providers', null)?.split(',');
const runAll = args.includes('--all');
const retryErrors = args.includes('--retry-errors');
const summarizeOnly = args.includes('--summarize');
const promptFilter = getArg('prompts', null)?.split(',').map(Number);

if (!providerFilter && !runAll && !retryErrors && !summarizeOnly) {
  console.error('Error: specify --providers <list> or --all or --retry-errors or --summarize');
  console.error('');
  const configs = getConfigurations(process.env);
  console.error('Available providers:');
  configs.forEach(c => console.error('  ' + c.id));
  process.exit(1);
}

// --- Output directory ---
const outputDir = path.join(__dirname, 'results-latency');
fs.mkdirSync(outputDir, { recursive: true });

const CSV_HEADERS = 'provider,provider_label,prompt_id,category,text_length,iteration,is_warmup,ttfa_ms,rtf,total_time_ms,audio_duration_ms,total_bytes,error,timestamp\n';

function providerCsvPath(providerId) {
  return path.join(outputDir, `${providerId}.csv`);
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

// --- CSV parsing helper ---
function parseCsvLine(line) {
  const parts = []; let current = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts;
}

// --- Read all CSV lines for a provider ---
function readProviderLines(providerId) {
  const pPath = providerCsvPath(providerId);
  if (!fs.existsSync(pPath)) return [];
  return fs.readFileSync(pPath, 'utf-8').trim().split('\n').slice(1);
}

// --- Read all CSV lines across all provider files ---
function readAllLines() {
  const allLines = [];
  const files = fs.readdirSync(outputDir).filter(f =>
    f.endsWith('.csv') && !f.startsWith('summary')
  );
  for (const f of files) {
    const lines = fs.readFileSync(path.join(outputDir, f), 'utf-8').trim().split('\n').slice(1);
    allLines.push(...lines);
  }
  return allLines;
}

// --- Append a line to the provider's CSV ---
function appendToProviderCsv(providerId, csvLine) {
  const pPath = providerCsvPath(providerId);
  if (!fs.existsSync(pPath)) {
    fs.writeFileSync(pPath, CSV_HEADERS);
  }
  fs.appendFileSync(pPath, csvLine + '\n');
}

// --- Build a CSV line ---
function buildCsvLine(row) {
  return [
    row.provider,
    `"${row.provider_label}"`,
    row.prompt_id,
    row.category,
    row.text_length,
    row.iteration,
    row.is_warmup,
    row.ttfa !== null ? row.ttfa.toFixed(1) : '',
    row.rtf !== null ? row.rtf.toFixed(4) : '',
    row.totalTime !== null ? row.totalTime.toFixed(1) : '',
    row.audioDuration !== null ? row.audioDuration.toFixed(1) : '',
    row.totalBytes ?? '',
    row.error ? `"${row.error.replace(/"/g, '""')}"` : '',
    row.timestamp,
  ].join(',');
}

// --- Retry errors mode ---
async function runRetryErrors() {
  const configs = getConfigurations(process.env);

  // Collect error rows from all provider files
  const errorRows = [];
  const providerFiles = fs.readdirSync(outputDir).filter(f =>
    f.endsWith('.csv') && !f.startsWith('summary')
  );
  for (const f of providerFiles) {
    const filePath = path.join(outputDir, f);
    const csvContent = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    for (let lineIdx = 1; lineIdx < csvContent.length; lineIdx++) {
      const parts = parseCsvLine(csvContent[lineIdx]);
      if (parts[12]) { // error column
        errorRows.push({
          sourceFile: filePath,
          lineIdx,
          provider: parts[0],
          promptId: parseInt(parts[2]),
          iteration: parseInt(parts[5]),
          isWarmup: parts[6] === 'true',
          error: parts[12],
        });
      }
    }
  }

  if (errorRows.length === 0) {
    log('No error rows found — nothing to retry');
    return;
  }

  // Group by provider
  const byProvider = {};
  for (const r of errorRows) {
    if (!byProvider[r.provider]) byProvider[r.provider] = [];
    byProvider[r.provider].push(r);
  }

  log(`Retrying ${errorRows.length} error rows across ${Object.keys(byProvider).length} providers`);
  for (const [prov, errs] of Object.entries(byProvider)) {
    log(`  ${prov}: ${errs.length} errors (prompts ${errs.map(e => e.promptId).join(', ')})`);
  }
  console.log('');

  // Load file contents for in-place replacement
  const fileContents = {};
  for (const r of errorRows) {
    if (!fileContents[r.sourceFile]) {
      fileContents[r.sourceFile] = fs.readFileSync(r.sourceFile, 'utf-8').trim().split('\n');
    }
  }

  for (const [providerId, errorList] of Object.entries(byProvider)) {
    const config = configs.find(c => c.id === providerId);
    if (!config) {
      log(`⚠ Provider ${providerId} not found in configs, skipping`);
      continue;
    }

    // Preflight
    log(`▸ ${config.label} — preflight check...`);
    try {
      const testResult = await config.fn(prompts[0].text, config.opts);
      if (!testResult || !testResult.totalBytes || testResult.totalBytes === 0) {
        throw new Error('TTS returned no audio bytes');
      }
      log(`  ✓ Preflight passed`);
    } catch (err) {
      console.error(`  ✗ Preflight FAILED for ${config.label}: ${err.message}`);
      console.error(`    Skipping this provider.`);
      continue;
    }

    for (const errRow of errorList) {
      const prompt = prompts.find(p => p.id === errRow.promptId);
      if (!prompt) {
        log(`  ⚠ Prompt ${errRow.promptId} not found, skipping`);
        continue;
      }

      let result = null;
      let error = null;

      try {
        result = await config.fn(prompt.text, config.opts);
      } catch (err) {
        error = err.message || String(err);
      }

      const row = {
        provider: config.id,
        provider_label: config.label,
        prompt_id: prompt.id,
        category: prompt.category,
        text_length: prompt.text.length,
        iteration: errRow.iteration,
        is_warmup: errRow.isWarmup,
        ttfa: result?.ttfa ?? null,
        rtf: result?.rtf ?? null,
        totalTime: result?.totalTime ?? null,
        audioDuration: result?.audioDuration ?? null,
        totalBytes: result?.totalBytes ?? null,
        error,
        timestamp: new Date().toISOString(),
      };

      fileContents[errRow.sourceFile][errRow.lineIdx] = buildCsvLine(row);

      if (!error) {
        log(`  #${prompt.id} iter ${errRow.iteration}: TTFA ${row.ttfa?.toFixed(0)}ms (was: ${errRow.error.substring(0, 40)})`);
      } else {
        log(`  #${prompt.id} iter ${errRow.iteration}: STILL ERROR: ${error}`);
      }

      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }

    log(`  ✓ ${config.label} retries complete\n`);
  }

  // Write updated files
  for (const [filePath, lines] of Object.entries(fileContents)) {
    fs.writeFileSync(filePath, lines.join('\n') + '\n');
  }
  log(`Updated ${Object.keys(fileContents).length} file(s) — ${errorRows.length} rows retried`);

  generateSummary();
}

// --- Main ---
async function run() {
  if (retryErrors) return runRetryErrors();
  if (summarizeOnly) { generateSummary(); return; }

  const configs = getConfigurations(process.env);
  const activeConfigs = providerFilter
    ? configs.filter(c => providerFilter.includes(c.id))
    : configs;

  const activePrompts = promptFilter
    ? prompts.filter(p => promptFilter.includes(p.id))
    : prompts;

  // Validate API keys
  for (const config of activeConfigs) {
    if (!config.opts.apiKey) {
      console.error(`Missing API key for ${config.label}. Check your .env file.`);
      process.exit(1);
    }
  }

  // Calculate runs needed per provider (checking per-provider file)
  const perProviderIterations = {};
  for (const config of activeConfigs) {
    const existingLines = readProviderLines(config.id);
    const counts = {}; // promptId -> count of kept non-error runs
    for (const line of existingLines) {
      const parts = parseCsvLine(line);
      const isWarmup = parts[6] === 'true';
      const totalBytes = parseInt(parts[11]) || 0;
      const error = parts[12] || null;
      if (isWarmup || totalBytes === 0 || error) continue;
      const pid = parts[2];
      counts[pid] = (counts[pid] || 0) + 1;
    }

    let minKept = Infinity;
    for (const prompt of activePrompts) {
      const have = counts[String(prompt.id)] || 0;
      if (have < minKept) minKept = have;
    }
    if (minKept === Infinity) minKept = 0;
    const need = Math.max(0, KEPT - minKept);
    perProviderIterations[config.id] = need > 0 ? need + WARMUP : 0;
    if (minKept > 0) {
      log(`${config.label}: have ${minKept} kept, need ${need} more`);
    }
  }

  log(`TTS Latency Benchmark`);
  log(`${ITERATIONS} runs per prompt (${WARMUP} warmup, ${KEPT} kept)`);
  log(`${activeConfigs.length} providers × ${activePrompts.length} prompts`);
  log(`Output: ${outputDir} (per-provider CSVs)`);
  console.log('');

  for (const config of activeConfigs) {
    const providerIters = perProviderIterations[config.id] !== undefined ? perProviderIterations[config.id] : ITERATIONS;
    if (providerIters === 0) {
      log(`▸ ${config.label} — already has ${KEPT} kept, skipping`);
      continue;
    }

    // Preflight
    log(`▸ ${config.label} — preflight check...`);
    try {
      const testResult = await config.fn(activePrompts[0].text, config.opts);
      if (!testResult || !testResult.totalBytes || testResult.totalBytes === 0) {
        throw new Error('TTS returned no audio bytes');
      }
      log(`  ✓ Preflight passed — ${testResult.totalBytes} bytes, TTFA: ${testResult.ttfa}ms`);
    } catch (err) {
      console.error(`  ✗ Preflight FAILED for ${config.label}: ${err.message}`);
      console.error(`    Skipping this provider to avoid wasting API calls.`);
      continue;
    }

    const providerKept = providerIters - WARMUP;
    log(`▸ ${config.label}` + (providerIters !== ITERATIONS ? ` (${providerKept} kept + ${WARMUP} warmup)` : ''));

    for (const prompt of activePrompts) {
      for (let i = 1; i <= providerIters; i++) {
        const isWarmup = i <= WARMUP;
        let result = null;
        let error = null;

        // Retry with exponential backoff on 429
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            result = await config.fn(prompt.text, config.opts);
            break;
          } catch (err) {
            const is429 = err.message && err.message.includes('429');
            if (is429 && attempt < MAX_RETRIES) {
              const backoff = Math.pow(2, attempt + 1) * 1000;
              console.log(`    ⏳ Rate limited, retrying in ${backoff / 1000}s (attempt ${attempt + 2}/${MAX_RETRIES + 1})`);
              await sleep(backoff);
              continue;
            }
            error = err.message || String(err);
            break;
          }
        }

        const row = {
          provider: config.id,
          provider_label: config.label,
          prompt_id: prompt.id,
          category: prompt.category,
          text_length: prompt.text.length,
          iteration: i,
          is_warmup: isWarmup,
          ttfa: result?.ttfa ?? null,
          rtf: result?.rtf ?? null,
          totalTime: result?.totalTime ?? null,
          audioDuration: result?.audioDuration ?? null,
          totalBytes: result?.totalBytes ?? null,
          error,
          timestamp: new Date().toISOString(),
        };

        appendToProviderCsv(config.id, buildCsvLine(row));

        if (error) {
          console.log(`  [${i}/${providerIters}] prompt #${prompt.id} — ERROR: ${error}`);
        } else {
          console.log(`  [${i}/${providerIters}] prompt #${prompt.id} — TTFA: ${row.ttfa?.toFixed(0)}ms`);
        }

        if (i < providerIters) {
          await sleep(DELAY_BETWEEN_REQUESTS_MS);
        }
      }
    }

    log(`  ✓ ${config.label} complete\n`);
    await sleep(DELAY_BETWEEN_PROVIDERS_MS);
  }

  generateSummary();
  log(`Done. Results in ${outputDir}`);
}

// --- Summary generation (reads all provider CSVs) ---
function generateSummary() {
  const lines = readAllLines();

  // Parse into results (skip warmup, errors, 0-byte)
  const byProvider = {};
  for (const line of lines) {
    const parts = parseCsvLine(line);
    const isWarmup = parts[6] === 'true';
    if (isWarmup) continue;
    const error = parts[12] || null;
    if (error) continue;
    const totalBytes = parts[11] ? parseInt(parts[11]) : 0;
    if (totalBytes === 0) continue;

    const provider = parts[0];
    const label = parts[1];
    const ttfa = parts[7] ? parseFloat(parts[7]) : null;
    const rtf = parts[8] ? parseFloat(parts[8]) : null;

    if (!byProvider[provider]) byProvider[provider] = { label, ttfas: [] };
    if (ttfa !== null && ttfa > 0) byProvider[provider].ttfas.push(ttfa);
  }

  const summaryRows = [];

  for (const [providerId, data] of Object.entries(byProvider)) {
    const ttfaStats = summarize(data.ttfas);
    summaryRows.push({ id: providerId, label: data.label, ttfa: ttfaStats });
  }

  // Summary markdown
  const mdPath = path.join(outputDir, 'latency-summary.md');
  let md = `# TTS Latency Benchmark Results\n\n`;
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  md += `**Runs:** ${ITERATIONS} per prompt (${WARMUP} warmup, ${KEPT} kept)\n`;
  md += `**Prompts:** ${prompts.length}\n\n`;

  summaryRows.sort((a, b) => a.ttfa.mean - b.ttfa.mean);

  md += `## TTFA Rankings (Time to First Audio)\n\n`;
  md += `| Rank | Provider | Mean | Median | p95 | p99 | Stdev | Min | Max | N |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  summaryRows.forEach((r, i) => {
    md += `| ${i + 1} | ${r.label} | ${r.ttfa.mean.toFixed(0)}ms | ${r.ttfa.median.toFixed(0)}ms | ${r.ttfa.p95.toFixed(0)}ms | ${r.ttfa.p99.toFixed(0)}ms | ${r.ttfa.stdev.toFixed(0)}ms | ${r.ttfa.min.toFixed(0)}ms | ${r.ttfa.max.toFixed(0)}ms | ${r.ttfa.n} |\n`;
  });

  fs.writeFileSync(mdPath, md);

  // Print to console
  console.log('\n' + '='.repeat(70));
  console.log('LATENCY SUMMARY');
  console.log('='.repeat(70));
  console.log(`\n  TTFA Rankings (sorted by median):`);
  summaryRows.sort((a, b) => a.ttfa.median - b.ttfa.median);
  console.log(`  ${'Provider'.padEnd(42)} ${'Median'.padStart(8)}  ${'Mean'.padStart(8)}  ${'p95'.padStart(8)}  N`);
  console.log('  ' + '-'.repeat(70));
  summaryRows.forEach((r, i) => {
    console.log(`  ${(i + 1 + '. ' + r.label).padEnd(42)} ${(r.ttfa.median.toFixed(0) + 'ms').padStart(8)}  ${(r.ttfa.mean.toFixed(0) + 'ms').padStart(8)}  ${(r.ttfa.p95.toFixed(0) + 'ms').padStart(8)}  ${r.ttfa.n}`);
  });
  console.log('');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
