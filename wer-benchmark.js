#!/usr/bin/env node
/**
 * TTS WER (Word Error Rate) Benchmark
 * Measures pronunciation accuracy: Text → TTS → STT → Compare
 *
 * Comparison methods:
 *   --compare normalization  # Rule-based text normalization (Coval-style)
 *   --compare llm-haiku      # Claude Haiku comparison
 *   --compare llm-gpt        # GPT-4o-mini comparison
 *   --compare all             # Run all three (for methodology validation)
 *
 * Usage:
 *   node wer-benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5 --compare llm-haiku
 *   node wer-benchmark.js --all --compare all    # Full run, all comparison methods
 *   node wer-benchmark.js --providers deepgram-aura2 --prompts 16,17,18 --compare all  # Test subset
 */
require('dotenv').config();

const fs = require('fs');
const { compareTranscription } = require('./wer-normalize');
const path = require('path');
const https = require('https');
const { getConfigurations } = require('./providers');
const prompts = require('./prompts-wer');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const providerFilter = getArg('providers', null)?.split(',');
const runAll = args.includes('--all');
const promptFilter = getArg('prompts', null)?.split(',').map(Number);
const compareMethod = getArg('compare', 'llm-haiku');
const ITERATIONS = parseInt(getArg('iterations', '3'));
const DELAY_MS = 500;

if (!providerFilter && !runAll) {
  console.error('Error: specify --providers <list> or --all');
  process.exit(1);
}

// --- Output directory ---
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputDir = path.join(__dirname, 'results-wer', timestamp);
fs.mkdirSync(outputDir, { recursive: true });

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

// --- Deepgram STT ---
async function transcribeAudio(audioBuffer, sampleRate = 24000) {
  return new Promise((resolve, reject) => {
    const url = `https://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=${sampleRate}`;
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/raw',
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Deepgram STT ${res.statusCode}: ${body.substring(0, 200)}`));
          return;
        }
        try {
          const result = JSON.parse(body);
          const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
          resolve(transcript);
        } catch (e) {
          reject(new Error(`STT parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(audioBuffer);
    req.end();
    setTimeout(() => { req.destroy(); reject(new Error('STT timeout')); }, 30000);
  });
}

// --- LLM Comparison ---
function compareNormalization(original, transcript) {
  const result = compareTranscription(original, transcript);
  return {
    match: result.match,
    word_accuracy: result.word_accuracy,
    mismatched_words: result.incorrect_words.map(w => ({
      original: w.reference,
      heard: w.hypothesis,
      type: w.type,
    })),
    notes: `Normalized original: "${result.normalized_original}" | Normalized transcript: "${result.normalized_transcript}"`,
  };
}

async function compareLLM(original, transcript, method) {
  const systemPrompt = `You are evaluating whether a text-to-speech engine pronounced text correctly.

You receive an ORIGINAL text (what was sent to TTS) and a TRANSCRIPT (what speech-to-text heard back). Your job: did the TTS pronounce the content correctly? The transcript will differ in FORMAT from the original — that's expected. Focus on whether the SAME INFORMATION was conveyed.

CRITICAL RULES — read carefully:

1. ALPHANUMERIC CODES: Any code, ID, or identifier in the original that is spelled out character-by-character in the transcript is CORRECT.
   - "ORD-7X9K2B4M" heard as "o r d dash seven x nine k two b four m" → CORRECT
   - "INV-2024-ABC789" heard as "i n v dash two zero two four dash a b c seven eight nine" → CORRECT
   - "SN-A1B2C3D4E5" heard as "s n dash a one b two c three d four e five" → CORRECT
   - "1HGBH41JXMN109186" heard as "one h g b h four one j x m n one zero nine one eight six" → CORRECT

2. NUMBERS: Any representation that conveys the same numeric value is CORRECT.
   - "9400111899223033005088" heard as "nine four zero zero one one one eight nine nine..." → CORRECT (digit by digit)
   - "$320,540.54" heard as "three hundred twenty thousand five hundred and forty dollars and fifty four cents" → CORRECT
   - "2:30 PM" heard as "two thirty pm" → CORRECT
   - "$29.99" heard as "twenty nine dollars and ninety nine cents" → CORRECT

3. PUNCTUATION SPOKEN AS WORDS: Hyphens, dashes, periods, etc. spoken as words are CORRECT.
   - "-" heard as "dash" → CORRECT
   - "#" heard as "hashtag" or "number" → CORRECT
   - "." heard as "dot" or "period" → CORRECT

4. CASE DIFFERENCES: Ignore completely. "ABC" = "a b c" = "abc".

5. FILLER WORDS: Ignore "um", "uh", "like" in transcript.

6. ONLY flag as WRONG if the transcript contains a genuinely DIFFERENT value:
   - "ABC" heard as "A B D" → WRONG (C became D)
   - "$320,540" heard as "three hundred twenty thousand five hundred and fifty" → WRONG (540 became 550)
   - "4:45 PM" heard as "forty five pm" → WRONG (missing the "four" — should be "four forty five")

Return ONLY this JSON:
{
  "match": true/false,
  "word_accuracy": 0.0-1.0 (1.0 = perfect, 0.0 = completely wrong),
  "mismatched_words": [{"original": "...", "heard": "...", "type": "substitution|insertion|deletion"}],
  "notes": "one sentence explanation"
}

If everything was pronounced correctly, return match: true, word_accuracy: 1.0, mismatched_words: [].`;

  const userPrompt = `ORIGINAL: ${original}\nTRANSCRIPT: ${transcript}`;

  if (method === 'llm-haiku') {
    return callAnthropic(systemPrompt, userPrompt);
  } else if (method === 'llm-gpt') {
    return callOpenAI(systemPrompt, userPrompt);
  }
}

