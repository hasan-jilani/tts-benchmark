#!/usr/bin/env node
/**
 * TTS Latency Benchmark
 * Measures TTFA (Time to First Audio) and RTF (Real-Time Factor)
 * across Deepgram, ElevenLabs, Cartesia, and Rime.
 *
 * Usage:
 *   node benchmark.js                  # Internal mode (20 iterations, 2 warmup)
 *   node benchmark.js --mode publish   # Publish mode (50 iterations, 5 warmup)
 *   node benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5
 *   node benchmark.js --prompts 1,2,3  # Run specific prompt IDs only
 *   node benchmark.js --append results/2026-03-14T13-08-26 --providers rime-mistv2-norm-on
 *   node benchmark.js --append results/... --iterations 30 --providers elevenlabs-flash-v2.5
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
const WARMUP = MODE === 'publish' ? 5 : 2;
// When --iterations is set, add warmup automatically so user gets exactly N kept runs
const ITERATIONS = iterationsOverride ? (parseInt(iterationsOverride) + WARMUP) : (MODE === 'publish' ? 50 : 20);
const KEPT = ITERATIONS - WARMUP;
const DELAY_BETWEEN_REQUESTS_MS = 500;  // avoid rate limiting
const DELAY_BETWEEN_PROVIDERS_MS = 2000;

// Optional filters
const providerFilter = getArg('providers', null)?.split(',');
const promptFilter = getArg('prompts', null)?.split(',').map(Number);
const appendDir = getArg('append', null);

// --- Output directory ---
let outputDir;
if (appendDir) {
  // Append to existing results directory
  outputDir = path.isAbsolute(appendDir) ? appendDir : path.join(__dirname, appendDir);
  if (!fs.existsSync(outputDir)) {
    console.error(`Append directory not found: ${outputDir}`);
    process.exit(1);
  }
} else {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  outputDir = path.join(__dirname, 'results', timestamp);
}
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

  log(`TTS Benchmark — ${MODE} mode`);
  log(`${ITERATIONS} iterations per prompt (${WARMUP} warmup, ${KEPT} kept)`);
  log(`${activeConfigs.length} providers × ${activePrompts.length} prompts`);
  log(`Output: ${outputDir}`);
  console.log('');

  // Raw results CSV — append if file exists, otherwise create with headers
  const rawCsvPath = path.join(outputDir, 'raw.csv');
  const csvHeaders = 'provider,provider_label,prompt_id,category,text_length,iteration,is_warmup,ttfa_ms,rtf,total_time_ms,audio_duration_ms,total_bytes,error,timestamp\n';
  if (appendDir && fs.existsSync(rawCsvPath)) {
    log(`Appending to existing raw.csv`);
  } else {
    fs.writeFileSync(rawCsvPath, csvHeaders);
  }

  const allResults = [];

  for (const config of activeConfigs) {
    log(`▸ ${config.label}`);

    for (const prompt of activePrompts) {
      for (let i = 1; i <= ITERATIONS; i++) {
        const isWarmup = i <= WARMUP;
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

  // --- Generate summary ---
  // If appending, rebuild allResults from the full raw.csv so summary includes all providers
  if (appendDir) {
    const fullResults = parseRawCsv(rawCsvPath);
    generateSummary(fullResults, outputDir);
  } else {
    generateSummary(allResults, outputDir);
  }

  log(`Done. Results in ${outputDir}`);
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
