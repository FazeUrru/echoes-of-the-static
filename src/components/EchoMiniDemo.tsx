'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ============================================================
// Playable Echolocation Mini-Demo (30 seconds)
// A lightweight canvas demo showing the echolocation mechanic
// ============================================================

interface DemoWall {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DemoEntity {
  x: number;
  y: number;
  angle: number;
  speed: number;
  visible: boolean;
  visibleUntil: number;
}

interface DemoPulse {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  startTime: number;
  duration: number;
}

export default function EchoMiniDemo({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [started, setStarted] = useState(false);
  const startTimeRef = useRef(0);
  const wallsRef = useRef<DemoWall[]>([]);
  const entityRef = useRef<DemoEntity>({ x: 200, y: 150, angle: 0, speed: 0.5, visible: false, visibleUntil: 0 });
  const pulsesRef = useRef<DemoPulse[]>([]);
  const illuminatedRef = useRef<Map<string, number>>(new Map());
  const playerRef = useRef({ x: 400, y: 300 });
  const logoRef = useRef({ x: 350, y: 200 });
  const [logoFound, setLogoFound] = useState(false);
  const logoFoundRef = useRef(false);
  const setLogoFoundSync = (v: boolean) => { setLogoFound(v); logoFoundRef.current = v; };

  const generateWalls = useCallback(() => {
    const walls: DemoWall[] = [];
    // Border walls
    walls.push({ x: 0, y: 0, w: 800, h: 10 });
    walls.push({ x: 0, y: 590, w: 800, h: 10 });
    walls.push({ x: 0, y: 0, w: 10, h: 600 });
    walls.push({ x: 790, y: 0, w: 10, h: 600 });
    // Interior walls - maze-like
    walls.push({ x: 150, y: 50, w: 10, h: 200 });
    walls.push({ x: 150, y: 300, w: 10, h: 150 });
    walls.push({ x: 300, y: 100, w: 200, h: 10 });
    walls.push({ x: 300, y: 100, w: 10, h: 150 });
    walls.push({ x: 450, y: 250, w: 10, h: 200 });
    walls.push({ x: 550, y: 50, w: 10, h: 180 });
    walls.push({ x: 550, y: 300, w: 200, h: 10 });
    walls.push({ x: 200, y: 450, w: 250, h: 10 });
    walls.push({ x: 100, y: 500, w: 10, h: 90 });
    walls.push({ x: 600, y: 400, w: 10, h: 150 });
    walls.push({ x: 650, y: 500, w: 140, h: 10 });
    return walls;
  }, []);

  useEffect(() => {
    wallsRef.current = generateWalls();
    entityRef.current = {
      x: 600 + Math.random() * 100,
      y: 400 + Math.random() * 100,
      angle: Math.random() * Math.PI * 2,
      speed: 0.8,
      visible: false,
      visibleUntil: 0,
    };
    playerRef.current = { x: 100, y: 100 };
    logoRef.current = {
      x: 620 + Math.random() * 100,
      y: 420 + Math.random() * 100,
    };
    logoFoundRef.current = false;
  }, [generateWalls]);

  const emitPulse = useCallback((x: number, y: number) => {
    pulsesRef.current.push({
      x, y,
      radius: 0,
      maxRadius: 250,
      startTime: performance.now(),
      duration: 1500,
    });
  }, []);

  useEffect(() => {
    if (!started) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = 30 - elapsed;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      emitPulse(x, y);
    };

    canvas.addEventListener('click', handleClick);

    const render = (time: number) => {
      const dt = 1 / 60;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 800, 600);

      // Update pulses
      const now = performance.now();
      const activePulses: DemoPulse[] = [];
      for (const pulse of pulsesRef.current) {
        const elapsed = now - pulse.startTime;
        const progress = elapsed / pulse.duration;
        if (progress >= 1) continue;
        pulse.radius = pulse.maxRadius * progress;
        activePulses.push(pulse);

        // Illuminate walls near this pulse
        for (const wall of wallsRef.current) {
          const cx = wall.x + wall.w / 2;
          const cy = wall.y + wall.h / 2;
          const dist = Math.sqrt((cx - pulse.x) ** 2 + (cy - pulse.y) ** 2);
          if (Math.abs(dist - pulse.radius) < 30) {
            const intensity = 1 - progress;
            illuminatedRef.current.set(`${wall.x},${wall.y}`, intensity);
          }
        }

        // Check if entity is near pulse wave
        const entity = entityRef.current;
        const entityDist = Math.sqrt((entity.x - pulse.x) ** 2 + (entity.y - pulse.y) ** 2);
        if (Math.abs(entityDist - pulse.radius) < 25) {
          entity.visible = true;
          entity.visibleUntil = now + 1500;
        }

        // Check if logo is near pulse wave
        const logo = logoRef.current;
        if (!logoFoundRef.current) {
          const logoDist = Math.sqrt((logo.x - pulse.x) ** 2 + (logo.y - pulse.y) ** 2);
          if (Math.abs(logoDist - pulse.radius) < 20) {
            setLogoFoundSync(true);
          }
        }
      }
      pulsesRef.current = activePulses;

      // Draw illuminated walls
      for (const [key, intensity] of illuminatedRef.current) {
        const [wx, wy] = key.split(',').map(Number);
        const wall = wallsRef.current.find(w => w.x === wx && w.y === wy);
        if (!wall) continue;
        const fade = Math.max(0, intensity - dt * 0.3);
        if (fade <= 0) {
          illuminatedRef.current.delete(key);
          continue;
        }
        illuminatedRef.current.set(key, fade);

        ctx.strokeStyle = `rgba(0,229,255,${fade})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = `rgba(0,229,255,${fade * 0.5})`;
        ctx.shadowBlur = 10;
        ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
        ctx.shadowBlur = 0;
      }

      // Draw pulse rings
      for (const pulse of pulsesRef.current) {
        const elapsed = now - pulse.startTime;
        const progress = elapsed / pulse.duration;
        const alpha = (1 - progress) * 0.6;
        ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw entity (if visible)
      const entity = entityRef.current;
      // Update entity position
      entity.angle += (Math.random() - 0.5) * 0.1;
      entity.x += Math.cos(entity.angle) * entity.speed;
      entity.y += Math.sin(entity.angle) * entity.speed;
      entity.x = Math.max(20, Math.min(780, entity.x));
      entity.y = Math.max(20, Math.min(580, entity.y));

      if (entity.visible && now < entity.visibleUntil) {
        const fade = Math.min(1, (entity.visibleUntil - now) / 1500);
        ctx.fillStyle = `rgba(255,23,68,${fade})`;
        ctx.shadowColor = `rgba(255,23,68,${fade * 0.5})`;
        ctx.shadowBlur = 15;
        // Draw a scary silhouette
        ctx.beginPath();
        // Body
        ctx.ellipse(entity.x, entity.y, 12, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(entity.x, entity.y - 24, 8, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = `rgba(255,0,0,${fade})`;
        ctx.beginPath();
        ctx.arc(entity.x - 3, entity.y - 26, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(entity.x + 3, entity.y - 26, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        entity.visible = false;
      }

      // Draw logo (if found)
      const logo = logoRef.current;
      if (logoFoundRef.current) {
        ctx.save();
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = 'rgba(0,229,255,0.5)';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        ctx.fillText('ECHOES', logo.x, logo.y);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#0097a7';
        ctx.fillText('OF THE STATIC', logo.x, logo.y + 16);
        ctx.restore();
      }

      // Instructions overlay
      ctx.fillStyle = 'rgba(0,229,255,0.5)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Haz clic para emitir un pulso de ecolocalización', 400, 570);

      // Player dot
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(playerRef.current.x, playerRef.current.y, 4, 0, Math.PI * 2);
      ctx.fill();

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      clearInterval(timer);
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('click', handleClick);
    };
  }, [started, emitPulse]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-40">
      {!started ? (
        <div className="text-center p-6">
          <h3 className="font-mono text-xl mb-4" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.5)' }}>
            PROBAR ECOLOCALIZACIÓN
          </h3>
          <p className="font-mono text-sm mb-2" style={{ color: 'rgba(0,229,255,0.6)' }}>
            Estás en la oscuridad. Haz clic para emitir pulsos de sonido.
          </p>
          <p className="font-mono text-sm mb-4" style={{ color: 'rgba(255,23,68,0.6)' }}>
            Descubre qué se esconde en las sombras... antes de que te encuentren.
          </p>
          <p className="font-mono text-xs mb-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Duración: 30 segundos | Encuentra el logo oculto
          </p>
          <button
            onClick={() => setStarted(true)}
            className="px-8 py-3 font-mono text-sm tracking-widest border transition-all hover:scale-105 active:scale-95"
            style={{
              color: '#00e5ff',
              borderColor: 'rgba(0,229,255,0.4)',
              backgroundColor: 'rgba(0,229,255,0.05)',
              textShadow: '0 0 10px rgba(0,229,255,0.3)',
            }}
          >
            COMENZAR DEMO
          </button>
          <br />
          <button
            onClick={onClose}
            className="mt-3 px-6 py-2 font-mono text-xs border"
            style={{ color: '#555', borderColor: '#333' }}
          >
            VOLVER
          </button>
        </div>
      ) : (
        <div className="relative w-full h-full flex flex-col items-center">
          {/* Timer */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 font-mono text-sm tracking-widest"
            style={{ color: timeLeft <= 10 ? '#ff1744' : '#00e5ff', textShadow: `0 0 10px ${timeLeft <= 10 ? 'rgba(255,23,68,0.5)' : 'rgba(0,229,255,0.5)'}` }}>
            ⏱ {timeLeft}s
          </div>
          {/* Logo found indicator */}
          {logoFound && (
            <div className="absolute top-4 right-4 z-10 font-mono text-xs"
              style={{ color: '#76ff03', textShadow: '0 0 10px rgba(118,255,3,0.5)' }}>
              ✦ LOGO ENCONTRADO
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full max-w-4xl"
            style={{ aspectRatio: '4/3', background: '#000', cursor: 'crosshair' }}
          />
          {timeLeft <= 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
              <h3 className="font-mono text-2xl mb-4" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.5)' }}>
                {logoFound ? '¡ENCONTRASTE EL LOGO!' : 'TIEMPO AGOTADO'}
              </h3>
              <p className="font-mono text-sm mb-6" style={{ color: 'rgba(0,229,255,0.5)' }}>
                {logoFound
                  ? 'Tu ecolocalización es excelente. ¿Listo para el juego completo?'
                  : 'La oscuridad ganó esta vez. Pero puedes intentarlo de nuevo...'}
              </p>
              <div className="flex gap-3">
                <button onClick={onClose}
                  className="px-6 py-3 font-mono text-sm border"
                  style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.05)' }}>
                  JUGAR COMPLETO
                </button>
                <button onClick={() => {
                  setTimeLeft(30);
                  pulsesRef.current = [];
                  illuminatedRef.current.clear();
                  setLogoFoundSync(false);
                  setStarted(false);
                }}
                  className="px-6 py-3 font-mono text-sm border"
                  style={{ color: '#76ff03', borderColor: 'rgba(118,255,3,0.4)', background: 'rgba(118,255,3,0.05)' }}>
                  REINTENTAR
                </button>
              </div>
            </div>
          )}
          <button onClick={onClose}
            className="absolute top-4 left-4 z-10 font-mono text-xs px-3 py-1 border"
            style={{ color: '#666', borderColor: '#333' }}>
            ✕ CERRAR
          </button>
        </div>
      )}
    </div>
  );
}
