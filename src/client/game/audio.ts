let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
};

export const ensureAudioResumed = (): void => {
  const ac = getCtx();
  if (ac?.state === 'suspended') {
    void ac.resume();
  }
};

const playTone = (
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  detune = 0
): void => {
  const ac = getCtx();
  if (!ac) return;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
};

const playNoise = (duration: number, volume: number, hpFreq = 1000): void => {
  const ac = getCtx();
  if (!ac) return;

  const bufferSize = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hpFreq;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  source.start(ac.currentTime);
};

export const sfx = {
  nearMiss(combo: number): void {
    const baseFreq = 600 + combo * 100;
    playTone(baseFreq, 0.12, 0.15, 'sine');
    playTone(baseFreq * 1.5, 0.08, 0.08, 'sine');
  },

  hit(): void {
    playNoise(0.15, 0.2, 200);
    playTone(120, 0.2, 0.15, 'sawtooth');
  },

  death(): void {
    playNoise(0.4, 0.25, 80);
    playTone(80, 0.5, 0.2, 'sawtooth');
    playTone(60, 0.6, 0.15, 'sine');
  },

  riftSpawn(): void {
    playTone(200, 0.25, 0.06, 'sine');
    playTone(400, 0.15, 0.04, 'sine', 50);
  },

  milestone(): void {
    const t = getCtx()?.currentTime ?? 0;
    const ac = getCtx();
    if (!ac) return;

    const notes = [523, 659, 784];
    for (let i = 0; i < notes.length; i++) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i]!;
      gain.gain.setValueAtTime(0, t + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.12, t + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.3);
    }
  },

  countdown(): void {
    playTone(440, 0.15, 0.1, 'square');
  },

  countdownGo(): void {
    playTone(880, 0.25, 0.12, 'square');
    playTone(660, 0.15, 0.08, 'sine');
  },

  projectileFire(): void {
    playTone(150, 0.08, 0.03, 'sine', Math.random() * 100 - 50);
  },
};
