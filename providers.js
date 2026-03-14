/**
 * Provider streaming implementations for TTS benchmarking.
 * Each provider returns a Promise that resolves with timing + audio metrics.
 */
const WebSocket = require('ws');

// --- Audio format constants per provider ---
const AUDIO_FORMATS = {
  deepgram:    { sampleRate: 24000, bytesPerSample: 2, encoding: 'linear16' },
  elevenlabs:  { sampleRate: 22050, bytesPerSample: 2, encoding: 'pcm_22050' },
  cartesia:    { sampleRate: 24000, bytesPerSample: 4, encoding: 'pcm_f32le' },
  rime:        { sampleRate: 24000, bytesPerSample: 2, encoding: 'pcm' },
};

/**
 * Calculate audio duration in ms from byte count and format info.
 */
function audioDurationMs(totalBytes, format) {
  return (totalBytes / format.bytesPerSample / format.sampleRate) * 1000;
}

// ============================================================
// Deepgram Aura-2
// ============================================================
function benchmarkDeepgram(text, { apiKey, voice = 'aura-2-thalia-en', baseUrl = null }) {
  return new Promise((resolve, reject) => {
    const fmt = AUDIO_FORMATS.deepgram;
    const base = baseUrl || 'wss://api.deepgram.com/v1/speak';
    const url = `${base}?model=${voice}&encoding=${fmt.encoding}&sample_rate=${fmt.sampleRate}`;
    const ws = new WebSocket(url, ['token', apiKey]);

    let startTime, ttfa = null, totalBytes = 0, done = false;

    ws.on('open', () => {
      startTime = Date.now();
      ws.send(JSON.stringify({ type: 'Speak', text }));
      ws.send(JSON.stringify({ type: 'Flush' }));
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (ttfa === null) ttfa = Date.now() - startTime;
        totalBytes += data.length;
      } else {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'Flushed' && !done) {
          done = true;
          const totalTime = Date.now() - startTime;
          ws.close();
          resolve({
            ttfa,
            totalTime,
            totalBytes,
            audioDuration: audioDurationMs(totalBytes, fmt),
            rtf: totalTime / audioDurationMs(totalBytes, fmt),
          });
        }
      }
    });

    ws.on('error', (err) => { if (!done) { done = true; reject(err); } });
    ws.on('close', () => {
      if (!done) {
        done = true;
        const totalTime = Date.now() - startTime;
        resolve({
          ttfa,
          totalTime,
          totalBytes,
          audioDuration: audioDurationMs(totalBytes, fmt),
          rtf: totalTime / audioDurationMs(totalBytes, fmt),
        });
      }
    });

    // Safety timeout — 30s
    setTimeout(() => { if (!done) { done = true; ws.close(); reject(new Error('Deepgram timeout')); } }, 30000);
  });
}

// ============================================================
// ElevenLabs (Flash v2.5, Turbo v2.5, Multilingual v2)
// ============================================================
function benchmarkElevenLabs(text, { apiKey, voice = 'EXAVITQu4vr4xnSDxMaL', model = 'eleven_flash_v2_5', textNormalization = null }) {
  return new Promise((resolve, reject) => {
    const fmt = AUDIO_FORMATS.elevenlabs;
    let url = `wss://api.elevenlabs.io/v1/text-to-speech/${voice}/stream-input?model_id=${model}&output_format=${fmt.encoding}`;
    if (textNormalization !== null) {
      url += `&apply_text_normalization=${textNormalization}`;
    }

    const ws = new WebSocket(url, { headers: { 'xi-api-key': apiKey } });

    let startTime, ttfa = null, totalBytes = 0, done = false;
    let audioTimeout = null;

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(audioTimeout);
      const totalTime = Date.now() - startTime;
      ws.close();
      resolve({
        ttfa,
        totalTime,
        totalBytes,
        audioDuration: audioDurationMs(totalBytes, fmt),
        rtf: totalTime / audioDurationMs(totalBytes, fmt),
      });
    }

    ws.on('open', () => {
      startTime = Date.now();
      // Init with space + settings
      ws.send(JSON.stringify({
        text: ' ',
        voice_settings: { speed: 0.8, stability: 0.75, similarity_boost: 0.75 },
        'xi-api-key': apiKey,
      }));
      // Send actual text
      ws.send(JSON.stringify({ text, try_trigger_generation: true }));
      // Signal end
      ws.send(JSON.stringify({ text: '' }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.audio) {
          const audioBytes = Buffer.from(msg.audio, 'base64');
          if (ttfa === null) ttfa = Date.now() - startTime;
          totalBytes += audioBytes.length;
          // Reset timeout — wait for more chunks
          clearTimeout(audioTimeout);
          audioTimeout = setTimeout(finish, 1000);
        }
        if (msg.isFinal) {
          finish();
        }
      } catch (e) {
        // non-JSON message, ignore
      }
    });

    ws.on('error', (err) => { if (!done) { done = true; reject(err); } });
    ws.on('close', () => finish());
    setTimeout(() => { if (!done) { done = true; ws.close(); reject(new Error('ElevenLabs timeout')); } }, 30000);
  });
}

