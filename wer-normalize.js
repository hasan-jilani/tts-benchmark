/**
 * WER normalization and calculation — ported from Coval's wer_calculator.py
 * https://github.com/coval-ai/benchmarks/blob/main/wer_calculator.py
 *
 * Normalizes both original text and STT transcript to a canonical form,
 * then computes Word Error Rate via Levenshtein edit distance.
 */

// --- Dehyphenate ---
function dehyphenate(text) {
  return text.split(' ').map(word => {
    let result = '';
    for (let i = 0; i < word.length; i++) {
      if (i > 0 && i < word.length - 1 && word[i] === '-' &&
          /\w/.test(word[i - 1]) && /\w/.test(word[i + 1])) {
        result += ' ';
      } else {
        result += word[i];
      }
    }
    return result;
  }).join(' ');
}

// --- Number word to digit mapping ---
const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  million: 1000000, billion: 1000000000,
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

function sentenceToNumbers(sentence) {
  const words = sentence.split(' ');
  const result = [];
  let i = 0;

  while (i < words.length) {
    const currentWord = words[i];
    const current = currentWord.toLowerCase().replace(/[,.;:!?]+$/, '');

    // Date context check
    let isDateContext = false;
    if (i > 0 && MONTHS.includes(words[i - 1].toLowerCase().replace(/[,.;:!?]+$/, ''))) {
      isDateContext = true;
    } else if (i > 1 && MONTHS.includes(words[i - 2].toLowerCase().replace(/[,.;:!?]+$/, '')) &&
               words[i - 1].toLowerCase() === 'the') {
      isDateContext = true;
    }

    // Year pattern check (e.g., "twenty twenty-four" → "2024")
    if (current in WORD_TO_NUM && i + 1 < words.length) {
      const firstNum = WORD_TO_NUM[current];
      const nextWord = words[i + 1].toLowerCase().replace(/[,.;:!?]+$/, '');

      let isYearPattern = false;
      let yearValue = '';

      if (firstNum >= 20 && firstNum % 10 === 0 && firstNum < 100) {
        if (nextWord.includes('-')) {
          const parts = nextWord.split('-');
          if (parts.length === 2 && parts[0] in WORD_TO_NUM && parts[1] in WORD_TO_NUM) {
            if (String(WORD_TO_NUM[parts[0]]).endsWith('0') && WORD_TO_NUM[parts[1]] < 10) {
              const secondNum = WORD_TO_NUM[parts[0]] + WORD_TO_NUM[parts[1]];
              if (secondNum < 100) {
                yearValue = `${firstNum}${String(secondNum).padStart(2, '0')}`;
                isYearPattern = true;
              }
            }
          }
        } else if (nextWord in WORD_TO_NUM) {
          const secondNum = WORD_TO_NUM[nextWord];
          if (secondNum >= 20 && secondNum % 10 === 0) {
            yearValue = `${firstNum}${secondNum / 10}0`;
            isYearPattern = true;
          } else if (secondNum < 20) {
            yearValue = `${firstNum}${String(secondNum).padStart(2, '0')}`;
            isYearPattern = true;
          }
        }
      }

      if ((isDateContext || isYearPattern) && yearValue) {
        const punct = words[i + 1].replace(/[^,.;:!?]/g, '');
        result.push(yearValue + punct);
        i += 2;
        continue;
      }
    }

    // Hyphenated number (e.g., "twenty-four")
    if (current.includes('-') && current.split('-').some(p => p in WORD_TO_NUM)) {
      const parts = current.split('-');
      if (parts.length === 2 && parts[0] in WORD_TO_NUM && parts[1] in WORD_TO_NUM) {
        if (String(WORD_TO_NUM[parts[0]]).endsWith('0') && WORD_TO_NUM[parts[1]] < 10) {
          const numValue = WORD_TO_NUM[parts[0]] + WORD_TO_NUM[parts[1]];
          const punct = currentWord.replace(/[^,.;:!?]/g, '');
          result.push(String(numValue) + punct);
        } else {
          result.push(currentWord);
        }
      } else {
        result.push(currentWord);
      }
    }
    // Consecutive number words (e.g., "twenty four", "three hundred")
    else if (current in WORD_TO_NUM) {
      let numValue = WORD_TO_NUM[current];
      let j = i + 1;
      let compoundFound = false;

      while (j < words.length && words[j].toLowerCase().replace(/[,.;:!?]+$/, '') in WORD_TO_NUM) {
        const nextNum = WORD_TO_NUM[words[j].toLowerCase().replace(/[,.;:!?]+$/, '')];
        if (numValue > 0 && [100, 1000, 1000000, 1000000000].includes(nextNum)) {
          numValue *= nextNum;
          compoundFound = true;
        } else if (numValue % 10 === 0 && nextNum < 10) {
          numValue += nextNum;
          compoundFound = true;
        } else {
          break;
        }
        j++;
      }

      if (compoundFound) {
        const punct = words[j - 1].replace(/[^,.;:!?]/g, '');
        result.push(String(numValue) + punct);
        i = j - 1;
      } else {
        const punct = currentWord.replace(/[^,.;:!?]/g, '');
        result.push(String(numValue) + punct);
      }
    } else {
      result.push(currentWord);
    }
    i++;
  }

  let text = result.join(' ');
  text = convertOrdinals(text);
  text = cleanTimeExpressions(text);
  return text;
}

