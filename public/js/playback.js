// One-sample silent WAV. Playing this on the <audio> element inside the
// Start click captures user activation for that element, so the later
// swap to the rendered workout track (after an await for rendering) is
// allowed to auto-play on iOS.
function silentWavUrl() {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61,
    0x02, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);

  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const blockAlign = numChannels * 2;
  const dataSize = audioBuffer.length * blockAlign;
  const fileSize = 44 + dataSize;

  const out = new ArrayBuffer(fileSize);
  const view = new DataView(out);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];

  for (let channel = 0; channel < numChannels; channel++) {
    channels.push(audioBuffer.getChannelData(channel));
  }

  let offset = 44;

  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([out], { type: 'audio/wav' });
}

export class ElementPlayback {
  mixes = false;

  constructor() {
    this.audio = null;
    this.objectUrl = null;
    this.silentUrl = null;
    this.primePromise = null;
  }

  // Prime the element inside the caller's user gesture. The async render
  // would otherwise break the activation chain on iOS.
  prime() {
    this.silentUrl = silentWavUrl();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.playsInline = true;
    this.audio.src = this.silentUrl;
    this.primePromise = this.audio.play().catch(() => {});
  }

  get position() {
    return this.audio == null ? 0 : this.audio.currentTime;
  }

  get paused() {
    return this.audio != null && this.audio.paused;
  }

  async begin(rendered, onEnded) {
    if (this.audio == null) {
      return false;
    }

    await this.primePromise;

    if (this.audio == null) {
      return false;
    }

    this.objectUrl = URL.createObjectURL(encodeWav(rendered));
    this.audio.src = this.objectUrl;
    this.audio.load();
    this.audio.addEventListener('ended', onEnded);

    try {
      await this.audio.play();
    } catch {
      // Playback refused; the countdown UI keeps ticking and the user can Reset.
    }

    if (this.silentUrl != null) {
      URL.revokeObjectURL(this.silentUrl);
      this.silentUrl = null;
    }

    return true;
  }

  pause() {
    if (this.audio != null && !this.audio.paused) {
      this.audio.pause();
    }
  }

  resume() {
    if (this.audio != null && this.audio.paused) {
      this.audio.play().catch(() => {});
    }
  }

  stop() {
    if (this.audio != null) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }

    if (this.objectUrl != null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    if (this.silentUrl != null) {
      URL.revokeObjectURL(this.silentUrl);
      this.silentUrl = null;
    }
  }
}

export function audioContextClass() {
  return globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
}

// No media element means no audio-focus request, so the user's music keeps playing.
export class ContextPlayback {
  mixes = true;

  constructor(ContextClass) {
    this.ctx = new ContextClass();
    this.source = null;
    this.startedAt = null;
    this.isPaused = false;
    this.stopped = false;
    this.ctx.addEventListener?.('statechange', () => this.recover());
  }

  recover() {
    const interrupted = this.ctx.state === 'suspended' || this.ctx.state === 'interrupted';

    if (!this.isPaused && !this.stopped && interrupted) {
      this.ctx.resume().catch(() => {});
    }
  }

  prime() {
    this.ctx.resume().catch(() => {});
  }

  get position() {
    return this.startedAt == null ? 0 : this.ctx.currentTime - this.startedAt;
  }

  get paused() {
    return this.isPaused;
  }

  async begin(rendered, onEnded) {
    if (this.stopped) {
      return false;
    }

    this.source = this.ctx.createBufferSource();
    this.source.buffer = rendered;
    this.source.connect(this.ctx.destination);
    this.source.onended = onEnded;
    this.startedAt = this.ctx.currentTime;
    this.source.start();

    return true;
  }

  pause() {
    this.isPaused = true;
    this.ctx.suspend().catch(() => {});
  }

  resume() {
    this.isPaused = false;
    this.ctx.resume().catch(() => {});
  }

  stop() {
    this.stopped = true;

    if (this.source != null) {
      this.source.onended = null;

      try {
        this.source.stop();
      } catch {
        // Already stopped.
      }

      this.source = null;
    }

    this.ctx.close().catch(() => {});
  }
}

export function createPlayback(mixWithMusic) {
  const ContextClass = audioContextClass();

  if (mixWithMusic && ContextClass != null) {
    return new ContextPlayback(ContextClass);
  }

  return new ElementPlayback();
}
