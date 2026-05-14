'use client';

import dynamic from 'next/dynamic';

const EchoGame = dynamic(() => import('@/components/EchoGame'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center">
      <h1 className="text-5xl font-mono font-bold tracking-[0.3em]" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.5)' }}>
        ECHOES
      </h1>
      <h2 className="text-2xl font-mono tracking-[0.2em] mt-2" style={{ color: '#0097a7' }}>
        OF THE STATIC
      </h2>
      <div className="mt-4 font-mono text-xs opacity-30" style={{ color: '#0097a7' }}>
        Cargando...
      </div>
    </div>
  ),
});

export default function Home() {
  return <EchoGame />;
}