// --- Ordinals ---
const ORDINAL_MAP = {
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th',
  sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th',
  eleventh: '11th', twelfth: '12th', thirteenth: '13th', fourteenth: '14th',
  fifteenth: '15th', sixteenth: '16th', seventeenth: '17th', eighteenth: '18th',
  nineteenth: '19th', twentieth: '20th', thirtieth: '30th', fortieth: '40th',
  fiftieth: '50th', sixtieth: '60th', seventieth: '70th', eightieth: '80th',
  ninetieth: '90th', hundredth: '100th', thousandth: '1000th',
};

const TENS_MAP = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const UNITS_ORDINAL = {
  first: [1, 'st'], second: [2, 'nd'], third: [3, 'rd'], fourth: [4, 'th'],
  fifth: [5, 'th'], sixth: [6, 'th'], seventh: [7, 'th'], eighth: [8, 'th'], ninth: [9, 'th'],
};

function convertOrdinals(sentence) {
  return sentence.split(' ').map(currentWord => {
    const current = currentWord.toLowerCase().replace(/[,.;:!?]+$/, '');
    const punct = currentWord.replace(/[^,.;:!?]/g, '');

    // Hyphenated ordinal (e.g., "twenty-first")
    if (current.includes('-')) {
      const parts = current.split('-');
      if (parts.length === 2 && parts[0] in TENS_MAP && parts[1] in UNITS_ORDINAL) {
        const numValue = TENS_MAP[parts[0]] + UNITS_ORDINAL[parts[1]][0];
        let suffix = UNITS_ORDINAL[parts[1]][1];
        if (numValue % 100 >= 11 && numValue % 100 <= 13) suffix = 'th';
        return `${numValue}${suffix}${punct}`;
      }
    }

    // Simple ordinal
    if (current in ORDINAL_MAP) {
      return ORDINAL_MAP[current] + punct;
    }

    return currentWord;
  }).join(' ');
}

