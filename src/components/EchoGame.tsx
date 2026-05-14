'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { EchoGameEngine } from '@/game/engine';
import { GameState } from '@/game/types';

export default function EchoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EchoGameEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [isStarted, setIsStarted] = useState(false);

  const handleStart = useCallback(async () => {
    if (!engineRef.current) return;
    await engineRef.current.startGame();
    setGameState('playing');
    setIsStarted(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const engine = new EchoGameEngine();
    engine.init(canvas);
    engine.onStateChange = (state: GameState) => {
      setGameState(state);
    };
    engineRef.current = engine;

    engine.startLoop();

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      engine.resize(rect.width, rect.height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden cursor-crosshair select-none"
      onClick={() => {
        if (gameState === 'playing' && canvasRef.current) {
          canvasRef.current.requestPointerLock();
        }
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Menu overlay */}
      {!isStarted && gameState === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
          {/* Animated scanline background */}
          <div className="absolute inset-0 opacity-[0.04] animate-scanlines pointer-events-none">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  0deg,
                  transparent,
                  transparent 2px,
                  rgba(0,229,255,0.06) 2px,
                  rgba(0,229,255,0.06) 4px
                )`,
              }}
            />
          </div>

          {/* Floating particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 rounded-full"
                style={{
                  backgroundColor: 'rgba(0,229,255,0.15)',
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `pulse-glow ${3 + Math.random() * 4}s ease-in-out infinite ${Math.random() * 3}s`,
                }}
              />
            ))}
          </div>

          {/* Title */}
          <div className="text-center mb-10 relative animate-text-flicker">
            <h1
              className="text-5xl md:text-7xl font-mono font-bold tracking-[0.3em] mb-2"
              style={{
                color: '#00e5ff',
                textShadow: '0 0 20px rgba(0,229,255,0.5), 0 0 40px rgba(0,229,255,0.3), 0 0 80px rgba(0,229,255,0.1)',
              }}
            >
              ECHOES
            </h1>
            <h2
              className="text-2xl md:text-4xl font-mono tracking-[0.2em] mb-4"
              style={{
                color: '#0097a7',
                textShadow: '0 0 10px rgba(0,151,167,0.4)',
              }}
            >
              OF THE STATIC
            </h2>
            <div
              className="text-sm md:text-base font-mono tracking-wide opacity-50"
              style={{ color: '#004d40' }}
            >
              Ecos de la Estática
            </div>
          </div>

          {/* Concept */}
          <div
            className="max-w-md text-center mb-10 px-6 font-mono text-sm leading-relaxed space-y-3"
          >
            <p style={{ color: 'rgba(0,229,255,0.45)' }}>
              Estás ciego en la oscuridad.
              <br />
              Solo puedes ver a través del sonido.
            </p>
            <p style={{ color: 'rgba(255,23,68,0.5)' }} className="text-base">
              Pero ellas también te escuchan.
            </p>
          </div>

          {/* Rules */}
          <div
            className="max-w-sm mb-10 px-6 space-y-2"
          >
            <div className="flex items-center gap-3 font-mono text-xs" style={{ color: 'rgba(0,229,255,0.35)' }}>
              <span style={{ color: 'rgba(0,229,255,0.6)' }}>◈</span>
              <span>Haz ruido para ver tu entorno</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs" style={{ color: 'rgba(0,229,255,0.35)' }}>
              <span style={{ color: 'rgba(255,23,68,0.6)' }}>◈</span>
              <span>El ruido atrae a las entidades</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs" style={{ color: 'rgba(0,229,255,0.35)' }}>
              <span style={{ color: 'rgba(118,255,3,0.6)' }}>◈</span>
              <span>Encuentra la salida para sobrevivir</span>
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            className="group relative px-10 py-4 font-mono text-lg tracking-[0.2em] border transition-all duration-300 hover:scale-105 active:scale-95"
            style={{
              color: '#00e5ff',
              borderColor: 'rgba(0,229,255,0.25)',
              backgroundColor: 'rgba(0,229,255,0.03)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#00e5ff';
              e.currentTarget.style.backgroundColor = 'rgba(0,229,255,0.08)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(0,229,255,0.15), inset 0 0 30px rgba(0,229,255,0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,229,255,0.25)';
              e.currentTarget.style.backgroundColor = 'rgba(0,229,255,0.03)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            ENTRAR EN LA OSCURIDAD
          </button>

          {/* Controls */}
          <div
            className="mt-10 font-mono text-[10px] text-center space-y-1 opacity-30"
            style={{ color: '#555555' }}
          >
            <p>WASD — Mover &nbsp;&nbsp;|&nbsp;&nbsp; Ratón — Mirar &nbsp;&nbsp;|&nbsp;&nbsp; Click — Capturar ratón</p>
            <p>SPACE — Ecolocación (ruidoso) &nbsp;&nbsp;|&nbsp;&nbsp; E — Golpe suave</p>
            <p>SHIFT — Modo sigilo &nbsp;&nbsp;|&nbsp;&nbsp; ESC — Pausa</p>
          </div>

          {/* Audio warning */}
          <div
            className="mt-6 font-mono text-[10px] text-center opacity-25"
            style={{ color: '#0097a7' }}
          >
            🎧 Se recomienda usar auriculares para la experiencia completa
          </div>
        </div>
      )}
    </div>
  );
}
