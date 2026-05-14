'use client';

import dynamic from 'next/dynamic';

const EchoGame = dynamic(() => import('@/components/EchoGame'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[100dvh] bg-black flex flex-col items-center justify-center">
      <h1 className="text-3xl sm:text-5xl font-mono font-bold tracking-[0.2em] sm:tracking-[0.3em]" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.5)' }}>
        ECHOES
      </h1>
      <h2 className="text-lg sm:text-2xl font-mono tracking-[0.15em] sm:tracking-[0.2em] mt-1 sm:mt-2" style={{ color: '#0097a7' }}>
        OF THE STATIC
      </h2>
      <div className="mt-3 font-mono text-xs opacity-30" style={{ color: '#0097a7' }}>
        Cargando...
      </div>
    </div>
  ),
});

export default function Home() {
  return <EchoGame />;
}
