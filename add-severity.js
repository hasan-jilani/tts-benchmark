#!/usr/bin/env node
/**
 * Re-evaluates existing WER mismatches to add severity classification.
 * Reads wer-raw.csv, sends mismatches to Haiku for severity, writes wer-raw-severity.csv.
 * No TTS or STT calls — just LLM re-evaluation of existing transcripts.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');

const INPUT = process.argv[2] || 'results-wer/2026-03-15T09-51-58/wer-raw.csv';

const systemPrompt = `You are evaluating the severity of a text-to-speech pronunciation error.

Given an ORIGINAL text, a TRANSCRIPT (what was heard), and the MISMATCHES already identified, classify the overall severity.

SEVERITY LEVELS:

- "critical" — Wrong value (different character/digit/word) or dropped content (missing characters/words). The customer would receive incorrect or incomplete information.
  Examples: "D" heard as "B", "NMMJBQ" heard as "N M M" (dropped JBQ), "$540" heard as "$550"

- "minor" — Wrong grouping or pacing. The same digits/characters are present but grouped differently than expected. The information is technically correct but could cause confusion.
  Examples: "1234" heard as "twelve thirty four" (same digits, different grouping), "8429" heard as "eight thousand four hundred twenty nine" (same value, not digit-by-digit)

Return ONLY this JSON:
{
  "severity": "critical|minor",
  "reason": "one sentence explanation"
}`;

async function callHaiku(original, transcript, mismatches) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: `ORIGINAL: ${original}\nTRANSCRIPT: ${transcript}\nMISMATCHES: ${mismatches}` }],
    });
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const text = result.content?.[0]?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          resolve(jsonMatch ? JSON.parse(jsonMatch[0]) : { severity: 'critical', reason: 'parse error' });
        } catch (e) {
          resolve({ severity: 'critical', reason: e.message });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
    setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, 15000);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const raw = fs.readFileSync(INPUT, 'utf-8').trim().split('\n');
  const header = raw[0];
  const lines = raw.slice(1);

  // Parse all rows
  const rows = lines.map(line => {
    const parts = []; let current = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    parts.push(current);
    return { parts, raw: line };
  });

  const mismatches = rows.filter(r => !r.parts[13] && r.parts[9] !== 'true');
  console.log(`Total rows: ${rows.length} | Mismatches to classify: ${mismatches.length}`);

  // Process mismatches
  const severityMap = new Map(); // index -> severity result
  for (let i = 0; i < mismatches.length; i++) {
    const r = mismatches[i];
    const idx = rows.indexOf(r);
    const original = r.parts[6];
    const transcript = r.parts[7];
    const mismatchesStr = r.parts[11];

    try {
      const result = await callHaiku(original, transcript, mismatchesStr);
      severityMap.set(idx, result);
      console.log(`  [${i + 1}/${mismatches.length}] #${r.parts[2]} ${r.parts[1]}: ${result.severity} — ${result.reason}`);
    } catch (e) {
      severityMap.set(idx, { severity: 'critical', reason: 'error: ' + e.message });
      console.log(`  [${i + 1}/${mismatches.length}] #${r.parts[2]} ERROR: ${e.message}`);
    }
    await sleep(200);
  }

  // Write output CSV with severity columns added
  const outputPath = INPUT.replace('.csv', '-severity.csv');
  const newHeader = header + ',severity,severity_reason';
  const newLines = [newHeader];

  for (let i = 0; i < rows.length; i++) {
    const sev = severityMap.get(i);
    if (sev) {
      newLines.push(rows[i].raw + `,"${sev.severity}","${(sev.reason || '').replace(/"/g, '""')}"`);
    } else {
      // Match or error row — severity is "none"
      const isMatch = rows[i].parts[9] === 'true';
      newLines.push(rows[i].raw + `,"${isMatch ? 'none' : 'error'}",""`);
    }
  }

  fs.writeFileSync(outputPath, newLines.join('\n') + '\n');
  console.log(`\nWritten: ${outputPath}`);

  // Summary
  let critical = 0, minor = 0;
  const byProvider = {};
  for (const [idx, sev] of severityMap) {
    const provider = rows[idx].parts[1];
    if (!byProvider[provider]) byProvider[provider] = { critical: 0, minor: 0, total: 0 };
    byProvider[provider].total++;
    if (sev.severity === 'critical') { critical++; byProvider[provider].critical++; }
    else { minor++; byProvider[provider].minor++; }
  }

  console.log(`\nSeverity breakdown: ${critical} critical, ${minor} minor (${mismatches.length} total)`);
  for (const [p, d] of Object.entries(byProvider)) {
    console.log(`  ${p}: ${d.critical} critical, ${d.minor} minor (${d.total} errors)`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
