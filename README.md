# TTS Benchmark

Latency benchmark for Text-to-Speech providers, measuring **TTFA** (Time to First Audio) and **RTF** (Real-Time Factor) across Deepgram, ElevenLabs, Cartesia, and Rime.

## Providers Tested

| Provider | Configs |
|---|---|
| Deepgram Aura-2 | 1 |
| ElevenLabs | 4 (Flash v2.5, Turbo v2.5, Multilingual v2 norm on/off) |
| Cartesia Sonic | 1 |
| Rime Mist v2 | 2 (norm on/off) |

## Prerequisites

You need your own API keys for each provider you want to benchmark. No keys are included in this repo.

| Provider | Get a key at |
|---|---|
| Deepgram | https://console.deepgram.com |
| ElevenLabs | https://elevenlabs.io |
| Cartesia | https://cartesia.ai |
| Rime | https://rime.ai |

You can run a subset of providers with `--providers` if you don't have keys for all of them.

## Quick Start

```bash
# Install
npm install

# Copy .env.example to .env and add your API keys
cp .env.example .env

# Run internal benchmark (20 iterations, ~25 min)
npm run benchmark

# Run publishable benchmark (50 iterations, ~1 hr)
npm run benchmark:publish
```

## Usage

```bash
# Full run — all 8 provider configs, all 25 prompts
node benchmark.js

# Specific providers only
node benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5

# Specific prompts only
node benchmark.js --prompts 1,2,3

# Publish mode (50 iterations, 5 warmup)
node benchmark.js --mode publish

# Backfill a provider into an existing run
node benchmark.js --append results/2026-03-14T13-08-26 --providers rime-mistv2-norm-on
```

## Output

Each run creates a timestamped directory under `results/`:

| File | Description |
|---|---|
| `raw.csv` | Every individual measurement |
| `summary.csv` | Aggregated stats per provider (mean, median, p95, p99, stdev) |
| `summary.md` | Formatted ranking tables |

## Metrics

- **TTFA (Time to First Audio)** — milliseconds from request to first audio chunk. What users perceive as latency.
- **RTF (Real-Time Factor)** — total generation time / audio duration. Lower = faster. An RTF of 0.5 means 2x real-time.

## Methodology

See [METHODOLOGY.md](METHODOLOGY.md) for full details on test environment, provider configurations, test corpus, and statistical approach.

## Test Corpus

25 prompts across 8 categories: short/medium/long conversational, customer service, IVR, alphanumeric (order IDs, tracking numbers), mixed, and casual chat. See [prompts.js](prompts.js) for the full list.
