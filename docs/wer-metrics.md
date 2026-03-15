# WER Benchmark Metrics

## Three metrics for TTS pronunciation accuracy

### WER (Word Error Rate)
Percentage of words mispronounced per comparison, averaged across all comparisons. Industry standard metric for speech accuracy. Lower is better.

**Formula:** `1 - (mean word accuracy across all comparisons)`

**What it tells you:** Overall pronunciation quality. A WER of 2.4% means on average, 97.6% of words in each utterance are pronounced correctly.

**Use for:** Headline benchmark comparisons, industry-standard reporting, Coval-comparable numbers.

---

### PER (Pronunciation Error Rate)
Percentage of comparisons with at least one pronunciation error of any severity (critical or minor). Lower is better.

**Formula:** `comparisons with any error / total comparisons`

**What it tells you:** How often the TTS makes any mistake at all. A PER of 14.4% means roughly 1 in 7 prompts has at least one error.

**Use for:** Reliability metric — "how often will my voice agent mispronounce something?"

---

### Critical PER
Percentage of comparisons with at least one critical error — wrong value or dropped content that would cause the customer to receive incorrect information. Lower is better.

**Formula:** `comparisons with critical severity / total comparisons`

**What it tells you:** How often the TTS produces output that would break a voice agent interaction. A critical PER of 10.2% means roughly 1 in 10 prompts has a factually incorrect pronunciation.

**Use for:** The voice agent metric. This is what sales reps should lead with — "would your customer hear the wrong number?"

---

## Error Severity Levels

### Critical
Wrong value or dropped content. The customer would receive incorrect or incomplete information.

Examples:
- "D" pronounced as "B" (wrong character)
- "NMMJBQ" pronounced as "NMM" (dropped JBQ)
- "$540" pronounced as "$550" (wrong amount)
- "4:45 PM" pronounced as "forty five PM" (missing the "four")

### Minor
Wrong grouping or pacing. The same digits/characters are present but grouped differently than expected. The information is technically correct but could cause confusion.

Examples:
- "1234" pronounced as "twelve thirty four" (same digits, different grouping)
- "8429" pronounced as "eight thousand four hundred twenty nine" (same value, not digit-by-digit)

---

## Category Hierarchy

### Top level (2)
- **Conversational** — Plain speech (customer service, agent prompts, IVR menus). Expect all providers to tie.
- **Alphanumeric** — Structured content where differentiation happens.

### Mid level (3 groups within alphanumeric)
- **Identifiers** — Codes, IDs, tracking numbers, VINs, serial numbers, confirmation codes, license plates, references/tickets.
- **Formatted Entities** — Currency, addresses, dates & times, numbers/percentages.
- **Mixed** — Conversational text with embedded alphanumeric data.

### Bottom level (13 subcategories)
Order IDs, tracking numbers, serial numbers, VINs, confirmation codes, references & tickets, license plates, currency, addresses, dates & times, numbers, customer-service, agent, ivr.

---

## Methodology

1. **TTS** — Send prompt text to provider, collect audio buffer
2. **STT** — Send audio to Deepgram Nova-3, get transcript
3. **Compare** — Send original + transcript to Claude Haiku, get match/accuracy/severity
4. **Repeat** — 3 iterations per prompt to capture non-deterministic pronunciation variation

### Why LLM comparison instead of normalization rules?
Rule-based normalization (Coval's approach) has fundamental limitations on alphanumeric content — it can't handle the many-to-many mapping between written text and spoken forms. See `docs/normalization-issues.md` for detailed analysis of 5 bugs.

Claude Haiku scored 10/10 on methodology validation (vs 8/10 for GPT-4o-mini and 2/10 for normalization rules).
