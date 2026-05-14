'use client';

import { useEffect, useRef, useCallback } from 'react';

// ============================================================
// Dynamic Wave Background with Particles
// Particles illuminate on click and briefly form monster silhouettes
// ============================================================

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  illuminated: number;
  color: string;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const clickPulsesRef = useRef<{ x: number; y: number; radius: number; maxRadius: number; alpha: number }[]>([]);
  const silhouetteTimerRef = useRef(0);
  const silhouetteActiveRef = useRef(false);
  const silhouetteAlphaRef = useRef(0);

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const count = Math.min(200, Math.floor((width * height) / 5000));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        baseAlpha: Math.random() * 0.15 + 0.05,
        alpha: Math.random() * 0.15 + 0.05,
        illuminated: 0,
        color: Math.random() > 0.7 ? '#00e5ff' : '#004d40',
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const handleClick = (e: MouseEvent) => {
      clickPulsesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        maxRadius: 300,
        alpha: 1,
      });

      // Chance to trigger monster silhouette
      if (Math.random() < 0.3) {
        silhouetteActiveRef.current = true;
        silhouetteAlphaRef.current = 1;
        silhouetteTimerRef.current = performance.now();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    canvas.addEventListener('click', handleClick);
    window.addEventListener('mousemove', handleMouseMove);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const now = performance.now();
      const particles = particlesRef.current;

      // Update and draw click pulses
      const activePulses = clickPulsesRef.current.filter(p => p.alpha > 0.01);
      for (const pulse of activePulses) {
        pulse.radius += 4;
        pulse.alpha *= 0.97;

        ctx.strokeStyle = `rgba(0,229,255,${pulse.alpha * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      clickPulsesRef.current = activePulses;

      // Update and draw particles
      for (const p of particles) {
        // Movement
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        // Mouse proximity illumination
        const mouseDist = Math.sqrt((p.x - mouseRef.current.x) ** 2 + (p.y - mouseRef.current.y) ** 2);
        const mouseIllum = mouseDist < 150 ? (1 - mouseDist / 150) * 0.4 : 0;

        // Click pulse illumination
        let pulseIllum = 0;
        for (const pulse of activePulses) {
          const dist = Math.sqrt((p.x - pulse.x) ** 2 + (p.y - pulse.y) ** 2);
          if (Math.abs(dist - pulse.radius) < 40) {
            pulseIllum = Math.max(pulseIllum, pulse.alpha * 0.8);
          }
        }

        // Smooth illumination
        const targetIllum = Math.max(mouseIllum, pulseIllum);
        p.illuminated += (targetIllum - p.illuminated) * 0.1;

        p.alpha = p.baseAlpha + p.illuminated;

        // Draw particle
        ctx.fillStyle = p.illuminated > 0.1
          ? `rgba(0,229,255,${Math.min(1, p.alpha)})`
          : `rgba(0,77,64,${Math.min(1, p.alpha)})`;

        if (p.illuminated > 0.2) {
          ctx.shadowColor = 'rgba(0,229,255,0.3)';
          ctx.shadowBlur = 4;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + p.illuminated * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw monster silhouette (brief flash)
      if (silhouetteActiveRef.current) {
        const elapsed = now - silhouetteTimerRef.current;
        if (elapsed < 800) {
          silhouetteAlphaRef.current = Math.max(0, 1 - elapsed / 800);
          const alpha = silhouetteAlphaRef.current * 0.15;

          ctx.save();
          ctx.fillStyle = `rgba(255,23,68,${alpha})`;
          ctx.shadowColor = `rgba(255,23,68,${alpha * 0.5})`;
          ctx.shadowBlur = 20;

          // Draw a scary humanoid silhouette
          const sx = w * 0.7 + Math.sin(elapsed * 0.01) * 10;
          const sy = h * 0.3;

          // Head
          ctx.beginPath();
          ctx.ellipse(sx, sy - 80, 20, 24, 0, 0, Math.PI * 2);
          ctx.fill();

          // Body
          ctx.beginPath();
          ctx.moveTo(sx - 25, sy - 55);
          ctx.lineTo(sx + 25, sy - 55);
          ctx.lineTo(sx + 18, sy + 40);
          ctx.lineTo(sx - 18, sy + 40);
          ctx.closePath();
          ctx.fill();

          // Arms (reaching out)
          ctx.lineWidth = 6;
          ctx.strokeStyle = `rgba(255,23,68,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(sx - 25, sy - 40);
          ctx.lineTo(sx - 55, sy - 20 + Math.sin(elapsed * 0.02) * 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx + 25, sy - 40);
          ctx.lineTo(sx + 55, sy - 20 + Math.sin(elapsed * 0.02 + 1) * 5);
          ctx.stroke();

          // Eyes (glowing)
          ctx.fillStyle = `rgba(255,0,0,${alpha * 3})`;
          ctx.shadowColor = `rgba(255,0,0,${alpha * 2})`;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(sx - 7, sy - 84, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx + 7, sy - 84, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else {
          silhouetteActiveRef.current = false;
        }
      }

      // Subtle ambient wave lines
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(0,229,255,0.02)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x += 5) {
          const y = h * 0.5 + Math.sin(x * 0.005 + now * 0.0005 + i * 2) * 50 + i * 80;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', handleClick);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
