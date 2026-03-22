# TTS Latency Benchmark

Measures TTFA (Time to First Audio) and RTF (Real-Time Factor) for Text-to-Speech providers: Deepgram, ElevenLabs, Cartesia, Rime, and OpenAI.

## Prerequisites

API keys for each provider you want to benchmark. No keys are included in this repo.

| Key | Get it at |
|---|---|
| `DEEPGRAM_API_KEY` | https://console.deepgram.com |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io |
| `CARTESIA_API_KEY` | https://cartesia.ai |
| `RIME_API_KEY` | https://rime.ai |
| `OPENAI_API_KEY` | https://platform.openai.com |

You can run a subset of providers with `--providers` if you don't have keys for all of them.

## Quick Start

```bash
npm install
cp .env.example .env   # Add your API keys

node latency-benchmark.js --providers deepgram-aura2,elevenlabs-flash-v2.5
node latency-benchmark.js --all                            # All providers
node latency-benchmark.js --all --runs 50                  # 50 runs per prompt
node latency-benchmark.js --providers deepgram-aura2 --prompts 1,2,3  # Specific prompts
node latency-benchmark.js --retry-errors                   # Re-run all failed rows
node latency-benchmark.js --summarize                      # Regenerate summary from CSVs
```

Default: 20 runs per prompt (18 kept, 2 warmup). Auto-skips providers that already have enough data. Results accumulate in per-provider CSVs under `results-latency/`.

## Metrics

- **TTFA (Time to First Audio)** — milliseconds from request to first audio chunk. Measures perceived latency.
- **RTF (Real-Time Factor)** — `total_generation_time / audio_duration`. Values below 1.0 mean faster than real-time. Lower is better.

## Providers

| ID | Provider | Model | Voice | Audio Format | Sample Rate |
|---|---|---|---|---|---|
| `deepgram-aura2` | Deepgram | Aura-2 | aura-2-thalia-en | Linear16 PCM | 24000 Hz |
| `elevenlabs-flash-v2.5` | ElevenLabs | Flash v2.5 | Sarah | PCM | 22050 Hz |
| `elevenlabs-v3` | ElevenLabs | v3 (HTTP) | Sarah | PCM | 22050 Hz |
| `elevenlabs-multilingual-v2-norm-on` | ElevenLabs | Multilingual v2 | Sarah | PCM | 22050 Hz |
| `elevenlabs-multilingual-v2-norm-off` | ElevenLabs | Multilingual v2 | Sarah | PCM | 22050 Hz |
| `cartesia-sonic-turbo` | Cartesia | Sonic Turbo | — | PCM f32le | 24000 Hz |
| `cartesia-sonic-3` | Cartesia | Sonic 3 | — | PCM f32le | 24000 Hz |
| `cartesia-sonic-2` | Cartesia | Sonic 2 | — | PCM f32le | 24000 Hz |
| `rime-mistv2-norm-on` | Rime | Mist v2 (norm on) | astra | PCM | 24000 Hz |
| `rime-mistv2-norm-off` | Rime | Mist v2 (norm off) | astra | PCM | 24000 Hz |
| `openai-gpt-4o-mini-tts` | OpenAI | gpt-4o-mini-tts | alloy | PCM | 24000 Hz |
| `openai-tts-1` | OpenAI | tts-1 | alloy | PCM | 24000 Hz |
| `openai-tts-1-hd` | OpenAI | tts-1-hd | alloy | PCM | 24000 Hz |

All providers use WebSocket streaming except OpenAI and ElevenLabs v3 (HTTP streaming).

## Test Corpus

25 prompts across 8 categories designed to reflect real-world voice agent scenarios. See [prompts-latency.js](prompts-latency.js).

| Category | Count | Purpose |
|---|---|---|
| Conversational (short) | 3 | Baseline latency on minimal text |
| Conversational (medium) | 3 | Typical agent utterances |
| Conversational (long) | 2 | Extended responses, sustained streaming |
| Customer service | 3 | Core enterprise use case |
| IVR | 3 | Menu prompts, balances, hold messages |
| Alphanumeric | 6 | Order IDs, tracking numbers, serial numbers |
| Mixed | 3 | Conversational text with embedded structured data |
| Casual chat | 2 | Informal conversational tone |

## Methodology

See [docs/methodology.md](docs/methodology.md) for test environment, provider configurations, and statistical approach.
