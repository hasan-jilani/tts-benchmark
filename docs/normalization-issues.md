# Normalization Approach Issues for TTS WER Benchmarking

**Date:** 2026-03-15
**Source:** Coval's `wer_calculator.py` ported to JavaScript and tested against real TTS→STT output from Deepgram Aura-2

---

## Summary

Rule-based text normalization (Coval's approach) has fundamental limitations when comparing TTS pronunciation accuracy on alphanumeric and structured data — exactly the content categories where pronunciation accuracy matters most for voice agents.

The approach works well for simple conversational text but breaks down on the structured data that differentiates TTS providers.

---

## Bug 1: Alphanumeric Code Splitting

**Problem:** Alphanumeric codes like "ORD-7X9K2B4M" are kept as a single token in the normalized original, but the STT transcript spells them out character-by-character ("o r d dash seven x nine k two b four m"). The normalizer has no rule to break codes into individual characters for comparison.

**Example:**
```
Original:   "Your order number is ORD-7X9K2B4M."
Norm orig:  "your order number is ord 7x9k2b4m"
Transcript: "your order number is o r d dash seven x nine k two b four m"
Norm trans: "your order number is o r d dash 7 x 9 k 2 b 4 m"

Result: 0% accuracy (complete mismatch)
Human judgment: CORRECT — every character was pronounced accurately
```

**Root cause:** The normalizer dehyphenates and lowercases but doesn't break alphanumeric strings into individual characters. The STT output spells them out (because that's how the TTS spoke them), creating a token count mismatch that WER interprets as a total failure.

**Affected content:** Order IDs, confirmation codes, serial numbers, VINs, license plates, ticket IDs — all core voice agent content.

---

## Bug 2: Aggressive Number Squishing

**Problem:** The `squishNumbers` function removes ALL spaces between consecutive digits. When the STT transcript spells out a long number digit-by-digit ("nine four zero zero one one one..."), the number converter turns each word into a digit, then squish merges them — but incorrectly, because compound number words like "eleven" (11) get concatenated with adjacent digits.

**Example:**
```
Original:   "USPS tracking: 9400111899223033005088."
Norm orig:  "usps tracking 9400111899223033005088"
Transcript: "usps tracking nine four zero zero one one one eight nine nine two two three zero three three zero zero five zero eight eight"
Norm trans: "usps tracking 9411189922333588"

Result: 67% accuracy (1 substitution error)
Human judgment: CORRECT — every digit was pronounced accurately
```

**Root cause:** "one one one" → "1 1 1" → squish → "111" works. But "eight nine nine" → "8 9 9" → "899" works too. The problem is "one one" → "11" gets treated as compound "eleven" by the number converter before squishing, producing "11" instead of "1 1" → "11". The interaction between `sentenceToNumbers` and `squishNumbers` produces unpredictable results on long digit sequences.

**Affected content:** Tracking numbers, account numbers, any long numeric string.

---

## Bug 3: Currency Number Conversion Failure

**Problem:** When STT outputs spoken currency ("three hundred twenty thousand five hundred and forty dollars and fifty four cents"), the number-to-digit converter processes it in chunks, but scale words like "hundred" and "thousand" interact incorrectly with the compound number logic, producing wrong values.

**Example:**
```
Original:   "Your balance is $320,540.54."
Norm orig:  "your balance is 320540 dollars and 54 cents"
Transcript: "your balance is three hundred twenty thousand five hundred and forty dollars and fifty four cents"
Norm trans: "your balance is 300201000500 and 40 dollars and 5004 cents"

Result: 50% accuracy (2 errors)
Human judgment: CORRECT — the amount was spoken accurately
```

**Root cause:** "three hundred twenty thousand" should → "320000" but the converter processes "three" → "3", then "hundred" → multiply → "300", then "twenty" → "20" (not added to 300), then "thousand" → multiply → "20000", etc. The sequential word processing doesn't handle the full English number grammar correctly for large compound numbers.

**Affected content:** Dollar amounts, large numbers, financial data.

---

## Bug 4: VIN/Serial Character-by-Character Mismatch

**Problem:** Same as Bug 1 but compounded — VINs contain mixed letters and digits. The original "1HGBH41JXMN109186" stays as one token, while the transcript "one h g b h four one j x m n one zero nine one eight six" produces many tokens. Even after number conversion, the token count is completely different.

**Example:**
```
Original:   "The VIN is 1HGBH41JXMN109186."
Norm orig:  "the vin is 1hgbh41jxmn109186"
Transcript: "the vin is one h g b h four one j x m n one zero nine one eight six"
Norm trans: "the vin is 1 h g b h 41 j x m n 19186"

Result: 0% accuracy
Human judgment: CORRECT — every character was pronounced accurately
```

**Root cause:** Combination of Bug 1 (no character splitting) and Bug 2 (number squishing creates "41" from "four one" and "19186" from "one zero nine one eight six" via compound number logic).

---

## Bug 5: "dash" as Spoken Punctuation

**Problem:** TTS engines often speak hyphens/dashes as the word "dash" (e.g., "ORD dash 7X9K2B4M"). The normalizer doesn't map the word "dash" to a hyphen or remove it as punctuation, so it appears as an extra word causing an insertion error.

**Example:**
```
Norm trans includes: "o r d dash 7 x 9 k 2 b 4 m"
"dash" counted as an extra word = insertion error
```

**Root cause:** No normalization rule for spoken punctuation words. Should also handle "dot", "period", "comma", "colon", "slash", "at sign" etc.

---

## Fundamental Limitation

All five bugs share a root cause: **rule-based normalization cannot handle the many-to-many mapping between written text and spoken forms.** A single written token like "INV-2024-ABC789" has many valid spoken forms:

- "I N V dash two zero two four dash A B C seven eight nine"
- "INV dash twenty twenty-four dash ABC seven eighty-nine"
- "inventory number two zero two four A B C seven eight nine"

No finite set of normalization rules can enumerate all valid spoken forms. An LLM can — because it understands that all of these mean the same thing.

---

## Recommendation

1. **Don't use normalization as the primary WER comparison method for alphanumeric content.** It will produce false positives (marking correct pronunciations as errors) on exactly the content that matters most.
2. **Use normalization for simple content** (conversational, customer service) where it works well.
3. **Use LLM comparison for alphanumeric/structured content** where semantic equivalence matters.
4. **Or use LLM comparison for everything** — simpler architecture, more accurate on hard cases, marginally more expensive.
5. **Coval's numbers may be inflated** for providers that speak alphanumerics correctly but in a different format than the normalizer expects.
