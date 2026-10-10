/**
 * Cash App Integration Helper for Wait & Return Prototype
 * Synthesizes Cash App notification chime and formats payment payloads.
 */

/**
 * Synthesizes Cash App signature two-tone chime via Web Audio API
 */
export function playCashAppChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Primary bright tone 1 (F#5 - 740 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(740, now);
    gain1.gain.setValueAtTime(0.22, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.28);

    // Accent bright tone 2 (C#6 - 1108.73 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1108.73, now + 0.08);
    gain2.gain.setValueAtTime(0.28, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.42);
  } catch (err) {
    console.log('AudioContext not allowed or not supported yet', err);
  }
}

/**
 * Format a Cash App handle
 */
export function formatCashTag(tag) {
  let clean = (tag || '').trim();
  if (!clean) return '$rider_demo';
  return clean.startsWith('$') ? clean : '$' + clean;
}
