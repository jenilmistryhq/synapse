// Kokoro runs in a worker so voice generation never locks up the case desk.
// The model is fetched from the public Hugging Face model and cached by the
// browser; case text is only sent to this local worker.
import { KokoroTTS, env } from '../vendor/kokoro.web.js';

env.wasmPaths = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/';

let model = null;
let loading = null;
let queue = Promise.resolve();

async function getModel() {
  if (model) return model;
  if (!loading) {
    loading = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: progress => self.postMessage({ type: 'progress', progress }),
    }).then(tts => { model = tts; return tts; }).catch(error => { loading = null; throw error; });
  }
  return loading;
}

async function synthesize({ id, text, voice, speed }) {
  try {
    const tts = await getModel();
    const result = await tts.generate(text, { voice, speed });
    const pcm = result.audio;
    self.postMessage({ type: 'audio', id, pcm: pcm.buffer, sampleRate: result.sampling_rate }, [pcm.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: String(error && error.message || error) });
  }
}

self.addEventListener('message', event => {
  const message = event.data;
  if (!message || message.type !== 'synthesize') return;
  queue = queue.then(() => synthesize(message));
});
