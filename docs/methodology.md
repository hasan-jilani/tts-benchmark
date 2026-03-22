# TTS Benchmark Methodology

## Test Environment

| Detail | Value |
|---|---|
| **Machine** | MacBook Pro (Mac16,1 / MW2U3LL/A) |
| **Chip** | Apple M4 |
| **Memory** | 16 GB |
| **OS** | macOS 15.7.4 (Sequoia) |
| **Node.js** | v25.2.1 |
| **Network** | Wi-Fi, Google Fiber, Raleigh NC |
| **Connection** | Residential broadband |

All tests run from the same machine, same network, same session unless otherwise noted.

---

## Benchmark Modes

| Parameter | Internal | Publish |
|---|---|---|
| **Iterations per prompt** | 20 | 50 |
| **Warmup (discarded)** | 2 | 5 |
| **Kept for stats** | 18 | 45 |
| **Delay between requests** | 500ms | 500ms |
| **Delay between providers** | 2000ms | 2000ms |

---

## Methodology

### Execution
- **Sequential provider testing** — one provider at a time to avoid network contention and cross-provider interference
- Each provider completes all prompts × all iterations before moving to the next
- Warmup iterations are run first per prompt and discarded to eliminate cold start skew

### Metrics

**TTFA (Time to First Audio)**
- Measured from WebSocket `open` event to receipt of the first audio data chunk
- Captures perceived latency — how long a user waits before hearing the voice start speaking
- Unit: milliseconds

**RTF (Real-Time Factor)**
- Calculated as: `total_generation_time / audio_duration`
- `total_generation_time` = time from WebSocket open to stream completion (last chunk / done signal)
- `audio_duration` = derived from total audio bytes received: `totalBytes / bytesPerSample / sampleRate`
- Values below 1.0 mean faster than real-time (e.g., 0.5 = 2x real-time)
- Lower is better

### Stream Completion Detection
- **Deepgram:** `Flushed` JSON message from server
- **ElevenLabs:** `isFinal: true` JSON field, or 1000ms timeout after last chunk
- **Cartesia:** `done` message type, or 1000ms timeout after last chunk
- **Rime:** WebSocket `close` event

### Safety
- 30-second timeout per request — any request exceeding this is logged as an error
- Errors are recorded in raw CSV but excluded from summary statistics

---

## Provider Configurations

### 8 Benchmark Variants

| ID | Provider | Model | Voice | Audio Format | Sample Rate | Text Norm |
|---|---|---|---|---|---|---|
| `deepgram-aura2` | Deepgram | Aura-2 | aura-2-thalia-en | Linear16 PCM | 24000 Hz | N/A |
| `elevenlabs-flash-v2.5` | ElevenLabs | Flash v2.5 | Sarah (EXAVITQu4vr4xnSDxMaL) | PCM | 22050 Hz | N/A |
| `elevenlabs-turbo-v2.5` | ElevenLabs | Turbo v2.5 | Sarah (EXAVITQu4vr4xnSDxMaL) | PCM | 22050 Hz | N/A |
| `elevenlabs-multilingual-v2-norm-on` | ElevenLabs | Multilingual v2 | Sarah (EXAVITQu4vr4xnSDxMaL) | PCM | 22050 Hz | On |
| `elevenlabs-multilingual-v2-norm-off` | ElevenLabs | Multilingual v2 | Sarah (EXAVITQu4vr4xnSDxMaL) | PCM | 22050 Hz | Off |
| `cartesia-sonic` | Cartesia | Sonic-2 | f786b574-daa5-4673-aa0c-cbe3e8534c02 | PCM f32le | 24000 Hz | N/A |
| `rime-mistv2-norm-on` | Rime | Mist v2 | astra | PCM | 24000 Hz | On |
| `rime-mistv2-norm-off` | Rime | Mist v2 | astra | PCM | 24000 Hz | Off |

### Connection Details
- All providers use **WebSocket streaming** (WSS)
- Authentication: API key per provider (Deepgram uses Sec-WebSocket-Protocol subprotocol; others use headers)

### ElevenLabs Voice Settings
- Speed: 0.8
- Stability: 0.75
- Similarity boost: 0.75

---

## Test Corpus

25 prompts across 8 categories, designed to reflect real-world voice agent scenarios.

