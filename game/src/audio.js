// Procedural sound: no audio files, everything is an oscillator or a noise
// buffer built at run time. The engine hums with the throttle, a ring chimes,
// a touchdown thuds, a crash rattles. Sound starts only after a user gesture
// (the browser insists), and every call is safe before that — it just does
// nothing until the context exists.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    muted: false,
  };

  audio.unlock = function unlock() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 62;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
    } catch {
      audio.ctx = null;
    }
  };

  audio.engine = function engine(throttle, flying) {
    if (!audio.ctx || !audio.engineOsc || audio.muted) return;
    const t = audio.ctx.currentTime;
    audio.engineOsc.frequency.setTargetAtTime(58 + throttle * 95, t, 0.1);
    audio.engineGain.gain.setTargetAtTime(flying ? 0.035 + throttle * 0.05 : 0, t, 0.15);
  };

  audio.blip = function blip(freq, dur, type, vol) {
    if (!audio.ctx || audio.muted) return;
    try {
      const t = audio.ctx.currentTime;
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* sound is decoration, never a crash */ }
  };

  audio.chime = function chime() {
    audio.blip(880, 0.18, 'sine', 0.2);
    setTimeout(() => audio.blip(1318, 0.28, 'sine', 0.18), 90);
  };

  audio.thud = function thud() {
    audio.blip(120, 0.3, 'sine', 0.3);
    setTimeout(() => audio.blip(70, 0.35, 'sine', 0.22), 80);
  };

  audio.crash = function crash() {
    if (!audio.ctx || audio.muted) return;
    try {
      const t = audio.ctx.currentTime;
      const len = Math.floor(audio.ctx.sampleRate * 0.5);
      const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = audio.ctx.createGain();
      gain.gain.value = 0.3;
      src.connect(gain);
      gain.connect(audio.master);
      src.start(t);
      audio.blip(55, 0.5, 'sine', 0.3);
    } catch { /* sound is decoration, never a crash */ }
  };

  audio.toggleMute = function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.engineGain) audio.engineGain.gain.value = 0;
    return audio.muted;
  };

  return audio;
}
