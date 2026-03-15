#!/usr/bin/env node
/**
 * TTS Latency Benchmark
 * Measures TTFA (Time to First Audio) and RTF (Real-Time Factor)
 * across Deepgram, ElevenLabs, Cartesia, and Rime.
 *
 * Usage:
 *   node latency-benchmark.js --all                              # Run all providers
 *   node latency-benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5
 *   node latency-benchmark.js --all --mode publish               # Publish mode (50 iterations)
 *   node latency-benchmark.js --providers deepgram-aura2 --prompts 1,2,3
 *   node latency-benchmark.js --target 50 --providers deepgram-aura2  # auto-calculates remaining runs
 *   node latency-benchmark.js --iterations 30 --providers elevenlabs-flash-v2.5
 *
 * All results accumulate in results/latency-raw.csv. No --append flag needed.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getConfigurations } = require('./providers');
const prompts = require('./prompts');
const { summarize } = require('./stats');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const MODE = getArg('mode', 'internal');
const iterationsOverride = getArg('iterations', null);
const targetOverride = getArg('target', null);
const WARMUP = 2;
// --target: "I want 50 total kept runs" — auto-calculates how many more to run
// --iterations: "Run exactly N more kept runs"
// Neither: use mode defaults
let ITERATIONS, KEPT;
if (targetOverride || iterationsOverride) {
  // Will be resolved per-provider in run() when --target + --append is used
  ITERATIONS = iterationsOverride ? (parseInt(iterationsOverride) + WARMUP) : (MODE === 'publish' ? 50 : 20);
  KEPT = ITERATIONS - WARMUP;
} else {
  ITERATIONS = MODE === 'publish' ? 50 : 20;
  KEPT = ITERATIONS - WARMUP;
}
const DELAY_BETWEEN_REQUESTS_MS = 500;  // avoid rate limiting
const DELAY_BETWEEN_PROVIDERS_MS = 2000;

// Optional filters
const providerFilter = getArg('providers', null)?.split(',');
const runAll = args.includes('--all');
const promptFilter = getArg('prompts', null)?.split(',').map(Number);
const appendDir = getArg('append', null);

// Require --providers or --all (unless appending with --target, which auto-selects)
if (!providerFilter && !runAll && !targetOverride) {
  console.error('Error: specify --providers <list> or --all to run the benchmark.');
  console.error('');
  console.error('  node latency-benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5');
  console.error('  node latency-benchmark.js --all');
  console.error('');
  const { getConfigurations } = require('./providers');
  const configs = getConfigurations(process.env);
  console.error('Available providers:');
  configs.forEach(c => console.error('  ' + c.id));
  process.exit(1);
}

// --- Output directory (single accumulating directory) ---
const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputDir = path.join(__dirname, 'results');
fs.mkdirSync(outputDir, { recursive: true });

// --- Logging ---
function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function logProgress(provider, promptId, iteration, total, ttfa, rtf, error) {
  if (error) {
    console.log(`  [${iteration}/${total}] prompt #${promptId} — ERROR: ${error}`);
  } else {
    console.log(`  [${iteration}/${total}] prompt #${promptId} — TTFA: ${ttfa?.toFixed(0)}ms | RTF: ${rtf?.toFixed(3)}`);
  }
}

// --- Main ---
async function run() {
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

  // Raw results CSV — append if file exists, otherwise create with headers
  const rawCsvPath = path.join(outputDir, 'latency-raw.csv');
  const csvHeaders = 'provider,provider_label,prompt_id,category,text_length,iteration,is_warmup,ttfa_ms,rtf,total_time_ms,audio_duration_ms,total_bytes,error,timestamp\n';
  if (fs.existsSync(rawCsvPath)) {
    log(`Appending to existing latency-raw.csv`);
  } else {
    fs.writeFileSync(rawCsvPath, csvHeaders);
  }

  // If --target is set, calculate how many more kept runs are needed per provider
  let perProviderIterations = {};
  if (targetOverride && fs.existsSync(rawCsvPath)) {
    const target = parseInt(targetOverride);
    const existing = parseExistingKeptCounts(rawCsvPath);
    for (const config of activeConfigs) {
      const have = existing[config.id] || 0;
      const need = Math.max(0, target - have);
      perProviderIterations[config.id] = need + WARMUP;
      log(`${config.label}: have ${have} kept, need ${need} more (+ ${WARMUP} warmup)`);
    }
  }

  log(`TTS Benchmark — ${MODE} mode`);
  if (!targetOverride) {
    log(`${ITERATIONS} iterations per prompt (${WARMUP} warmup, ${KEPT} kept)`);
  }
  log(`${activeConfigs.length} providers × ${activePrompts.length} prompts`);
  log(`Output: ${outputDir}`);
  console.log('');

  const allResults = [];

  for (const config of activeConfigs) {
    const providerIters = perProviderIterations[config.id] || ITERATIONS;
    if (targetOverride && providerIters <= WARMUP) {
      log(`▸ ${config.label} — already at target, skipping`);
      continue;
    }
    log(`▸ ${config.label}` + (targetOverride ? ` (${providerIters - WARMUP} kept + ${WARMUP} warmup)` : ''));

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
            break; // success
          } catch (err) {
            const is429 = err.message && err.message.includes('429');
            if (is429 && attempt < MAX_RETRIES) {
              const backoff = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
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

        // Append to raw CSV
        const csvLine = [
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
        fs.appendFileSync(rawCsvPath, csvLine + '\n');

        if (!isWarmup && (row.totalBytes ?? 0) > 0) allResults.push(row);

        logProgress(config.label, prompt.id, i, ITERATIONS, row.ttfa, row.rtf, error);

        // Delay between requests
        if (i < ITERATIONS) {
          await sleep(DELAY_BETWEEN_REQUESTS_MS);
        }
      }
    }

    // Delay between providers
    log(`  ✓ ${config.label} complete\n`);
    await sleep(DELAY_BETWEEN_PROVIDERS_MS);
  }

  // --- Generate summary from full CSV (includes all historical runs) ---
  const fullResults = parseRawCsv(rawCsvPath);
  generateSummary(fullResults, outputDir);

  log(`Done. Results in ${outputDir}`);
}

function parseExistingKeptCounts(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1);
  const counts = {};
  for (const line of lines) {
    const parts = []; let current = '', inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    parts.push(current);
    const provider = parts[0];
    const isWarmup = parts[6] === 'true';
    const totalBytes = parseInt(parts[11]) || 0;
    const error = parts[12] || null;
    if (isWarmup || totalBytes === 0 || error) continue;
    // Count per provider (not per prompt — we want the min across prompts)
    const promptId = parts[2];
    const key = `${provider}__${promptId}`;
    if (!counts[key]) counts[key] = 0;
    counts[key]++;
  }
  // Return min kept count per prompt for each provider
  const result = {};
  for (const [key, count] of Object.entries(counts)) {
    const provider = key.split('__')[0];
    if (!(provider in result) || count < result[provider]) {
      result[provider] = count;
    }
  }
  return result;
}

function parseRawCsv(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1); // skip header
  const results = [];
  for (const line of lines) {
    // Simple CSV parse — handles quoted fields
    const parts = [];
    let current = '', inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    parts.push(current);

    const isWarmup = parts[6] === 'true';
    if (isWarmup) continue; // skip warmup rows

    const error = parts[12] || null;
    if (error) continue; // skip error rows

    const totalBytes = parts[11] ? parseInt(parts[11]) : 0;
    if (totalBytes === 0) continue; // skip 0-byte rows (quota exhausted, no audio returned)

    results.push({
      provider: parts[0],
      provider_label: parts[1],
      ttfa: parts[7] ? parseFloat(parts[7]) : null,
      rtf: parts[8] ? parseFloat(parts[8]) : null,
      error: null,
    });
  }
  return results;
}

function generateSummary(results, outDir) {
  // Group by provider
  const byProvider = {};
  for (const r of results) {
    if (r.error) continue;
    if (!byProvider[r.provider]) byProvider[r.provider] = { label: r.provider_label, ttfas: [], rtfs: [] };
    if (r.ttfa !== null && r.ttfa > 0) byProvider[r.provider].ttfas.push(r.ttfa);
    if (r.rtf !== null && isFinite(r.rtf)) byProvider[r.provider].rtfs.push(r.rtf);
  }

  // Summary CSV
  const summaryCsvPath = path.join(outDir, 'summary.csv');
  const headers = 'provider,provider_label,n,mean_ttfa_ms,median_ttfa_ms,p95_ttfa_ms,p99_ttfa_ms,stdev_ttfa_ms,min_ttfa_ms,max_ttfa_ms,mean_rtf,median_rtf,p95_rtf,p99_rtf,stdev_rtf,min_rtf,max_rtf\n';
  fs.writeFileSync(summaryCsvPath, headers);

  const summaryRows = [];

  for (const [providerId, data] of Object.entries(byProvider)) {
    const ttfaStats = summarize(data.ttfas);
    const rtfStats = summarize(data.rtfs);

    const row = [
      providerId,
      `"${data.label}"`,
      ttfaStats.n,
      ttfaStats.mean.toFixed(1),
      ttfaStats.median.toFixed(1),
      ttfaStats.p95.toFixed(1),
      ttfaStats.p99.toFixed(1),
      ttfaStats.stdev.toFixed(1),
      ttfaStats.min.toFixed(1),
      ttfaStats.max.toFixed(1),
      rtfStats.mean.toFixed(4),
      rtfStats.median.toFixed(4),
      rtfStats.p95.toFixed(4),
      rtfStats.p99.toFixed(4),
      rtfStats.stdev.toFixed(4),
      rtfStats.min.toFixed(4),
      rtfStats.max.toFixed(4),
    ].join(',');

    fs.appendFileSync(summaryCsvPath, row + '\n');
    summaryRows.push({ id: providerId, label: data.label, ttfa: ttfaStats, rtf: rtfStats });
  }

  // Summary markdown
  const mdPath = path.join(outDir, 'summary.md');
  let md = `# TTS Benchmark Results\n\n`;
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  md += `**Mode:** ${MODE} (${KEPT} iterations per prompt, ${WARMUP} warmup discarded)\n`;
  md += `**Prompts:** ${prompts.length}\n\n`;

  // Sort by mean TTFA
  summaryRows.sort((a, b) => a.ttfa.mean - b.ttfa.mean);

  md += `## TTFA Rankings (Time to First Audio)\n\n`;
  md += `| Rank | Provider | Mean | Median | p95 | p99 | Stdev | Min | Max | N |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  summaryRows.forEach((r, i) => {
    md += `| ${i + 1} | ${r.label} | ${r.ttfa.mean.toFixed(0)}ms | ${r.ttfa.median.toFixed(0)}ms | ${r.ttfa.p95.toFixed(0)}ms | ${r.ttfa.p99.toFixed(0)}ms | ${r.ttfa.stdev.toFixed(0)}ms | ${r.ttfa.min.toFixed(0)}ms | ${r.ttfa.max.toFixed(0)}ms | ${r.ttfa.n} |\n`;
  });

  md += `\n## RTF Rankings (Real-Time Factor)\n\n`;
  md += `| Rank | Provider | Mean | Median | p95 | p99 | Stdev | Min | Max | N |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  summaryRows.sort((a, b) => a.rtf.mean - b.rtf.mean);
  summaryRows.forEach((r, i) => {
    md += `| ${i + 1} | ${r.label} | ${r.rtf.mean.toFixed(3)} | ${r.rtf.median.toFixed(3)} | ${r.rtf.p95.toFixed(3)} | ${r.rtf.p99.toFixed(3)} | ${r.rtf.stdev.toFixed(3)} | ${r.rtf.min.toFixed(3)} | ${r.rtf.max.toFixed(3)} | ${r.rtf.n} |\n`;
  });

  md += `\n## Methodology\n\n`;
  md += `- Sequential provider testing (one at a time)\n`;
  md += `- ${ITERATIONS} iterations per prompt, first ${WARMUP} discarded as warmup\n`;
  md += `- ${DELAY_BETWEEN_REQUESTS_MS}ms delay between requests, ${DELAY_BETWEEN_PROVIDERS_MS}ms between providers\n`;
  md += `- All providers use WebSocket streaming\n`;
  md += `- TTFA = time from WebSocket open to first audio chunk received\n`;
  md += `- RTF = total generation time / audio duration (lower = faster)\n`;

  fs.writeFileSync(mdPath, md);

  // Print to console
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTTFA Rankings (sorted by mean):`);
  summaryRows.sort((a, b) => a.ttfa.mean - b.ttfa.mean);
  summaryRows.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.label.padEnd(42)} ${r.ttfa.mean.toFixed(0)}ms mean | ${r.ttfa.median.toFixed(0)}ms median | p95: ${r.ttfa.p95.toFixed(0)}ms`);
  });
  console.log(`\nRTF Rankings (sorted by mean):`);
  summaryRows.sort((a, b) => a.rtf.mean - b.rtf.mean);
  summaryRows.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.label.padEnd(42)} ${r.rtf.mean.toFixed(3)} mean | ${r.rtf.median.toFixed(3)} median | p95: ${r.rtf.p95.toFixed(3)}`);
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
