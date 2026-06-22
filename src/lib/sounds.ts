// Synthesized Web Audio sounds — no external files needed

let _ctx: AudioContext | null = null

function ac(): AudioContext {
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

function tone(freq: number, type: OscillatorType, duration: number, vol: number, delay = 0) {
  const c = ac()
  const osc = c.createOscillator()
  const g = c.createGain()
  const t = c.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(g); g.connect(c.destination)
  osc.start(t); osc.stop(t + duration + 0.01)
}

function sweep(freqA: number, freqB: number, type: OscillatorType, duration: number, vol: number, delay = 0) {
  const c = ac()
  const osc = c.createOscillator()
  const g = c.createGain()
  const t = c.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(freqA, t)
  osc.frequency.exponentialRampToValueAtTime(freqB, t + duration)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(g); g.connect(c.destination)
  osc.start(t); osc.stop(t + duration + 0.01)
}

function noiseBurst(duration: number, vol: number, loHz = 200, hiHz = 2000, delay = 0) {
  const c = ac()
  const n = Math.ceil(c.sampleRate * (duration + 0.02))
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1

  const src = c.createBufferSource()
  src.buffer = buf
  const flt = c.createBiquadFilter()
  flt.type = 'bandpass'
  flt.frequency.value = (loHz + hiHz) / 2
  flt.Q.value = 0.8
  const g = c.createGain()
  const t = c.currentTime + delay
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(flt); flt.connect(g); g.connect(c.destination)
  src.start(t); src.stop(t + duration + 0.02)
}

export const sounds = {
  save() {
    // Mechanical click: sharp noise snap + brief high tone
    noiseBurst(0.035, 0.1, 900, 4000)
    tone(1100, 'sine', 0.055, 0.045)
  },

  run() {
    // Ascending launch sequence: C5 → E5 → G5 → C6
    tone(523,  'triangle', 0.09, 0.08,  0)
    tone(659,  'triangle', 0.09, 0.08,  0.065)
    tone(784,  'triangle', 0.09, 0.08,  0.13)
    tone(1047, 'sine',     0.14, 0.055, 0.195)
  },

  error() {
    // Descending glitch buzz
    sweep(380, 140, 'sawtooth', 0.09, 0.055, 0)
    noiseBurst(0.06, 0.04, 100, 600, 0.05)
    sweep(200, 90,  'square',   0.08, 0.03,  0.08)
  },

  success() {
    // Clean ascending chime pair
    tone(880,  'sine', 0.11, 0.07, 0)
    tone(1320, 'sine', 0.14, 0.05, 0.09)
  },

  zenOn() {
    // Deep resonant sweep — entering focus
    sweep(60, 240, 'sine', 0.55, 0.11)
    tone(480, 'sine', 0.35, 0.045, 0.07)
    tone(960, 'sine', 0.22, 0.02,  0.14)
    noiseBurst(0.1, 0.025, 300, 1200, 0.1)
  },

  zenOff() {
    // Quick breath out — exiting focus
    sweep(300, 120, 'sine', 0.12, 0.07)
    tone(180, 'sine', 0.14, 0.04, 0.04)
  },

  tab() {
    // Barely-there tick
    noiseBurst(0.018, 0.045, 1200, 5000)
  },

  node() {
    // Water-drop bloop
    sweep(700, 220, 'sine', 0.17, 0.1)
  },

  openFolder() {
    // Soft unlock whoosh
    sweep(200, 500, 'sine', 0.2, 0.05)
    noiseBurst(0.12, 0.035, 300, 2000, 0.04)
  },

  close() {
    // Subtle close tick
    sweep(400, 200, 'sine', 0.09, 0.05)
  },
}
