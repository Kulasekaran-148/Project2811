// Microphone recording. Prefers MP4/AAC, which plays on every phone
// (including iPhones); falls back to WebM/Opus where MP4 isn't available.

const PREFERRED = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export const canRecord = () =>
  typeof window !== 'undefined' && !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mimeType = PREFERRED.find((t) => MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const startedAt = Date.now();

  return {
    startedAt,
    /** Stop and resolve with the recorded Blob. */
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: (rec.mimeType || mimeType || 'audio/webm').split(';')[0] }));
        };
        rec.stop();
      }),
    cancel: () => {
      try { rec.stop(); } catch { /* already stopped */ }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

// ---------- Playback (one shared player) ----------
let player;
export function playUrl(url) {
  if (!player) player = new Audio();
  player.pause();
  player.src = url;
  return player.play();
}