async function callAnthropic(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
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
          resolve(jsonMatch ? JSON.parse(jsonMatch[0]) : { match: false, word_accuracy: 0, error: 'no JSON' });
        } catch (e) {
          resolve({ match: false, word_accuracy: 0, error: e.message });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
    setTimeout(() => { req.destroy(); reject(new Error('Anthropic timeout')); }, 30000);
  });
}

async function callOpenAI(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });
    const req = https.request('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const text = result.choices?.[0]?.message?.content || '';
          resolve(JSON.parse(text));
        } catch (e) {
          resolve({ match: false, word_accuracy: 0, error: e.message });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
    setTimeout(() => { req.destroy(); reject(new Error('OpenAI LLM timeout')); }, 30000);
  });
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

  const methods = compareMethod === 'all'
    ? ['normalization', 'llm-haiku', 'llm-gpt']
    : [compareMethod];

  log(`TTS WER Benchmark`);
  log(`${activeConfigs.length} providers × ${activePrompts.length} prompts × ${ITERATIONS} iterations`);
  log(`Comparison: ${methods.join(', ')}`);
  log(`STT: Deepgram Nova-3`);
  log(`Output: ${outputDir}`);
  console.log('');

  // CSV header
  const csvPath = path.join(outputDir, 'wer-raw.csv');
  fs.writeFileSync(csvPath, 'provider,provider_label,prompt_id,category,subcategory,iteration,original,transcript,compare_method,match,word_accuracy,mismatched_words,notes,error,timestamp\n');

  for (const config of activeConfigs) {
    log(`▸ ${config.label}`);

    for (const prompt of activePrompts) {
      for (let i = 1; i <= ITERATIONS; i++) {
        let transcript = null;
        let error = null;
        let audioBuffer = null;

        // Step 1: TTS — generate audio and collect bytes
        try {
          audioBuffer = await generateAudio(config, prompt.text);
        } catch (err) {
          error = `TTS: ${err.message}`;
        }

        // Step 2: STT — transcribe audio
        if (audioBuffer && !error) {
          try {
            const { AUDIO_FORMATS } = require('./providers');
            const providerKey = config.id.startsWith('deepgram') ? 'deepgram'
              : config.id.startsWith('elevenlabs') ? 'elevenlabs'
              : config.id.startsWith('cartesia') ? 'cartesia'
              : config.id.startsWith('rime') ? 'rime'
              : config.id.startsWith('openai') ? 'openai' : 'deepgram';
            const fmt = AUDIO_FORMATS[providerKey];
            transcript = await transcribeAudio(audioBuffer, fmt.sampleRate);
          } catch (err) {
            error = `STT: ${err.message}`;
          }
        }

        // Step 3: Compare using each method
        if (transcript !== null && !error) {
          for (const method of methods) {
            let comparison = null;
            try {
              if (method === 'normalization') {
                comparison = compareNormalization(prompt.text, transcript);
              } else {
                comparison = await compareLLM(prompt.text, transcript, method);
              }
            } catch (err) {
              comparison = { match: false, word_accuracy: 0, error: err.message };
            }

            const csvLine = [
              config.id,
              `"${config.label}"`,
              prompt.id,
              prompt.category,
              prompt.subcategory,
              i,
              `"${prompt.text.replace(/"/g, '""')}"`,
              `"${(transcript || '').replace(/"/g, '""')}"`,
              method,
              comparison.match ?? false,
              comparison.word_accuracy ?? 0,
              `"${JSON.stringify(comparison.mismatched_words || []).replace(/"/g, '""')}"`,
              `"${(comparison.notes || '').replace(/"/g, '""')}"`,
              comparison.error ? `"${comparison.error}"` : '',
              new Date().toISOString(),
            ].join(',');
            fs.appendFileSync(csvPath, csvLine + '\n');

            const status = comparison.match ? '✓' : '✗';
            const accuracy = comparison.word_accuracy ? (comparison.word_accuracy * 100).toFixed(0) + '%' : '?';
            console.log(`  [${i}/${ITERATIONS}] #${prompt.id} ${method}: ${status} ${accuracy}${comparison.mismatched_words?.length ? ' — ' + comparison.mismatched_words.length + ' mismatches' : ''}`);

            // Save audio for mismatches so they can be spot-checked
            if (!comparison.match && audioBuffer) {
              const audioDir = path.join(outputDir, 'audio');
              fs.mkdirSync(audioDir, { recursive: true });
              const { AUDIO_FORMATS } = require('./providers');
              const providerKey = config.id.startsWith('deepgram') ? 'deepgram'
                : config.id.startsWith('elevenlabs') ? 'elevenlabs'
                : config.id.startsWith('cartesia') ? 'cartesia'
                : config.id.startsWith('rime') ? 'rime'
                : config.id.startsWith('openai') ? 'openai' : 'deepgram';
              const fmt = AUDIO_FORMATS[providerKey];
              const wavPath = path.join(audioDir, `${config.id}_prompt${prompt.id}_iter${i}.wav`);
              writeWav(wavPath, audioBuffer, fmt.sampleRate, fmt.bytesPerSample * 8);
            }
          }
        } else {
          // Log error row
          const csvLine = [
            config.id,
            `"${config.label}"`,
            prompt.id,
            prompt.category,
            prompt.subcategory,
            i,
            `"${prompt.text.replace(/"/g, '""')}"`,
            '',
            compareMethod,
            false,
            0,
            '',
            '',
            `"${(error || 'unknown').replace(/"/g, '""')}"`,
            new Date().toISOString(),
          ].join(',');
          fs.appendFileSync(csvPath, csvLine + '\n');
          console.log(`  [${i}/${ITERATIONS}] #${prompt.id} — ERROR: ${error}`);
        }

        await sleep(DELAY_MS);
      }
    }

    log(`  ✓ ${config.label} complete\n`);
  }

  // Generate summary
  generateSummary(csvPath, outputDir);
  log(`Done. Results in ${outputDir}`);
}