| Category | Count | Purpose |
|---|---|---|
| Conversational (short) | 3 | Baseline latency on minimal text |
| Conversational (medium) | 3 | Typical agent utterances |
| Conversational (long) | 2 | Extended responses, tests sustained streaming |
| Customer service | 3 | Core enterprise use case |
| IVR | 3 | Menu prompts, balances, hold messages |
| Alphanumeric | 6 | Order IDs, tracking numbers, serial numbers, confirmation codes |
| Mixed | 3 | Conversational text with embedded structured data |
| Casual chat | 2 | Informal conversational tone |

### Prompt Details

| ID | Category | Text | Length |
|---|---|---|---|
| 1 | conversational-short | "Hi there! How can I help you today?" | 36 |
| 2 | conversational-short | "Sure, let me look that up for you right now." | 46 |
| 3 | conversational-short | "Is there anything else I can help you with?" | 45 |
| 4 | conversational-medium | "I completely understand your frustration..." | 179 |
| 5 | conversational-medium | "Let me transfer you to our technical support team..." | 119 |
| 6 | conversational-medium | "Thanks for your patience while I pulled up your account..." | 145 |
| 7 | conversational-long | "I appreciate you calling in about this..." | 389 |
| 8 | conversational-long | "Welcome to Acme customer support..." | 302 |
| 9 | customer-service | "I'm so sorry for the inconvenience this has caused you." | 56 |
| 10 | customer-service | "Your refund of $147.99 has been processed..." | 108 |
| 11 | customer-service | "I've updated your shipping address..." | 96 |
| 12 | ivr | "Please hold while we connect you..." | 97 |
| 13 | ivr | "For billing inquiries, press 1..." | 86 |
| 14 | ivr | "Your current balance is $2,847.63..." | 60 |
| 15 | alphanumeric | "I found your order: INV-2024-ABC789." | 37 |
| 16 | alphanumeric | "Your USPS tracking number is 9400111899223033005088." | 53 |
| 17 | alphanumeric | "The serial number is SN-K7M9P2X4, model MDL-2024-A." | 53 |
| 18 | alphanumeric | "Your case reference is REF-2024-XK7M9P." | 41 |
| 19 | alphanumeric | "Your confirmation code is AJI0Y6." | 34 |
| 20 | alphanumeric | "The VIN is BDHWV00PRK52FPKH2." | 30 |
| 21 | mixed | "I'm looking up order REF-02DGTF now..." | 113 |
| 22 | mixed | "I have your address as 1247 Oak Street..." | 89 |
| 23 | mixed | "Your account number is 4821-7734-0092..." | 83 |
| 24 | casual | "Ha, yeah, that's a great question actually..." | 63 |
| 25 | casual | "Oh totally, I've seen that happen before..." | 107 |

---

## Statistical Analysis

For each provider, the following stats are calculated from kept iterations (warmup excluded):

- **Mean** — average across all runs
- **Median** — 50th percentile, robust to outliers
- **p95** — 95th percentile, represents worst-case-ish experience
- **p99** — 99th percentile
- **Stdev** — standard deviation, measures consistency
- **Min / Max** — range

---

## Output Files

Each benchmark run produces a timestamped directory under `results-latency/`:

| File | Contents |
|---|---|
| `raw.csv` | Every individual measurement (provider, prompt, iteration, TTFA, RTF, etc.) |
| `summary.csv` | Aggregated stats per provider (mean, median, p95, stdev, etc.) |
| `summary.md` | Formatted markdown with TTFA and RTF ranking tables |

---

## Known Limitations

1. **Single machine, single network** — results reflect latency from Raleigh NC over residential Google Fiber. Different regions will produce different absolute numbers.
2. **No server-side measurement** — TTFA includes network round-trip time, not just model inference time. This is intentional: it measures what a real customer's application would experience.
3. **WebSocket overhead varies by provider** — some providers have more handshake steps (e.g., ElevenLabs sends an init message before text). This is included in TTFA because it's part of the real-world experience.
4. **Audio format differences** — providers use different sample rates and bit depths. RTF calculation accounts for this, but audio quality is not directly comparable from byte counts alone.
5. **Single voice per provider** — results reflect one voice selection. Different voices may have different latency characteristics.
6. **Residential network variability** — Wi-Fi latency can fluctuate. Sequential testing and multiple iterations mitigate but don't eliminate this.
