# TTS Benchmark

Latency and pronunciation accuracy benchmarks for Text-to-Speech providers across Deepgram, ElevenLabs, Cartesia, Rime, and OpenAI.

## Two Benchmarks

| Benchmark | Script | What it measures |
|---|---|---|
| **Latency** | `latency-benchmark.js` | TTFA (Time to First Audio) — how fast audio starts |
| **WER** | `wer-benchmark.js` | Pronunciation accuracy — does the TTS say the words correctly |

## Prerequisites

API keys for each provider you want to benchmark. No keys are included in this repo.

| Key | Used by | Get it at |
|---|---|---|
| `DEEPGRAM_API_KEY` | Latency + WER (TTS and STT) | https://console.deepgram.com |
| `ELEVENLABS_API_KEY` | Latency + WER | https://elevenlabs.io |
| `CARTESIA_API_KEY` | Latency + WER | https://cartesia.ai |
| `RIME_API_KEY` | Latency + WER | https://rime.ai |
| `OPENAI_API_KEY` | Latency + WER | https://platform.openai.com |
| `ANTHROPIC_API_KEY` | WER only (Haiku for pronunciation evaluation) | https://console.anthropic.com |

You can run a subset of providers with `--providers` if you don't have keys for all of them.

## Quick Start

```bash
npm install
cp .env.example .env   # Add your API keys

# Latency benchmark
node latency-benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5

# WER benchmark
node wer-benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5 --compare llm-haiku
```

## Latency Benchmark

```bash
node latency-benchmark.js --providers deepgram-aura2       # Specific providers
node latency-benchmark.js --all                            # All providers
node latency-benchmark.js --all --runs 50                  # 50 runs per prompt
node latency-benchmark.js --providers deepgram-aura2 --prompts 1,2,3  # Specific prompts
```

Default: 20 runs per prompt (18 kept, 2 warmup). Auto-skips providers that already have enough data. All results accumulate in `results/latency-raw.csv`.

## WER Benchmark

```bash
node wer-benchmark.js --providers deepgram-aura2 --compare llm-haiku
node wer-benchmark.js --all --compare llm-haiku
node wer-benchmark.js --providers deepgram-aura2 --prompts 22,46 --compare llm-haiku
```

Default: 3 iterations per prompt. Uses Deepgram Nova-3 for STT and Claude Haiku for pronunciation evaluation. Results accumulate in `results-wer/wer-raw.csv`. Audio files for mismatches saved in `results-wer/audio/` organized by category/subcategory/prompt.

## Metrics

### Latency
- **TTFA (Time to First Audio)** — milliseconds from request to first audio chunk

### WER
- **WER (Word Error Rate)** — percentage of words mispronounced, averaged across comparisons
- **PER (Pronunciation Error Rate)** — percentage of comparisons with at least one error
- **Critical PER** — percentage of comparisons with wrong value or dropped content

See [docs/wer-metrics.md](docs/wer-metrics.md) for detailed metric definitions and severity levels.

## Self-Hosted Deepgram

Set `DEEPGRAM_BASE_URL` in `.env` to benchmark a self-hosted instance:

```
DEEPGRAM_BASE_URL=wss://your-internal-instance.deepgram.com/v1/speak
```

## Methodology

See [METHODOLOGY.md](METHODOLOGY.md) for test environment, provider configurations, and statistical approach. See [docs/normalization-issues.md](docs/normalization-issues.md) for why we use LLM comparison instead of rule-based normalization.

## Test Corpora

- **Latency**: 25 prompts across 8 categories. See [prompts.js](prompts.js).
- **WER**: 80 prompts across 13 subcategories (conversational, identifiers, formatted entities, mixed). See [prompts-wer.js](prompts-wer.js).
