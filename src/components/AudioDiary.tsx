'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ============================================================
// Audio Diary - Narrative lore clips using Web Audio API
// ============================================================

interface DiaryEntry {
  id: number;
  title: string;
  speaker: string;
  duration: string;
  frequency: number;
  type: 'whisper' | 'radio' | 'heartbeat' | 'static';
  text: string;
}

const DIARY_ENTRIES: DiaryEntry[] = [
  {
    id: 1,
    title: 'Sujeto #3 - Primer Día',
    speaker: 'Dr. Castellano',
    duration: '0:12',
    frequency: 120,
    type: 'radio',
    text: '"Los primeros sujetos del Proyecto Eco fueron voluntarios... o eso les dijeron."',
  },
  {
    id: 2,
    title: 'Sujeto #7 - Las Paredes',
    speaker: 'Sujeto #7',
    duration: '0:08',
    frequency: 80,
    type: 'whisper',
    text: '"Puedo oír las paredes respirar. Están vivas. Todo está vivo aquí."',
  },
  {
    id: 3,
    title: 'Expediente #1138',
    speaker: 'Sistema de Archivo',
    duration: '0:15',
    frequency: 200,
    type: 'static',
    text: '"Sujeto completamente ciego. Responde a estímulos sonoros con agresividad extrema. Recomendación: terminación del proyecto."',
  },
  {
    id: 4,
    title: 'Nota de las Cloacas',
    speaker: 'Desconocido',
    duration: '0:10',
    frequency: 60,
    type: 'whisper',
    text: '"No están muertos. Están atrapados entre frecuencias. Puedes oírlos si escuchas con atención."',
  },
  {
    id: 5,
    title: 'Registro Final - La Torre',
    speaker: 'Comandante Reyes',
    duration: '0:14',
    frequency: 150,
    type: 'radio',
    text: '"La estática no es ruido. Es un millón de voces atrapadas pidiendo ayuda. Apaga la torre... cueste lo que cueste."',
  },
  {
    id: 6,
    title: 'Grafiti - Calle 7',
    speaker: 'Anónimo',
    duration: '0:06',
    frequency: 300,
    type: 'static',
    text: '"SON PERSONAS. SON PERSONAS. SON PERSONAS."',
  },
];

export default function AudioDiary() {
  const [playing, setPlaying] = useState<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getOrCreateAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      gainRef.current = audioCtxRef.current.createGain();
      gainRef.current.connect(audioCtxRef.current.destination);
    }
    return audioCtxRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    if (oscRef.current) {
      try { oscRef.current.stop(); } catch {}
      oscRef.current = null;
    }
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
    setPlaying(null);
    setProgress(0);
  }, []);

  const playEntry = useCallback((entry: DiaryEntry) => {
    stopPlayback();
    const ctx = getOrCreateAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    setPlaying(entry.id);

    const now = ctx.currentTime;
    const durationMap: Record<string, number> = { whisper: 4, radio: 6, static: 5, heartbeat: 4 };
    const duration = durationMap[entry.type] || 4;

    // Generate atmospheric audio
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    switch (entry.type) {
      case 'whisper':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(entry.frequency, now);
        osc.frequency.exponentialRampToValueAtTime(entry.frequency * 0.5, now + duration);
        oscGain.gain.setValueAtTime(0.05, now);
        oscGain.gain.linearRampToValueAtTime(0.12, now + duration * 0.3);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        break;
      case 'radio':
        osc.type = 'square';
        osc.frequency.setValueAtTime(entry.frequency, now);
        osc.frequency.setValueAtTime(entry.frequency * 1.2, now + duration * 0.2);
        osc.frequency.setValueAtTime(entry.frequency * 0.8, now + duration * 0.6);
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(0.08, now + 0.1);
        oscGain.gain.setValueAtTime(0.08, now + duration * 0.8);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        break;
      case 'static':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(entry.frequency, now);
        osc.frequency.linearRampToValueAtTime(entry.frequency * 2, now + duration * 0.5);
        osc.frequency.linearRampToValueAtTime(entry.frequency, now + duration);
        oscGain.gain.setValueAtTime(0.04, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        break;
      case 'heartbeat':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(40, now);
        oscGain.gain.setValueAtTime(0.15, now);
        // Simulate heartbeat rhythm
        for (let i = 0; i < Math.floor(duration / 0.8); i++) {
          const t = now + i * 0.8;
          oscGain.gain.setValueAtTime(0.15, t);
          oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          oscGain.gain.setValueAtTime(0.1, t + 0.2);
          oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        }
        break;
    }

    // Add noise layer
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(entry.type === 'static' ? 0.06 : 0.02, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = entry.frequency;
    filter.Q.value = 2;

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
    noise.start(now);
    noise.stop(now + duration);

    oscRef.current = osc;

    // Progress tracking
    const startTime = Date.now();
    const totalMs = duration * 1000;
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min(1, elapsed / totalMs));
      if (elapsed >= totalMs) {
        stopPlayback();
      }
    }, 100);
  }, [getOrCreateAudioCtx, stopPlayback]);

  useEffect(() => {
    return () => { stopPlayback(); };
  }, [stopPlayback]);

  const typeIcons: Record<string, string> = {
    whisper: '👤',
    radio: '📻',
    static: '📡',
    heartbeat: '💓',
  };

  return (
    <div className="space-y-2">
      {DIARY_ENTRIES.map(entry => {
        const isPlaying = playing === entry.id;
        return (
          <button
            key={entry.id}
            onClick={() => isPlaying ? stopPlayback() : playEntry(entry)}
            className="w-full p-3 border text-left transition-all hover:border-opacity-60"
            style={{
              borderColor: isPlaying ? 'rgba(0,229,255,0.5)' : 'rgba(0,229,255,0.1)',
              backgroundColor: isPlaying ? 'rgba(0,229,255,0.05)' : 'rgba(0,0,0,0.3)',
            }}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg">{typeIcons[entry.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs truncate" style={{ color: '#00e5ff' }}>
                    {entry.title}
                  </span>
                  <span className="font-mono text-[9px] flex-shrink-0" style={{ color: '#555' }}>
                    {entry.duration}
                  </span>
                </div>
                <div className="font-mono text-[9px] mt-0.5" style={{ color: '#666' }}>
                  {entry.speaker}
                </div>
                {/* Progress bar */}
                {isPlaying && (
                  <div className="mt-2 w-full h-1 rounded-full" style={{ background: 'rgba(0,229,255,0.1)' }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${progress * 100}%`,
                      background: '#00e5ff',
                      boxShadow: '0 0 6px rgba(0,229,255,0.5)',
                    }} />
                  </div>
                )}
                {/* Audio bars animation */}
                {isPlaying && (
                  <div className="flex items-end gap-0.5 mt-2 h-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="audio-bar" />
                    ))}
                  </div>
                )}
                {/* Text reveal on play */}
                {isPlaying && (
                  <div className="font-mono text-[10px] mt-2 italic" style={{ color: 'rgba(0,229,255,0.6)' }}>
                    {entry.text}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