// ============================================================
// Cartesia Sonic
// ============================================================
function benchmarkCartesia(text, { apiKey, voice = 'f786b574-daa5-4673-aa0c-cbe3e8534c02', model = 'sonic-turbo' }) {
  return new Promise((resolve, reject) => {
    const fmt = AUDIO_FORMATS.cartesia;
    const url = 'wss://api.cartesia.ai/tts/websocket';
    const ws = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Cartesia-Version': '2024-06-10',
      },
    });

    let startTime, ttfa = null, totalBytes = 0, done = false;
    let audioTimeout = null;
    const contextId = `bench_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(audioTimeout);
      const totalTime = Date.now() - startTime;
      ws.close();
      resolve({
        ttfa,
        totalTime,
        totalBytes,
        audioDuration: audioDurationMs(totalBytes, fmt),
        rtf: totalTime / audioDurationMs(totalBytes, fmt),
      });
    }

    ws.on('open', () => {
      startTime = Date.now();
      ws.send(JSON.stringify({
        model_id: model,
        transcript: text,
        voice: { mode: 'id', id: voice },
        language: 'en',
        output_format: {
          container: 'raw',
          encoding: fmt.encoding,
          sample_rate: fmt.sampleRate,
          num_channels: 1,
        },
        context_id: contextId,
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'chunk' && msg.data) {
          const audioBytes = Buffer.from(msg.data, 'base64');
          if (ttfa === null) ttfa = Date.now() - startTime;
          totalBytes += audioBytes.length;
          clearTimeout(audioTimeout);
          audioTimeout = setTimeout(finish, 1000);
        }
        if (msg.type === 'done' || msg.done === true) {
          finish();
        }
        if (msg.error) {
          if (!done) { done = true; reject(new Error(`Cartesia: ${msg.error}`)); }
        }
      } catch (e) {
        // non-JSON, ignore
      }
    });

    ws.on('error', (err) => { if (!done) { done = true; reject(err); } });
    ws.on('close', () => finish());
    setTimeout(() => { if (!done) { done = true; ws.close(); reject(new Error('Cartesia timeout')); } }, 30000);
  });
}

// ============================================================
// Rime Mist v2
// ============================================================
function benchmarkRime(text, { apiKey, speaker = 'astra', model = 'mistv2', noTextNormalization = true }) {
  return new Promise((resolve, reject) => {
    const fmt = AUDIO_FORMATS.rime;
    let url = `wss://users.rime.ai/ws?speaker=${speaker}&modelId=${model}&audioFormat=pcm&samplingRate=${fmt.sampleRate}&segment=immediate`;
    if (model === 'mistv2') {
      url += `&noTextNormalization=${noTextNormalization}`;
    }

    const ws = new WebSocket(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });

    let startTime, ttfa = null, totalBytes = 0, done = false;

    ws.on('open', () => {
      startTime = Date.now();
      ws.send(text);
      ws.send('<EOS>');
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (ttfa === null) ttfa = Date.now() - startTime;
        totalBytes += data.length;
      }
    });

    ws.on('error', (err) => { if (!done) { done = true; reject(err); } });
    ws.on('close', () => {
      if (!done) {
        done = true;
        const totalTime = Date.now() - startTime;
        resolve({
          ttfa,
          totalTime,
          totalBytes,
          audioDuration: audioDurationMs(totalBytes, fmt),
          rtf: totalTime / audioDurationMs(totalBytes, fmt),
        });
      }
    });

    setTimeout(() => { if (!done) { done = true; ws.close(); reject(new Error('Rime timeout')); } }, 30000);
  });
}

// ============================================================
// Benchmark configurations — all 8 variants
// ============================================================
function getConfigurations(env) {
  return [
    {
      id: 'deepgram-aura2',
      label: 'Deepgram Aura-2',
      fn: benchmarkDeepgram,
      opts: { apiKey: env.DEEPGRAM_API_KEY, voice: 'aura-2-thalia-en', baseUrl: env.DEEPGRAM_BASE_URL || null },
    },
    {
      id: 'elevenlabs-flash-v2.5',
      label: 'ElevenLabs Flash v2.5',
      fn: benchmarkElevenLabs,
      opts: { apiKey: env.ELEVENLABS_API_KEY, model: 'eleven_flash_v2_5' },
    },
    {
      id: 'elevenlabs-turbo-v2.5',
      label: 'ElevenLabs Turbo v2.5',
      fn: benchmarkElevenLabs,
      opts: { apiKey: env.ELEVENLABS_API_KEY, model: 'eleven_turbo_v2_5' },
    },
    {
      id: 'elevenlabs-multilingual-v2-norm-on',
      label: 'ElevenLabs Multilingual v2 (norm on)',
      fn: benchmarkElevenLabs,
      opts: { apiKey: env.ELEVENLABS_API_KEY, model: 'eleven_multilingual_v2', textNormalization: 'on' },
    },
    {
      id: 'elevenlabs-multilingual-v2-norm-off',
      label: 'ElevenLabs Multilingual v2 (norm off)',
      fn: benchmarkElevenLabs,
      opts: { apiKey: env.ELEVENLABS_API_KEY, model: 'eleven_multilingual_v2', textNormalization: 'off' },
    },
    {
      id: 'cartesia-sonic-turbo',
      label: 'Cartesia Sonic Turbo',
      fn: benchmarkCartesia,
      opts: { apiKey: env.CARTESIA_API_KEY, model: 'sonic-turbo' },
    },
    {
      id: 'cartesia-sonic-2',
      label: 'Cartesia Sonic 2',
      fn: benchmarkCartesia,
      opts: { apiKey: env.CARTESIA_API_KEY, model: 'sonic-2' },
    },
    {
      id: 'rime-mistv2-norm-on',
      label: 'Rime Mist v2 (norm on)',
      fn: benchmarkRime,
      opts: { apiKey: env.RIME_API_KEY, noTextNormalization: false },
    },
    {
      id: 'rime-mistv2-norm-off',
      label: 'Rime Mist v2 (norm off)',
      fn: benchmarkRime,
      opts: { apiKey: env.RIME_API_KEY, noTextNormalization: true },
    },
  ];
}

module.exports = { getConfigurations, AUDIO_FORMATS };