// --- Time expressions ---
function cleanTimeExpressions(sentence) {
  // "3 : 30 PM" → "3:30PM"
  let result = sentence.replace(/(\d+)\s*:\s*(\d+)\s*(am|pm|AM|PM)/gi, '$1:$2$3');
  // "3 o'clock" → "3:00"
  result = result.replace(/(\d+)\s*o'?clock/gi, '$1:00');
  return result;
}

// --- Currency ---
function formatMoney(sentence) {
  const currencyWords = {
    '$': 'dollars', '€': 'euros', '£': 'pounds', '¥': 'yen',
    '₹': 'rupees', '₽': 'rubles', '₩': 'won', '₿': 'bitcoin',
  };

  // $123.45 → "123 dollars and 45 cents"
  let result = sentence.replace(/([€$£¥₹₽₩₿])([0-9,]+)(?:\.([0-9]+))?/g, (_, symbol, whole, decimal) => {
    const word = currencyWords[symbol] || symbol;
    return decimal ? `${whole} ${word} and ${decimal} cents` : `${whole} ${word}`;
  });

  // 123$ → "123 dollars"
  result = result.replace(/([0-9,]+)(?:\.([0-9]+))?([€$£¥₹₽₩₿])/g, (_, whole, decimal, symbol) => {
    const word = currencyWords[symbol] || symbol;
    return decimal ? `${whole} ${word} and ${decimal} cents` : `${whole} ${word}`;
  });

  // 123 USD → "123 dollars"
  const codeWords = { USD: 'dollars', EUR: 'euros', GBP: 'pounds', JPY: 'yen', INR: 'rupees' };
  result = result.replace(/([0-9,]+)(?:\.([0-9]+))?\s*(USD|EUR|GBP|JPY|INR)/g, (_, whole, decimal, code) => {
    const word = codeWords[code] || code.toLowerCase();
    return decimal ? `${whole} ${word} and ${decimal} cents` : `${whole} ${word}`;
  });

  return result;
}

// --- Punctuation removal ---
function removePunctuation(text) {
  // Remove all punctuation except within numbers (e.g., 3.14, 1,000)
  return text.replace(/[^\w\s](?<!\d[.,]\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Squish numbers: "5 4 3" → "543" ---
function squishNumbers(sentence) {
  // Remove spaces between consecutive single digits
  return sentence.replace(/(\d)\s+(?=\d)/g, '$1');
}

// --- Main normalization pipeline ---
function normalizeText(text) {
  return squishNumbers(
    removePunctuation(
      formatMoney(
        convertOrdinals(
          sentenceToNumbers(
            dehyphenate(text.toLowerCase())
          )
        )
      )
    )
  );
}

// --- WER calculation (Levenshtein edit distance) ---
function calculateWER(reference, hypothesis) {
  const normRef = normalizeText(reference);
  const normHyp = normalizeText(hypothesis);

  const refWords = normRef.split(/\s+/).filter(w => w);
  const hypWords = normHyp.split(/\s+/).filter(w => w);

  if (refWords.length === 0) return { wer: 0, incorrectWords: [], normRef, normHyp };

  // Build DP matrix
  const d = Array(refWords.length + 1).fill(null).map(() => Array(hypWords.length + 1).fill(0));
  for (let i = 0; i <= refWords.length; i++) d[i][0] = i;
  for (let j = 0; j <= hypWords.length; j++) d[0][j] = j;

  for (let i = 1; i <= refWords.length; i++) {
    for (let j = 1; j <= hypWords.length; j++) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        d[i][j] = d[i - 1][j - 1];
      } else {
        d[i][j] = Math.min(
          d[i - 1][j - 1] + 1, // substitution
          d[i][j - 1] + 1,     // insertion
          d[i - 1][j] + 1,     // deletion
        );
      }
    }
  }

  const errorCount = d[refWords.length][hypWords.length];
  const wer = errorCount / refWords.length;

  // Backtrack to find specific errors
  const incorrectWords = [];
  let i = refWords.length, j = hypWords.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refWords[i - 1] === hypWords[j - 1]) {
      i--; j--;
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      incorrectWords.unshift({ type: 'substitution', reference: refWords[i - 1], hypothesis: hypWords[j - 1] });
      i--; j--;
    } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) {
      incorrectWords.unshift({ type: 'insertion', reference: null, hypothesis: hypWords[j - 1] });
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      incorrectWords.unshift({ type: 'deletion', reference: refWords[i - 1], hypothesis: null });
      i--;
    } else {
      break; // safety
    }
  }

  return { wer, incorrectWords, normRef, normHyp };
}

// --- Public API ---
function compareTranscription(originalText, transcription) {
  const { wer, incorrectWords, normRef, normHyp } = calculateWER(originalText, transcription);
  return {
    wer,
    match: wer === 0,
    word_accuracy: 1 - Math.min(wer, 1),
    incorrect_words: incorrectWords,
    normalized_original: normRef,
    normalized_transcript: normHyp,
  };
}

module.exports = { normalizeText, calculateWER, compareTranscription };
