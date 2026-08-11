// generate-story-audio.mjs — synthesize 3 short, loopable, license-clean test
// tracks for Story Studio Music V1. Authored here (no third-party samples), so
// there is no licensing encumbrance. 22.05kHz 16-bit mono WAV, ~32s each.
// Written into BOTH public dirs: gallery-web/public/stories-audio (Vite/editor
// Player) and story-studio-remotion/public/stories-audio (copied into the
// Remotion render bundle via publicDir). staticFile('stories-audio/<x>.wav')
// resolves in both.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const SR = 22050;
const DUR = 32; // seconds
const N = SR * DUR;

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz
const adsr = (t, dur, a = 0.01, r = 0.15) => {
  if (t < a) return t / a;
  if (t > dur - r) return Math.max(0, (dur - t) / r);
  return 1;
};

// Soft detuned sine "voice" with a touch of a 2nd partial.
function voice(freq, t, dur) {
  const env = adsr(t % dur, dur);
  return env * (Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.12);
}

// Chord progressions (MIDI note numbers).
const TRACKS = {
  // Calm: slow pad, 4 chords, 4s each — warm and restrained (editorial).
  calm: { chordDur: 4, bpmPulse: 0, gain: 0.5, chords: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [55, 59, 62]] },
  // Warm: gentle arpeggio, moderate — wedding/cinematic feel.
  warm: { chordDur: 4, bpmPulse: 0, arp: true, gain: 0.5, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 64]] },
  // Upbeat: faster pulse + arpeggio — energetic/social (fast highlights).
  upbeat: { chordDur: 2, bpmPulse: 4, arp: true, gain: 0.5, chords: [[60, 64, 67], [57, 60, 64], [62, 65, 69], [59, 62, 67]] },
};

function synth(cfg) {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const chordIdx = Math.floor(t / cfg.chordDur) % cfg.chords.length;
    const chord = cfg.chords[chordIdx];
    let s = 0;
    if (cfg.arp) {
      const step = 0.28; // arp note length
      const which = Math.floor(t / step) % chord.length;
      s += voice(note(chord[which]), t, step) * 0.7;
      s += voice(note(chord[0] - 12), t, cfg.chordDur) * 0.25; // bass pad
    } else {
      for (const n of chord) s += voice(note(n), t, cfg.chordDur) * (0.5 / chord.length);
      s += voice(note(chord[0] - 12), t, cfg.chordDur) * 0.2;
    }
    if (cfg.bpmPulse) {
      const pulse = Math.pow(1 - ((t * cfg.bpmPulse) % 1), 2);
      s *= 0.7 + 0.3 * pulse;
    }
    out[i] = s * cfg.gain;
  }
  // simple normalize headroom
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < N; i++) out[i] *= k;
  return out;
}

const dirs = [
  path.resolve("public/stories-audio"),
  path.resolve("story-studio-remotion/public/stories-audio"),
];
for (const d of dirs) mkdirSync(d, { recursive: true });
for (const [name, cfg] of Object.entries(TRACKS)) {
  const buf = wav(synth(cfg));
  for (const d of dirs) writeFileSync(path.join(d, `${name}.wav`), buf);
  console.log(`${name}.wav  ${(buf.length / 1e6).toFixed(2)}MB  x${dirs.length} dirs`);
}
console.log("done");
