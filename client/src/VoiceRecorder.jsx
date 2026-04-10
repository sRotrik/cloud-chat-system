// ============================================================
// client/src/components/VoiceRecorder.jsx
// Records audio via browser mic, shows live waveform, uploads
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import './VoiceRecorder.css';

const MAX_DURATION = 60; // seconds

export default function VoiceRecorder({ room, username, onSend, onCancel }) {
  const [state, setState]   = useState('idle');   // idle | recording | uploading
  const [duration, setDur]  = useState(0);
  const [bars, setBars]     = useState(Array(30).fill(4));

  const mediaRef     = useRef(null);
  const chunksRef    = useRef([]);
  const timerRef     = useRef(null);
  const analyserRef  = useRef(null);
  const animRef      = useRef(null);


  // ── Cleanup on unmount ─────────────────────────────────────
  useEffect(() => () => stopAll(), []);

  function stopAll() {
    clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    mediaRef.current?.stream?.getTracks().forEach(t => t.stop());
  }

  // ── Start recording ────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.start(100);
      setState('recording');

      // Duration timer
      timerRef.current = setInterval(() => {
        setDur(d => {
          if (d >= MAX_DURATION - 1) { stopRecording(); return d; }
          return d + 1;
        });
      }, 1000);

      // Waveform analyser
      const ctx      = new AudioContext();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;
      drawWaveform(analyser);

    } catch (err) {
      alert('Microphone access denied. Please allow mic permissions.');
      console.error('[VoiceRecorder]', err);
    }
  }

  // ── Live waveform animation ────────────────────────────────
  function drawWaveform(analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    function frame() {
      analyser.getByteFrequencyData(data);
      const newBars = Array.from({ length: 30 }, (_, i) => {
        const idx = Math.floor(i * data.length / 30);
        return Math.max(4, Math.round((data[idx] / 255) * 48));
      });
      setBars(newBars);
      animRef.current = requestAnimationFrame(frame);
    }
    animRef.current = requestAnimationFrame(frame);
  }

  // ── Stop and send ──────────────────────────────────────────
  async function stopRecording() {
    stopAll();
    setState('uploading');

    const recorder = mediaRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setState('idle'); return;
    }

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      await uploadAudio(blob);
    };
    recorder.stop();
  }

  async function uploadAudio(blob) {
    try {
      const formData = new FormData();
      formData.append('audio', blob, `voice_${Date.now()}.webm`);
      formData.append('username', username);
      formData.append('room', room);
      formData.append('duration', duration);

      const res  = await fetch('/api/voice/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        onSend({
          type:          'voice',
          voiceUrl:      data.url,
          voiceDuration: data.duration,
          waveform:      bars,
          text:          ''
        });
      } else {
        alert('Voice upload failed. Try again.');
      }
    } catch (err) {
      console.error('[uploadAudio]', err);
      alert('Upload error. Check your connection.');
    } finally {
      setState('idle');
      setDur(0);
      setBars(Array(30).fill(4));
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="voice-recorder">
      {state === 'idle' && (
        <button className="vr-btn vr-start" onClick={startRecording} title="Record voice message">
          🎤
        </button>
      )}

      {state === 'recording' && (
        <div className="vr-active">
          {/* Live waveform bars */}
          <div className="vr-waveform">
            {bars.map((h, i) => (
              <span key={i} className="vr-bar" style={{ height: h + 'px' }} />
            ))}
          </div>

          <span className="vr-duration">{formatDur(duration)}</span>

          <button className="vr-btn vr-cancel" onClick={() => { stopAll(); setState('idle'); setDur(0); onCancel?.(); }} title="Cancel">
            ✕
          </button>
          <button className="vr-btn vr-stop" onClick={stopRecording} title="Send voice message">
            ⬆
          </button>
        </div>
      )}

      {state === 'uploading' && (
        <div className="vr-uploading">
          <span className="vr-spinner" /> Sending...
        </div>
      )}
    </div>
  );
}

function formatDur(s) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
