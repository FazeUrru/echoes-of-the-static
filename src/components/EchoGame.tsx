'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { EchoGameEngine } from '@/game/engine';
import { GameState, Difficulty, DIFFICULTY_CONFIGS, CHAPTERS, ProfileSettings, AdvancedSettings, DEFAULT_PROFILE, DEFAULT_ADVANCED, ControlBinding, DEFAULT_CONTROLS, SPEEDRUN_CHALLENGES } from '@/game/types';

// ============================================================
// Main Game Component
// ============================================================
export default function EchoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EchoGameEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [unlockedChapters, setUnlockedChapters] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'advanced' | 'controls'>('profile');
  const [profile, setProfile] = useState<ProfileSettings>({ ...DEFAULT_PROFILE });
  const [advanced, setAdvanced] = useState<AdvancedSettings>({ ...DEFAULT_ADVANCED });
  const [controls, setControls] = useState<ControlBinding[]>([...DEFAULT_CONTROLS]);
  const [remappingAction, setRemappingAction] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);

  const handleStart = useCallback(async (chapterId: number, diff: Difficulty) => {
    const eng = engineRef.current;
    if (!eng) return;
    await eng.startGame(chapterId, diff);
    setGameState('chapterIntro');
    // After 3 seconds, transition to playing
    setTimeout(() => {
      if (eng.state === 'chapterIntro') {
        eng.state = 'playing';
        setGameState('playing');
      }
    }, 3000);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const eng = new EchoGameEngine();
    eng.init(canvas);
    eng.onStateChange = (state: GameState) => {
      setGameState(state);
      if (state === 'won') {
        const nextChapter = Math.min(eng.currentChapter + 1, 6);
        setUnlockedChapters(prev => Math.max(prev, nextChapter));
      }
    };
    engineRef.current = eng;
    eng.startLoop();

    const handleResize = () => {
      const r = container.getBoundingClientRect();
      eng.resize(r.width, r.height);
    };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); eng.destroy(); };
  }, []);

  // Sync settings to engine
  useEffect(() => {
    const eng = engineRef.current;
    if (eng) {
      eng.profile = profile;
      eng.advanced = advanced;
      eng.controls = controls;
    }
  }, [profile, advanced, controls]);

  const handleRemapKey = useCallback((action: string, key: string) => {
    setControls(prev => prev.map(c => c.action === action ? { ...c, key } : c));
    setRemappingAction(null);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-black overflow-hidden select-none" style={{ cursor: gameState === 'playing' ? 'crosshair' : 'default' }}
      onClick={() => { if (gameState === 'playing' && canvasRef.current) canvasRef.current.requestPointerLock(); }}>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* ===== MENU ===== */}
      {gameState === 'menu' && !isStarted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,229,255,0.06) 2px,rgba(0,229,255,0.06) 4px)' }} />

          <div className="text-center mb-8 animate-text-flicker">
            <h1 className="text-5xl md:text-7xl font-mono font-bold tracking-[0.3em] mb-2" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.5),0 0 40px rgba(0,229,255,0.3)' }}>ECHOES</h1>
            <h2 className="text-2xl md:text-4xl font-mono tracking-[0.2em] mb-2" style={{ color: '#0097a7' }}>OF THE STATIC</h2>
            <div className="text-sm font-mono opacity-40" style={{ color: '#004d40' }}>v2.5 — Ecos de la Estática</div>
          </div>

          <div className="max-w-md text-center mb-8 px-6 font-mono text-sm space-y-2">
            <p style={{ color: 'rgba(0,229,255,0.4)' }}>Estás ciego. Solo puedes ver a través del sonido.</p>
            <p style={{ color: 'rgba(255,23,68,0.5)' }} className="text-base">Pero ellas también te escuchan.</p>
          </div>

          <div className="flex flex-col gap-3 mb-8">
            <NeonButton onClick={() => { setIsStarted(true); setGameState('difficulty'); }}>NUEVA PARTIDA</NeonButton>
            <NeonButton onClick={() => setShowSettings(true)} dim>AJUSTES</NeonButton>
          </div>

          <div className="font-mono text-[10px] text-center opacity-25 space-y-1" style={{ color: '#555' }}>
            <p>WASD: Mover | Ratón: Mirar | SHIFT: Sigilo | SPACE: Eco | F: Linterna</p>
            <p>E: Interactuar | 1-4: Inventario | Q: Usar | G: Soltar | ESC: Pausa</p>
          </div>
          <div className="mt-4 font-mono text-[10px] opacity-20" style={{ color: '#0097a7' }}>🎧 Auriculares recomendados</div>
          <div className="mt-2 font-mono text-[9px] opacity-15" style={{ color: '#ffd700' }}>🏆 Complétalo rápido para desbloquear personajes exclusivos</div>
        </div>
      )}

      {/* ===== DIFFICULTY SELECT ===== */}
      {gameState === 'difficulty' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 px-4">
          <h2 className="text-2xl font-mono mb-8 tracking-widest" style={{ color: '#00e5ff' }}>DIFICULTAD</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 max-w-4xl w-full mb-8">
            {(Object.entries(DIFFICULTY_CONFIGS) as [Difficulty, typeof DIFFICULTY_CONFIGS.medium][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setDifficulty(key)}
                className="p-4 border font-mono text-left transition-all hover:scale-105"
                style={{
                  borderColor: difficulty === key ? '#00e5ff' : 'rgba(0,229,255,0.15)',
                  backgroundColor: difficulty === key ? 'rgba(0,229,255,0.08)' : 'rgba(0,0,0,0.5)',
                  color: difficulty === key ? '#00e5ff' : '#666',
                }}>
                <div className="text-sm font-bold mb-1">{cfg.label}</div>
                <div className="text-[10px] opacity-60">{cfg.description}</div>
                <div className="text-[9px] mt-2 opacity-40">
                  {cfg.entityCount} enemigos | Inventario: {cfg.inventorySize}
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <NeonButton onClick={() => setGameState('chapterSelect')}>SELECCIONAR CAPÍTULO</NeonButton>
            <NeonButton onClick={() => { setGameState('menu'); setIsStarted(false); }} dim>VOLVER</NeonButton>
          </div>
        </div>
      )}

      {/* ===== CHAPTER SELECT ===== */}
      {gameState === 'chapterSelect' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 px-4 overflow-y-auto">
          <h2 className="text-2xl font-mono mb-2 tracking-widest" style={{ color: '#00e5ff' }}>CAPÍTULOS</h2>
          <p className="font-mono text-[10px] mb-6 opacity-30" style={{ color: '#ffd700' }}>🏆 Complétalos en tiempo récord para ganar puntos y personajes exclusivos</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl w-full mb-6">
            {CHAPTERS.map(ch => {
              const unlocked = ch.id <= unlockedChapters;
              const challenge = SPEEDRUN_CHALLENGES.find(sc => sc.chapterId === ch.id);
              return (
                <button key={ch.id} onClick={() => unlocked && setSelectedChapter(ch.id)} disabled={!unlocked}
                  className="p-4 border font-mono text-left transition-all"
                  style={{
                    borderColor: selectedChapter === ch.id ? '#00e5ff' : unlocked ? 'rgba(0,229,255,0.15)' : 'rgba(50,50,50,0.3)',
                    backgroundColor: selectedChapter === ch.id ? 'rgba(0,229,255,0.08)' : 'rgba(0,0,0,0.5)',
                    color: selectedChapter === ch.id ? '#00e5ff' : unlocked ? '#888' : '#333',
                    opacity: unlocked ? 1 : 0.4,
                  }}>
                  <div className="text-xs opacity-50 mb-1">{ch.subtitle}</div>
                  <div className="text-sm font-bold mb-1">{unlocked ? ch.name : '???'}</div>
                  <div className="text-[10px] opacity-50">{unlocked ? ch.description : 'Completa el capítulo anterior'}</div>
                  {unlocked && <div className="text-[9px] mt-1 opacity-30">{ch.enemies.map(e => e.count).reduce((a,b) => a+b, 0)} entidades</div>}
                  {/* Speedrun challenge targets */}
                  {unlocked && challenge && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(255,215,0,0.1)' }}>
                      <div className="text-[8px] opacity-40 mb-1" style={{ color: '#ffd700' }}>RETO DE VELOCIDAD</div>
                      {challenge.rewards.map(r => {
                        const targetMins = Math.floor(r.timeLimitSeconds / 60);
                        const targetSecs = r.timeLimitSeconds % 60;
                        const targetStr = `${targetMins}:${targetSecs.toString().padStart(2, '0')}`;
                        const tierIcon = r.tier === 'gold' ? '🥇' : r.tier === 'silver' ? '🥈' : '🥉';
                        return (
                          <div key={r.tier} className="text-[8px] opacity-35 flex items-center gap-1">
                            <span>{tierIcon}</span>
                            <span>&lt;{targetStr}</span>
                            <span style={{ color: r.tier === 'gold' ? '#ffd700' : r.tier === 'silver' ? '#c0c0c0' : '#cd7f32' }}>
                              +{r.points}pts
                            </span>
                            <span className="opacity-60">{r.characterIcon}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex gap-3">
            <NeonButton onClick={() => handleStart(selectedChapter, difficulty)}>JUGAR</NeonButton>
            <NeonButton onClick={() => setGameState('difficulty')} dim>VOLVER</NeonButton>
          </div>
        </div>
      )}

      {/* ===== CHAPTER INTRO ===== */}
      {gameState === 'chapterIntro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 px-8 animate-fade-in">
          <div className="text-sm font-mono mb-2 tracking-widest" style={{ color: '#0097a7' }}>{CHAPTERS[selectedChapter - 1]?.subtitle}</div>
          <h2 className="text-3xl md:text-5xl font-mono font-bold mb-6" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.4)' }}>{CHAPTERS[selectedChapter - 1]?.name}</h2>
          <p className="font-mono text-sm max-w-lg text-center leading-relaxed" style={{ color: 'rgba(0,229,255,0.5)' }}>{CHAPTERS[selectedChapter - 1]?.introText}</p>
          {/* Show speedrun targets during intro */}
          {(() => {
            const challenge = SPEEDRUN_CHALLENGES.find(sc => sc.chapterId === selectedChapter);
            if (!challenge) return null;
            return (
              <div className="mt-6 text-center">
                <div className="font-mono text-[10px] mb-2" style={{ color: 'rgba(255,215,0,0.4)' }}>⏱ RETOS DE VELOCIDAD</div>
                <div className="flex gap-4 justify-center">
                  {challenge.rewards.map(r => {
                    const targetMins = Math.floor(r.timeLimitSeconds / 60);
                    const targetSecs = r.timeLimitSeconds % 60;
                    const targetStr = `${targetMins}:${targetSecs.toString().padStart(2, '0')}`;
                    const tierIcon = r.tier === 'gold' ? '🥇' : r.tier === 'silver' ? '🥈' : '🥉';
                    const tierColor = r.tier === 'gold' ? '#ffd700' : r.tier === 'silver' ? '#c0c0c0' : '#cd7f32';
                    return (
                      <div key={r.tier} className="text-center">
                        <div className="font-mono text-xs" style={{ color: tierColor }}>{tierIcon} &lt;{targetStr}</div>
                        <div className="font-mono text-[9px] opacity-40">{r.characterIcon} {r.characterName}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <div className="mt-8 font-mono text-xs opacity-30 animate-pulse">Pulsa ESPACIO para comenzar</div>
        </div>
      )}

      {/* ===== PAUSED ===== */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <h2 className="text-3xl font-mono mb-8 tracking-widest" style={{ color: '#00e5ff' }}>PAUSADO</h2>
          <div className="flex flex-col gap-3">
            <NeonButton onClick={() => { const eng = engineRef.current; if (eng) eng.state = 'playing'; setGameState('playing'); }}>CONTINUAR</NeonButton>
            <NeonButton onClick={() => setShowSettings(true)} dim>AJUSTES</NeonButton>
            <NeonButton onClick={() => { setGameState('menu'); setIsStarted(false); }} dim>SALIR AL MENÚ</NeonButton>
          </div>
        </div>
      )}

      {/* ===== SETTINGS ===== */}
      {showSettings && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20 p-4">
          <div className="bg-black border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ borderColor: 'rgba(0,229,255,0.2)' }}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-mono" style={{ color: '#00e5ff' }}>AJUSTES</h3>
                <button onClick={() => setShowSettings(false)} className="font-mono text-sm px-3 py-1 border" style={{ color: '#888', borderColor: '#333' }}>CERRAR</button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-4 border-b" style={{ borderColor: 'rgba(0,229,255,0.1)' }}>
                {(['profile', 'advanced', 'controls'] as const).map(tab => (
                  <button key={tab} onClick={() => setSettingsTab(tab)}
                    className="px-4 py-2 font-mono text-xs border-b-2 transition-colors"
                    style={{ color: settingsTab === tab ? '#00e5ff' : '#555', borderColor: settingsTab === tab ? '#00e5ff' : 'transparent' }}>
                    {tab === 'profile' ? 'PERFIL' : tab === 'advanced' ? 'AVANZADO' : 'CONTROLES'}
                  </button>
                ))}
              </div>

              {/* Profile Settings */}
              {settingsTab === 'profile' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SettingSlider label="Volumen General" value={profile.volumeMaster} min={0} max={1} step={0.05} onChange={v => setProfile(p => ({ ...p, volumeMaster: v }))} />
                  <SettingSlider label="Volumen Música" value={profile.volumeMusic} min={0} max={1} step={0.05} onChange={v => setProfile(p => ({ ...p, volumeMusic: v }))} />
                  <SettingSlider label="Volumen Efectos" value={profile.volumeSFX} min={0} max={1} step={0.05} onChange={v => setProfile(p => ({ ...p, volumeSFX: v }))} />
                  <SettingSlider label="Volumen Ambiente" value={profile.volumeAmbient} min={0} max={1} step={0.05} onChange={v => setProfile(p => ({ ...p, volumeAmbient: v }))} />
                  <SettingSlider label="Volumen Voz" value={profile.volumeVoice} min={0} max={1} step={0.05} onChange={v => setProfile(p => ({ ...p, volumeVoice: v }))} />
                  <SettingSlider label="Brillo" value={profile.brightness} min={0.3} max={2} step={0.1} onChange={v => setProfile(p => ({ ...p, brightness: v }))} />
                  <SettingToggle label="Sacudida de Pantalla" value={profile.screenShake} onChange={v => setProfile(p => ({ ...p, screenShake: v }))} />
                  <SettingToggle label="Balanceo de Cabeza" value={profile.headBob} onChange={v => setProfile(p => ({ ...p, headBob: v }))} />
                  <SettingToggle label="Subtítulos" value={profile.subtitles} onChange={v => setProfile(p => ({ ...p, subtitles: v }))} />
                  <SettingSelect label="Daltonismo" value={profile.colorblindMode} options={['none', 'protanopia', 'deuteranopia', 'tritanopia']} labels={['Ninguno', 'Protanopía', 'Deuteranopía', 'Tritanopía']} onChange={v => setProfile(p => ({ ...p, colorblindMode: v as ProfileSettings['colorblindMode'] }))} />
                  <SettingSelect label="Mira" value={profile.crosshairStyle} options={['dot', 'cross', 'none']} labels={['Punto', 'Cruz', 'Ninguna']} onChange={v => setProfile(p => ({ ...p, crosshairStyle: v as ProfileSettings['crosshairStyle'] }))} />
                  <SettingSlider label="Tamaño de Mira" value={profile.crosshairSize} min={1} max={10} step={1} onChange={v => setProfile(p => ({ ...p, crosshairSize: v }))} />
                  <SettingSlider label="Color de Mira (R)" value={parseInt(profile.crosshairColor.slice(1, 3), 16)} min={0} max={255} step={1} onChange={v => { const hex = v.toString(16).padStart(2, '0'); setProfile(p => ({ ...p, crosshairColor: `#${hex}${p.crosshairColor.slice(3)}` })); }} />
                  <SettingSelect label="Idioma" value={profile.language} options={['es', 'en']} labels={['Español', 'English']} onChange={v => setProfile(p => ({ ...p, language: v as ProfileSettings['language'] }))} />
                  <SettingInput label="Nombre" value={profile.playerName} onChange={v => setProfile(p => ({ ...p, playerName: v }))} />
                </div>
              )}

              {/* Advanced Settings */}
              {settingsTab === 'advanced' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SettingSlider label="FOV" value={advanced.fov} min={40} max={120} step={5} onChange={v => setAdvanced(a => ({ ...a, fov: v }))} />
                  <SettingSlider label="Sensibilidad Ratón" value={advanced.mouseSensitivity} min={0.5} max={5} step={0.25} onChange={v => setAdvanced(a => ({ ...a, mouseSensitivity: v }))} />
                  <SettingToggle label="Invertir Eje Y" value={advanced.mouseInvertY} onChange={v => setAdvanced(a => ({ ...a, mouseInvertY: v }))} />
                  <SettingToggle label="Suavizado Ratón" value={advanced.mouseSmoothing} onChange={v => setAdvanced(a => ({ ...a, mouseSmoothing: v }))} />
                  <SettingSlider label="Distancia Render" value={advanced.renderDistance} min={10} max={40} step={5} onChange={v => setAdvanced(a => ({ ...a, renderDistance: v }))} />
                  <SettingSlider label="Intensidad Neón" value={advanced.neonGlowIntensity} min={0.2} max={2} step={0.1} onChange={v => setAdvanced(a => ({ ...a, neonGlowIntensity: v }))} />
                  <SettingSlider label="Duración Eco (ms)" value={advanced.pulseFadeDuration} min={500} max={5000} step={250} onChange={v => setAdvanced(a => ({ ...a, pulseFadeDuration: v }))} />
                  <SettingSlider label="Rango Visual Pasos" value={advanced.footstepVisualRange} min={0.5} max={5} step={0.5} onChange={v => setAdvanced(a => ({ ...a, footstepVisualRange: v }))} />
                  <SettingSlider label="FOV Linterna" value={advanced.flashlightFov} min={15} max={90} step={5} onChange={v => setAdvanced(a => ({ ...a, flashlightFov: v }))} />
                  <SettingSlider label="Intensidad Linterna" value={advanced.flashlightIntensity} min={0.2} max={1.5} step={0.1} onChange={v => setAdvanced(a => ({ ...a, flashlightIntensity: v }))} />
                  <SettingToggle label="Mostrar FPS" value={advanced.showFPS} onChange={v => setAdvanced(a => ({ ...a, showFPS: v }))} />
                  <SettingToggle label="Mostrar Minimapa" value={advanced.showMinimap} onChange={v => setAdvanced(a => ({ ...a, showMinimap: v }))} />
                  <SettingToggle label="Mostrar Brújula" value={advanced.showCompass} onChange={v => setAdvanced(a => ({ ...a, showCompass: v }))} />
                  <SettingToggle label="Indicador de Peligro" value={advanced.showDangerIndicator} onChange={v => setAdvanced(a => ({ ...a, showDangerIndicator: v }))} />
                  <SettingToggle label="VSync" value={advanced.vsync} onChange={v => setAdvanced(a => ({ ...a, vsync: v }))} />
                </div>
              )}

              {/* Controls */}
              {settingsTab === 'controls' && (
                <div className="space-y-1">
                  {controls.map(ctrl => (
                    <div key={ctrl.action} className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5">
                      <span className="font-mono text-xs" style={{ color: '#aaa' }}>{ctrl.label}</span>
                      <button onClick={() => setRemappingAction(ctrl.action)}
                        className="font-mono text-xs px-3 py-1 border rounded transition-colors"
                        style={{ borderColor: remappingAction === ctrl.action ? '#00e5ff' : '#333', color: remappingAction === ctrl.action ? '#00e5ff' : '#888' }}>
                        {remappingAction === ctrl.action ? 'PULSA UNA TECLA...' : ctrl.key.replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'SHIFT').replace('Space', 'SPACE').replace('Escape', 'ESC')}
                      </button>
                    </div>
                  ))}
                  {remappingAction && <KeyCapture onKey={key => handleRemapKey(remappingAction, key)} />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function NeonButton({ children, onClick, dim = false }: { children: React.ReactNode; onClick: () => void; dim?: boolean }) {
  return (
    <button onClick={onClick}
      className="px-8 py-3 font-mono text-sm tracking-widest border transition-all duration-300 hover:scale-105 active:scale-95"
      style={{
        color: dim ? '#555' : '#00e5ff',
        borderColor: dim ? 'rgba(100,100,100,0.2)' : 'rgba(0,229,255,0.25)',
        backgroundColor: dim ? 'rgba(0,0,0,0.3)' : 'rgba(0,229,255,0.03)',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#00e5ff'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,229,255,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = dim ? 'rgba(100,100,100,0.2)' : 'rgba(0,229,255,0.25)'; e.currentTarget.style.boxShadow = 'none'; }}>
      {children}
    </button>
  );
}

function SettingSlider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="font-mono text-[10px]" style={{ color: '#888' }}>{label}</span>
        <span className="font-mono text-[10px]" style={{ color: '#00e5ff' }}>{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 appearance-none rounded cursor-pointer" style={{ background: '#222', accentColor: '#00e5ff' }} />
    </div>
  );
}

function SettingToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="font-mono text-[10px]" style={{ color: '#888' }}>{label}</span>
      <button onClick={() => onChange(!value)}
        className="w-8 h-4 rounded-full transition-colors relative"
        style={{ backgroundColor: value ? 'rgba(0,229,255,0.4)' : '#333' }}>
        <div className="w-3 h-3 rounded-full absolute top-0.5 transition-all" style={{ left: value ? '16px' : '2px', backgroundColor: value ? '#00e5ff' : '#666' }} />
      </button>
    </div>
  );
}

function SettingSelect({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px]" style={{ color: '#888' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-black border font-mono text-[10px] px-2 py-1 rounded" style={{ borderColor: '#333', color: '#aaa' }}>
        {options.map((opt, i) => <option key={opt} value={opt}>{labels[i]}</option>)}
      </select>
    </div>
  );
}

function SettingInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px]" style={{ color: '#888' }}>{label}</span>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} maxLength={16}
        className="bg-black border font-mono text-[10px] px-2 py-1 rounded w-24" style={{ borderColor: '#333', color: '#aaa' }} />
    </div>
  );
}

function KeyCapture({ onKey }: { onKey: (key: string) => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); onKey(e.code); };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onKey]);
  return null;
}