// --- WAV file writer ---
function writeWav(filePath, pcmBuffer, sampleRate, bitsPerSample = 16, numChannels = 1) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(filePath, Buffer.concat([header, pcmBuffer]));
}

// --- Generate audio and return raw buffer ---
async function generateAudio(config, text) {
  const result = await config.fn(text, config.opts);
  return result.audioBuffer;
}

function generateSummary(csvPath, outDir) {
  const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1);

  const byProvider = {};
  for (const line of lines) {
    const parts = []; let current = '', inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    parts.push(current);

    const provider = parts[1], category = parts[3];
    const accuracy = parseFloat(parts[10]) || 0;
    const error = parts[13];
    if (error) continue;

    if (!byProvider[provider]) byProvider[provider] = { all: [], byCategory: {} };
    byProvider[provider].all.push(accuracy);
    if (!byProvider[provider].byCategory[category]) byProvider[provider].byCategory[category] = [];
    byProvider[provider].byCategory[category].push(accuracy);
  }

  const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  let md = `# TTS WER Benchmark Results\n\n`;
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  md += `**Prompts:** ${prompts.length} | **Iterations:** ${ITERATIONS}\n`;
  md += `**STT:** Deepgram Nova-3 | **Comparison:** ${compareMethod}\n\n`;

  md += `## Overall Word Accuracy\n\n`;
  md += `| Rank | Provider | Mean Accuracy | N |\n`;
  md += `|---|---|---|---|\n`;
  const rows = Object.entries(byProvider).map(([label, d]) => ({ label, accuracy: mean(d.all), n: d.all.length }));
  rows.sort((a, b) => b.accuracy - a.accuracy);
  rows.forEach((r, i) => {
    md += `| ${i + 1} | ${r.label} | ${(r.accuracy * 100).toFixed(1)}% | ${r.n} |\n`;
  });

  md += `\n## Accuracy by Category\n\n`;
  const categories = ['baseline', 'alphanumeric', 'synthetic', 'mixed'];
  md += `| Provider | ${categories.join(' | ')} |\n`;
  md += `|---|${categories.map(() => '---').join('|')}|\n`;
  for (const [label, d] of Object.entries(byProvider)) {
    const catScores = categories.map(c => {
      const vals = d.byCategory[c];
      return vals ? (mean(vals) * 100).toFixed(1) + '%' : '-';
    });
    md += `| ${label} | ${catScores.join(' | ')} |\n`;
  }

  fs.writeFileSync(path.join(outDir, 'wer-summary.md'), md);

  // Print to console
  console.log('\n' + '='.repeat(60));
  console.log('WER SUMMARY');
  console.log('='.repeat(60));
  rows.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.label.padEnd(42)} ${(r.accuracy * 100).toFixed(1)}% accuracy (n=${r.n})`);
  });
  console.log('');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run().catch(err => {
  console.error('WER benchmark failed:', err);
  process.exit(1);
});
