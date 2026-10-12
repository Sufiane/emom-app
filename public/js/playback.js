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

function writeWavHeader(view, numChannels, sampleRate, dataSize) {
  const blockAlign = numChannels * 2;

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
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
}

function toPcm16(sample) {
  const clamped = Math.max(-1, Math.min(1, sample));

  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

// Int16Array is little-endian on every platform the app targets.
function pcmToWav(pcm, sampleRate) {
  const out = new ArrayBuffer(44 + pcm.length * 2);

  writeWavHeader(new DataView(out), 1, sampleRate, pcm.length * 2);
  new Int16Array(out, 44).set(pcm);

  return new Blob([out], { type: 'audio/wav' });
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const blockAlign = numChannels * 2;
  const dataSize = audioBuffer.length * blockAlign;

  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  writeWavHeader(view, numChannels, sampleRate, dataSize);

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
    this.pendingUrl = null;
    this.silentUrl = null;
    this.primePromise = null;
    this.onEnded = null;
    this.complete = false;
    this.pcm = null;
    this.sampleRate = 0;
    this.trackSeconds = 0;
    this.tailSeconds = 0;
    this.userPaused = false;
    this.swap = null;
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
    if (this.audio == null) {
      return 0;
    }

    return this.swap == null ? this.audio.currentTime : this.swapPosition();
  }

  get paused() {
    if (this.swap != null) {
      return this.userPaused;
    }

    return this.audio != null && this.audio.paused;
  }

  // An <audio> element cannot splice chunks, so a short head track starts
  // playing at once and is replaced by longer prefix tracks (each roughly
  // double the last) at the same position as the chunks accumulate. Prefix
  // tracks stop before each chunk's tail because the next chunk's cues are
  // not summed into it yet; the final track is full length.
  async begin(rendered, onEnded, { isLast = true, trackSeconds = 0, tailSeconds = 0 } = {}) {
    if (this.audio == null) {
      return false;
    }

    await this.primePromise;

    if (this.audio == null) {
      return false;
    }

    this.onEnded = onEnded;
    this.complete = isLast;
    this.tailSeconds = tailSeconds;
    this.audio.addEventListener('ended', () => {
      if (this.complete) {
        this.onEnded();
      }
    });

    if (!isLast) {
      this.sampleRate = rendered.sampleRate;
      this.trackSeconds = rendered.length / rendered.sampleRate - tailSeconds;
      this.pcm = new Int16Array(Math.ceil(trackSeconds * rendered.sampleRate));
      this.mixInto(rendered, 0);
    }

    const head = isLast ? encodeWav(rendered) : this.prefixWav(this.trackSeconds);

    this.objectUrl = URL.createObjectURL(head);
    this.audio.src = this.objectUrl;
    this.audio.load();

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

  mixInto(rendered, from) {
    const data = rendered.getChannelData(0);
    const offset = Math.round(from * this.sampleRate);
    const count = Math.min(data.length, this.pcm.length - offset);

    for (let i = 0; i < count; i++) {
      this.pcm[offset + i] = Math.max(-0x8000, Math.min(0x7fff, this.pcm[offset + i] + toPcm16(data[i])));
    }
  }

  prefixWav(seconds) {
    const samples = Math.min(Math.round(seconds * this.sampleRate), this.pcm.length);

    return pcmToWav(this.pcm.subarray(0, samples), this.sampleRate);
  }

  async addChunk(rendered, from, isLast) {
    if (this.audio == null || this.pcm == null) {
      return false;
    }

    this.mixInto(rendered, from);

    const playableSeconds = from + rendered.length / this.sampleRate - this.tailSeconds;

    if (!isLast && playableSeconds < this.trackSeconds * 2) {
      return true;
    }

    const seconds = isLast ? this.pcm.length / this.sampleRate : playableSeconds;
    const swapped = await this.swapTo(this.prefixWav(seconds));

    if (swapped) {
      this.trackSeconds = seconds;
      this.complete = isLast;
    }

    return swapped;
  }

  swapPosition() {
    const open = this.swap.since == null ? 0 : performance.now() - this.swap.since;

    return this.swap.at + (this.swap.playedMs + open) / 1000;
  }

  loadSource(url) {
    const audio = this.audio;

    return new Promise((resolve) => {
      const done = (ok) => {
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('error', onError);
        resolve(ok);
      };
      const onLoaded = () => done(true);
      const onError = () => done(false);

      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('error', onError);
      audio.src = url;
      audio.load();
    });
  }

  // Loading resets the element, so the position is tracked here and pause or
  // resume taps during the load only change state; they are applied after.
  async swapTo(blob) {
    const audio = this.audio;

    this.swap = { at: audio.currentTime, playedMs: 0, since: this.userPaused ? null : performance.now() };
    this.pendingUrl = URL.createObjectURL(blob);

    const swapped = await this.loadSource(this.pendingUrl);

    if (this.audio !== audio) {
      return false;
    }

    if (swapped) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = this.pendingUrl;
    } else {
      URL.revokeObjectURL(this.pendingUrl);
      await this.loadSource(this.objectUrl);
    }

    this.pendingUrl = null;

    if (this.audio !== audio) {
      return false;
    }

    audio.currentTime = this.swapPosition();
    this.swap = null;

    let played = true;

    if (!this.userPaused) {
      played = await audio.play().then(() => true, () => false);
    }

    return swapped && played;
  }

  pause() {
    this.userPaused = true;

    if (this.swap != null) {
      if (this.swap.since != null) {
        this.swap.playedMs += performance.now() - this.swap.since;
        this.swap.since = null;
      }

      return;
    }

    if (this.audio != null && !this.audio.paused) {
      this.audio.pause();
    }
  }

  resume() {
    this.userPaused = false;

    if (this.swap != null) {
      this.swap.since ??= performance.now();

      return;
    }

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

    this.pcm = null;
    this.swap = null;

    for (const key of ['objectUrl', 'pendingUrl', 'silentUrl']) {
      if (this[key] != null) {
        URL.revokeObjectURL(this[key]);
        this[key] = null;
      }
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
    this.sources = [];
    this.onEnded = null;
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

  async begin(rendered, onEnded, { isLast = true } = {}) {
    if (this.stopped) {
      return false;
    }

    this.onEnded = onEnded;
    this.startedAt = this.ctx.currentTime;
    this.startSource(rendered, this.startedAt, isLast);

    return true;
  }

  async addChunk(rendered, from, isLast) {
    if (this.stopped || this.startedAt == null) {
      return false;
    }

    const when = this.startedAt + from;
    const late = this.ctx.currentTime - when;

    if (late <= 0) {
      this.startSource(rendered, when, isLast);

      return true;
    }

    console.warn(`audio chunk at ${from}s arrived ${late.toFixed(2)}s late`);

    if (late < (rendered.duration ?? Infinity)) {
      this.startSource(rendered, this.ctx.currentTime, isLast, late);
    } else if (isLast) {
      this.onEnded?.();
    }

    return true;
  }

  startSource(rendered, when, isLast, offset) {
    const source = this.ctx.createBufferSource();

    source.buffer = rendered;
    source.connect(this.ctx.destination);
    source.onended = () => {
      this.sources = this.sources.filter((active) => active !== source);

      if (isLast) {
        this.onEnded?.();
      }
    };
    source.start(when, offset);
    this.sources.push(source);
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

    for (const source of this.sources) {
      source.onended = null;

      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }

    this.sources = [];

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
