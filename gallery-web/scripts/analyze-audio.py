#!/usr/bin/env python3
"""Genuine beat/phrase analysis of the BUNDLED Story Studio tracks (scipy/numpy).

Spectral-flux onset envelope -> autocorrelation tempo -> peak-picked beats ->
phrase boundaries from onset novelty. These are OUR in-repo synthesized tracks,
so the resulting analysis ships as a static data file (no third-party media).

Usage: python3 scripts/analyze-audio.py
Writes: src/lib/storyStudio/musicAnalysis.json
"""
import os, json, glob
import numpy as np
from scipy.io import wavfile
from scipy.signal import find_peaks, stft

AUDIO_DIR = "story-studio-remotion/public/stories-audio"
OUT = "src/lib/storyStudio/musicAnalysis.json"

def analyze(path):
    sr, x = wavfile.read(path)
    if x.ndim > 1:
        x = x.mean(axis=1)
    x = x.astype(np.float64)
    x /= (np.max(np.abs(x)) or 1.0)
    dur = len(x) / sr

    # Onset envelope via spectral flux (half-wave rectified magnitude increases).
    hop = 512
    f, t, Z = stft(x, fs=sr, nperseg=1024, noverlap=1024 - hop)
    mag = np.abs(Z)
    flux = np.maximum(0.0, np.diff(mag, axis=1)).sum(axis=0)
    if flux.max() > 0:
        flux /= flux.max()
    env_sr = sr / hop
    env_t = t[1:]

    # Tempo via autocorrelation of the onset envelope (search 60..180 BPM).
    ac = np.correlate(flux - flux.mean(), flux - flux.mean(), mode="full")
    ac = ac[len(ac) // 2:]
    lo = int(env_sr * 60.0 / 180.0)   # min lag (fastest tempo)
    hi = int(env_sr * 60.0 / 60.0)    # max lag (slowest tempo)
    lag = lo + int(np.argmax(ac[lo:hi])) if hi > lo and hi < len(ac) else 0
    bpm = round(60.0 * env_sr / lag, 1) if lag > 0 else None
    beat_period = lag / env_sr if lag > 0 else 0.5

    # Peak-pick beats; enforce ~beat_period spacing so we get a clean grid.
    min_dist = max(1, int(0.8 * beat_period * env_sr))
    peaks, _ = find_peaks(flux, distance=min_dist, height=float(np.percentile(flux, 55)))
    beats = [round(float(env_t[p]), 3) for p in peaks if env_t[p] < dur]
    # If detection is sparse, fall back to a tempo grid from the first beat.
    if len(beats) < 4 and bpm:
        start = beats[0] if beats else 0.5
        beats = [round(start + k * beat_period, 3) for k in range(int((dur - start) / beat_period))]

    # Phrase boundaries: strong onset novelty peaks, spaced >= 3s apart.
    pk2, _ = find_peaks(flux, distance=int(3.0 * env_sr), height=float(np.percentile(flux, 85)))
    phrases = [round(float(env_t[p]), 3) for p in pk2 if env_t[p] < dur]

    # Energy envelope downsampled to ~10 Hz for coarse energy cues.
    step = max(1, int(env_sr / 10))
    energy = [round(float(v), 3) for v in flux[::step]]
    return {"durationSec": round(dur, 3), "bpm": bpm, "beatsSec": beats, "phrasesSec": phrases, "energy": energy}

out = {}
for path in sorted(glob.glob(os.path.join(AUDIO_DIR, "*.wav"))):
    tid = os.path.splitext(os.path.basename(path))[0]
    a = analyze(path)
    a["trackId"] = tid
    out[tid] = a
    print(f"{tid}: {a['durationSec']}s, bpm {a['bpm']}, {len(a['beatsSec'])} beats, {len(a['phrasesSec'])} phrases")

with open(OUT, "w") as fp:
    json.dump(out, fp, indent=2)
print(f"\nwrote {OUT}")
