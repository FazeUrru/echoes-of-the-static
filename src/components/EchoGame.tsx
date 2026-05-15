'use client';

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { EchoGameEngine } from '@/game/engine';
import { GameState, Difficulty, DIFFICULTY_CONFIGS, CHAPTERS, ProfileSettings, AdvancedSettings, DEFAULT_PROFILE, DEFAULT_ADVANCED, ControlBinding, DEFAULT_CONTROLS, SPEEDRUN_CHALLENGES, CoopRole, CustomLevel } from '@/game/types';
import { saveGame, loadGame, hasSave, buildSaveData, deleteSave, SaveData } from '@/game/saveSystem';
import { getBackupSlots, loadFromSlot, hasCrashRecovery, loadCrashRecovery, exportBackupAsFile, importBackupFromFile, clearCrashRecovery, FullBackupData } from '@/game/backupSystem';
import LevelEditor from './LevelEditor';
import ParticleBackground from './ParticleBackground';
import EchoMiniDemo from './EchoMiniDemo';
import AudioDiary from './AudioDiary';

// ============================================================
// Hydration-safe hooks
// ============================================================
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const check = () => {
      setIsTouch(
        'ontouchstart' in window ||
        window.matchMedia('(pointer: coarse)').matches ||
        navigator.maxTouchPoints > 0
      );
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isTouch;
}

function useMounted() {
  // useSyncExternalStore is the React-recommended way to detect client-side rendering
  return useSyncExternalStore(
    () => () => {}, // subscribe (noop)
    () => true,     // getSnapshot (client)
    () => false     // getServerSnapshot (server)
  );
}

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
  const isMobile = useIsTouchDevice();
  const mounted = useMounted();

  // ---- Hardcore / Coop / Mic state ----
  const [hardcoreMode, setHardcoreMode] = useState(false);
  const [showCoopSetup, setShowCoopSetup] = useState(false);
  const [coopRole, setCoopRole] = useState<CoopRole>('none');
  const [showMicConfirm, setShowMicConfirm] = useState(false);

  // ---- Level Editor state ----
  const [showLevelEditor, setShowLevelEditor] = useState(false);

  // ---- Mini Demo state ----
  const [showMiniDemo, setShowMiniDemo] = useState(false);

  // ---- Landing page section state ----
  const [landingSection, setLandingSection] = useState<'hero' | 'demo' | 'diary' | 'trailer'>('hero');

  // ---- Save system state ----
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<number | null>(null);
  const [showAutoSaveNotice, setShowAutoSaveNotice] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showStatsOverlay, setShowStatsOverlay] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [autoSaveAgoStr, setAutoSaveAgoStr] = useState('');
  const playTimeRef = useRef(0);

  // ---- Backup system state ----
  const [crashRecoveryAvailable, setCrashRecoveryAvailable] = useState(false);
  const [showBackupManager, setShowBackupManager] = useState(false);

  // ---- Initialize save data (safe because ssr: false ensures client-only) ----
  const initialSave = (() => {
    try {
      if (!hasSave()) return { exists: false, data: null as SaveData | null, agoStr: '' };
      const saved = loadGame();
      if (!saved) return { exists: false, data: null as SaveData | null, agoStr: '' };
      const ago = Math.floor((Date.now() - saved.timestamp) / 60000);
      return { exists: true, data: saved, agoStr: ago < 1 ? 'Ahora' : ago < 60 ? `Hace ${ago}m` : `Hace ${Math.floor(ago / 60)}h` };
    } catch { return { exists: false, data: null as SaveData | null, agoStr: '' }; }
  })();
  const [saveExists, setSaveExists] = useState(initialSave.exists);
  const [cachedSave, setCachedSave] = useState<SaveData | null>(initialSave.data);
  const [saveAgoStr, setSaveAgoStr] = useState(initialSave.agoStr);

  // ---- Touch joystick state ----
  const joystickRef = useRef<{ active: boolean; touchId: number; cx: number; cy: number; dx: number; dy: number }>({
    active: false, touchId: -1, cx: 0, cy: 0, dx: 0, dy: 0,
  });

  // ---- Touch look state ----
  const lookTouchRef = useRef<{ active: boolean; touchId: number; lastX: number }>({
    active: false, touchId: -1, lastX: 0,
  });

  // ---- Sneak toggle state ----
  const [sneakActive, setSneakActive] = useState(false);

  // ---- Joystick visual position (state for render) ----
  const [joystickPos, setJoystickPos] = useState({ dx: 0, dy: 0, active: false });

  // ---- Engine live state (polling for zone warnings etc) ----
  const [engineLiveState, setEngineLiveState] = useState({ isInSilentZone: false, isInWhiteNoiseZone: false, micEnabled: false, hardcoreMode: false, sonarMode: 'active' as 'active' | 'passive', coopRole: 'none' as import('@/game/types').CoopRole, pingCount: 0, currentChapter: 1, totalPoints: 0, unlockedCharCount: 0, engineDifficulty: 'medium' as Difficulty, engineHardcore: false, playTimeSecs: 0, equippedWeapon: null as string | null, weaponAmmo: 0, playerHealth: 100, playerMaxHealth: 100, attackCooldown: 0, isWebbed: false, isParalyzed: false, killCount: 0, totalDamageDealt: 0, totalDamageTaken: 0, enemiesRemaining: 0, nearbyHazard: null as 'toxic' | 'electric' | 'collapsing' | null });

  useEffect(() => {
    const interval = setInterval(() => {
      const eng = engineRef.current;
      if (eng) {
        setEngineLiveState({
          isInSilentZone: eng.isInSilentZone,
          isInWhiteNoiseZone: eng.isInWhiteNoiseZone,
          micEnabled: eng.micEnabled,
          hardcoreMode: eng.hardcoreMode,
          sonarMode: eng.sonarMode,
          coopRole: eng.coopRole,
          pingCount: eng.pingMarkers.length,
          currentChapter: eng.currentChapter,
          totalPoints: eng.totalPoints || 0,
          unlockedCharCount: eng.unlockedCharacters?.length || 0,
          engineDifficulty: eng.difficulty,
          engineHardcore: eng.hardcoreMode,
          playTimeSecs: playTimeRef.current,
          equippedWeapon: eng.player.equippedWeapon,
          weaponAmmo: eng.player.inventory.find((s: any) => s.item.id === eng.player.equippedWeapon)?.uses || 0,
          playerHealth: eng.player.health,
          playerMaxHealth: eng.player.maxHealth,
          attackCooldown: eng.player.attackCooldown,
          isWebbed: eng.player.webbed,
          isParalyzed: eng.player.paralyzed,
          killCount: eng.killCount,
          totalDamageDealt: eng.totalDamageDealt,
          totalDamageTaken: eng.totalDamageTaken,
          enemiesRemaining: eng.entities.filter((e: any) => e.state !== 'dead').length,
          nearbyHazard: eng.hazards.some((h: any) => eng.dist(eng.player.pos, h.pos) < h.radius) ? eng.hazards.find((h: any) => eng.dist(eng.player.pos, h.pos) < h.radius)?.type : null,
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // ---- Check for crash recovery on mount ----
  useEffect(() => {
    setCrashRecoveryAvailable(hasCrashRecovery());
  }, []);

  // ---- Update autosave time display periodically ----
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastAutoSaveTime) {
        const ago = Math.floor((Date.now() - lastAutoSaveTime) / 60000);
        setAutoSaveAgoStr(ago < 1 ? 'ahora' : `${ago}m`);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [lastAutoSaveTime]);

  // ---- Autosave timer (every 60 seconds during gameplay) ----
  useEffect(() => {
    const interval = setInterval(() => {
      const eng = engineRef.current;
      if (eng && eng.state === 'playing') {
        playTimeRef.current += 60;
        const saveData = buildSaveData({
          playerName: profile.playerName,
          unlockedChapters,
          currentChapter: eng.currentChapter,
          difficulty: eng.difficulty,
          hardcoreMode: eng.hardcoreMode,
          coopRole: eng.coopRole,
          profile: profile as unknown as Record<string, unknown>,
          advanced: advanced as unknown as Record<string, unknown>,
          controls: controls.map(c => ({ action: c.action, label: c.label, key: c.key })),
          unlockedCharacters: Array.from(eng.unlockedCharacters || []),
          bestTimes: Array.from(eng.bestChapterTimes?.entries?.() || []).map(([k, v]) => ({ chapterId: k, timeSeconds: v, difficulty: eng.difficulty })),
          totalPoints: eng.totalPoints || 0,
          playTime: playTimeRef.current,
          customLevels: [],
          achievements: [],
        });
        saveGame(saveData);
        setLastAutoSaveTime(Date.now());
        setSaveExists(true);
        setShowAutoSaveNotice(true);
        setTimeout(() => setShowAutoSaveNotice(false), 3000);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [profile, advanced, controls, unlockedChapters]);

  // ---- Track play time ----
  useEffect(() => {
    const interval = setInterval(() => {
      const eng = engineRef.current;
      if (eng && eng.state === 'playing') {
        playTimeRef.current += 1;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = useCallback(async (chapterId: number, diff: Difficulty, hardcore: boolean = false, role: CoopRole = 'none') => {
    const eng = engineRef.current;
    if (!eng) return;
    await eng.startGame(chapterId, diff, hardcore, role);
    setGameState('chapterIntro');
    // After 3 seconds, transition to playing (unless on mobile where user taps)
    setTimeout(() => {
      if (eng.state === 'chapterIntro') {
        eng.startPlaying();
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
    eng.isMobile = isMobile;
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

  // Don't render interactive UI until client-side mounted (prevents hydration mismatch)
  if (!mounted) {
    return (
      <div className="relative w-full h-[100dvh] bg-black overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          <h1 className="text-3xl sm:text-5xl font-mono font-bold tracking-[0.2em] sm:tracking-[0.3em]" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.5)' }}>ECHOES</h1>
          <h2 className="text-lg sm:text-2xl font-mono tracking-[0.15em] sm:tracking-[0.2em] mt-1 sm:mt-2" style={{ color: '#0097a7' }}>OF THE STATIC</h2>
          <div className="mt-3 font-mono text-xs opacity-30" style={{ color: '#0097a7' }}>Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-[100dvh] bg-black overflow-hidden select-none game-container" style={{ cursor: gameState === 'playing' && !isMobile ? 'crosshair' : 'default', boxShadow: gameState === 'playing' && engineLiveState.sonarMode === 'passive' ? 'inset 0 0 60px rgba(156,39,176,0.15)' : 'none', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={() => { if (gameState === 'playing' && !isMobile && canvasRef.current) canvasRef.current.requestPointerLock(); }}>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />

      {/* ===== TOUCH LOOK AREA (Right half of screen for swiping to look) ===== */}
      {isMobile && gameState === 'playing' && (
        <div className="absolute top-0 right-0 bottom-0 z-5"
          style={{ touchAction: 'none', width: '55%' }}
          onTouchStart={(e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              const el = t.target as HTMLElement;
              if (el.closest('.touch-joystick') || el.closest('.touch-btn')) continue;
              if (!lookTouchRef.current.active) {
                lookTouchRef.current = { active: true, touchId: t.identifier, lastX: t.clientX };
              }
            }
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            const eng = engineRef.current;
            if (!eng || !lookTouchRef.current.active) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (t.identifier === lookTouchRef.current.touchId) {
                const deltaX = t.clientX - lookTouchRef.current.lastX;
                eng.touchLookDelta += deltaX * 2;
                lookTouchRef.current.lastX = t.clientX;
              }
            }
          }}
          onTouchEnd={(e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (t.identifier === lookTouchRef.current.touchId) {
                lookTouchRef.current = { active: false, touchId: -1, lastX: 0 };
              }
            }
          }}
        />
      )}

      {/* ===== VIRTUAL JOYSTICK (Left Side) ===== */}
      {isMobile && gameState === 'playing' && (
        <div className="touch-joystick absolute z-20"
          style={{ left: 12, bottom: 20, width: 110, height: 110 }}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const t = e.changedTouches[0];
            joystickRef.current = { active: true, touchId: t.identifier, cx, cy, dx: 0, dy: 0 };
            setJoystickPos({ dx: 0, dy: 0, active: true });
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const eng = engineRef.current;
            const j = joystickRef.current;
            if (!j.active || !eng) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (t.identifier === j.touchId) {
                let dx = t.clientX - j.cx;
                let dy = t.clientY - j.cy;
                const maxR = 40;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxR) {
                  dx = (dx / dist) * maxR;
                  dy = (dy / dist) * maxR;
                }
                j.dx = dx;
                j.dy = dy;
                // Left joystick = WASD movement: X = strafe, Y = forward/back
                eng.touchMoveX = dx / maxR; // -1 to 1, positive = strafe right
                eng.touchMoveY = -dy / maxR; // -1 to 1, positive = forward (up on screen = forward)
                setJoystickPos({ dx, dy, active: true });
              }
            }
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (t.identifier === joystickRef.current.touchId) {
                const eng = engineRef.current;
                if (eng) {
                  eng.touchMoveX = 0;
                  eng.touchMoveY = 0;
                }
                // Note: touchLookDelta is consumed each frame by the engine, no need to reset
                joystickRef.current = { active: false, touchId: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
                setJoystickPos({ dx: 0, dy: 0, active: false });
              }
            }
          }}
        >
          {/* Outer circle */}
          <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.05)' }} />
          {/* Inner thumb */}
          <div className="absolute rounded-full"
            style={{
              width: 40, height: 40,
              left: 35 + joystickPos.dx, top: 35 + joystickPos.dy,
              background: 'rgba(0,229,255,0.4)',
              boxShadow: '0 0 10px rgba(0,229,255,0.3)',
              transition: joystickPos.active ? 'none' : 'left 0.1s, top 0.1s',
            }} />
        </div>
      )}

      {/* ===== ACTION BUTTONS (Right Side) ===== */}
      {isMobile && gameState === 'playing' && (
        <div className="absolute right-2 bottom-3 z-20 flex flex-col items-end gap-1.5">
          {/* ATTACK button - large, prominent */}
          <button className="touch-btn game-touch-btn"
            style={{ width: 64, height: 64, fontSize: 12, borderRadius: '50%', borderWidth: 2, borderColor: 'rgba(255,23,68,0.5)', boxShadow: '0 0 12px rgba(255,23,68,0.2)', background: engineLiveState.attackCooldown > 0 ? 'rgba(100,0,0,0.3)' : 'rgba(255,23,68,0.1)' }}
            onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.attackWithWeapon(); }}>
            ⚔️
          </button>
          {/* ECO - Large pulse button */}
          <button className="touch-btn game-touch-btn"
            style={{ width: 54, height: 54, fontSize: 12, borderRadius: '50%', borderWidth: 2, borderColor: 'rgba(0,229,255,0.4)', boxShadow: '0 0 8px rgba(0,229,255,0.15)' }}
            onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.emitPulse(); }}>
            ECO
          </button>
          <div className="flex gap-1.5">
            {/* Flashlight */}
            <button className="touch-btn game-touch-btn game-touch-btn-sm"
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.toggleFlashlight(); }}>
              🔦
            </button>
            {/* Interact */}
            <button className="touch-btn game-touch-btn game-touch-btn-sm"
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.handleInteract(); }}>
              E
            </button>
          </div>
          <div className="flex gap-1.5">
            {/* Sneak toggle */}
            <button className={`touch-btn game-touch-btn game-touch-btn-sm ${sneakActive ? 'game-touch-btn-active' : ''}`}
              onTouchStart={(e) => {
                e.preventDefault(); e.stopPropagation();
                const newVal = !sneakActive;
                setSneakActive(newVal);
                const eng = engineRef.current;
                if (eng) eng.touchSneak = newVal;
              }}>
              🤫
            </button>
            {/* Use item */}
            <button className="touch-btn game-touch-btn game-touch-btn-sm"
              style={{ minWidth: 36, minHeight: 36, fontSize: 12 }}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.useSelectedItem(); }}>
              ▶
            </button>
            {/* Drop item */}
            <button className="touch-btn game-touch-btn game-touch-btn-sm"
              style={{ minWidth: 36, minHeight: 36, fontSize: 12 }}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.dropSelectedItem(); }}>
              ✕
            </button>
            {/* Microphone toggle */}
            <button className="touch-btn game-touch-btn game-touch-btn-sm"
              style={{ minWidth: 36, minHeight: 36, fontSize: 12 }}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); setShowMicConfirm(true); }}>
              🎤
            </button>
          </div>
        </div>
      )}

      {/* ===== MIC CONFIRMATION DIALOG ===== */}
      {showMicConfirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30">
          <div className="p-6 border max-w-sm w-full mx-4" style={{ borderColor: 'rgba(0,229,255,0.3)', backgroundColor: 'rgba(0,0,0,0.9)' }}>
            <h3 className="font-mono text-sm mb-3" style={{ color: '#00e5ff' }}>🎤 ACTIVAR MICRÓFONO</h3>
            <p className="font-mono text-[10px] mb-4" style={{ color: '#888' }}>
              Tu voz generará ruido en el juego. Las entidades te escucharán si hablas o gritas.
            </p>
            <div className="flex gap-3">
              <button onClick={async () => {
                const eng = engineRef.current;
                if (eng) {
                  if (eng.micEnabled) {
                    eng.disableMicrophone();
                  } else {
                    await eng.enableMicrophone();
                  }
                }
                setShowMicConfirm(false);
              }}
                className="flex-1 py-2 font-mono text-xs border"
                style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.05)' }}>
                {engineLiveState.micEnabled ? 'DESACTIVAR' : 'ACTIVAR'}
              </button>
              <button onClick={() => setShowMicConfirm(false)}
                className="flex-1 py-2 font-mono text-xs border"
                style={{ color: '#666', borderColor: '#333', background: 'rgba(0,0,0,0.3)' }}>
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BACKUP MANAGER ===== */}
      {showBackupManager && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-30 px-4">
          <div className="p-4 sm:p-6 border max-w-md w-full" style={{ borderColor: 'rgba(118,255,3,0.3)', backgroundColor: 'rgba(0,0,0,0.95)', maxHeight: '80dvh', overflowY: 'auto' }}>
            <h3 className="font-mono text-sm mb-4" style={{ color: '#76ff03', textShadow: '0 0 10px rgba(118,255,3,0.3)' }}>💾 COPIAS DE SEGURIDAD</h3>
            <p className="font-mono text-[10px] mb-4" style={{ color: '#888' }}>
              Guarda y restaura tu partida completa. Incluye posición, inventario, salud, mapa explorado y enemigos.
              Auto-backup cada 30s durante el juego.
            </p>

            {/* Backup Slots */}
            <div className="space-y-2 mb-4">
              {getBackupSlots().map(slot => (
                <div key={slot.slot} className="flex items-center gap-2 p-2 border" style={{ borderColor: slot.exists ? 'rgba(118,255,3,0.3)' : 'rgba(255,255,255,0.1)', background: slot.exists ? 'rgba(118,255,3,0.03)' : 'rgba(0,0,0,0.3)' }}>
                  <div className="flex-1">
                    <div className="font-mono text-[10px]" style={{ color: slot.exists ? '#76ff03' : '#444' }}>
                      Slot {slot.slot} {slot.exists ? `— ${slot.agoStr}` : '— Vacío'}
                    </div>
                    {slot.data && (
                      <div className="font-mono text-[8px]" style={{ color: '#666' }}>
                        Cap. {slot.data.currentChapter} | ❤️ {slot.data.playerHealth} | 💀 {slot.data.killCount} kills
                      </div>
                    )}
                  </div>
                  {slot.exists && (
                    <button onClick={async () => {
                      const data = loadFromSlot(slot.slot);
                      if (data) {
                        const eng = engineRef.current;
                        if (eng) {
                          await eng.startGame(data.currentChapter, data.difficulty as Difficulty, data.hardcoreMode, data.coopRole as CoopRole);
                          eng.restoreFullBackup(data);
                          setGameState('playing');
                          setShowBackupManager(false);
                        }
                      }
                    }}
                      className="px-2 py-1 font-mono text-[9px] border active:scale-95"
                      style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.3)', minHeight: 32 }}>
                      CARGAR
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Export/Import */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => {
                const eng = engineRef.current;
                if (eng) {
                  const backup = eng.createFullBackup();
                  if (backup) exportBackupAsFile(backup);
                }
              }}
                className="flex-1 py-2 font-mono text-[10px] border"
                style={{ color: '#ffd600', borderColor: 'rgba(255,214,0,0.3)', background: 'rgba(255,214,0,0.05)', minHeight: 36 }}>
                📤 EXPORTAR
              </button>
              <button onClick={async () => {
                const data = await importBackupFromFile();
                if (data) {
                  const eng = engineRef.current;
                  if (eng) {
                    await eng.startGame(data.currentChapter, data.difficulty as Difficulty, data.hardcoreMode, data.coopRole as CoopRole);
                    eng.restoreFullBackup(data);
                    setGameState('playing');
                    setShowBackupManager(false);
                  }
                }
              }}
                className="flex-1 py-2 font-mono text-[10px] border"
                style={{ color: '#ffd600', borderColor: 'rgba(255,214,0,0.3)', background: 'rgba(255,214,0,0.05)', minHeight: 36 }}>
                📥 IMPORTAR
              </button>
            </div>

            {/* Crash Recovery */}
            {crashRecoveryAvailable && (
              <div className="p-2 border mb-3" style={{ borderColor: 'rgba(255,23,68,0.3)', background: 'rgba(255,23,68,0.05)' }}>
                <div className="font-mono text-[10px] mb-1" style={{ color: '#ff1744' }}>⚠️ Partida recuperable encontrada</div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    const data = loadCrashRecovery();
                    if (data) {
                      const eng = engineRef.current;
                      if (eng) {
                        await eng.startGame(data.currentChapter, data.difficulty as Difficulty, data.hardcoreMode, data.coopRole as CoopRole);
                        eng.restoreFullBackup(data);
                        setGameState('playing');
                        setShowBackupManager(false);
                        setCrashRecoveryAvailable(false);
                      }
                    }
                  }}
                    className="flex-1 py-1 font-mono text-[9px] border"
                    style={{ color: '#ff1744', borderColor: 'rgba(255,23,68,0.3)', minHeight: 28 }}>
                    RECUPERAR
                  </button>
                  <button onClick={() => { clearCrashRecovery(); setCrashRecoveryAvailable(false); }}
                    className="px-3 py-1 font-mono text-[9px] border"
                    style={{ color: '#666', borderColor: '#333', minHeight: 28 }}>
                    DESCARTAR
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => setShowBackupManager(false)}
              className="w-full py-2 font-mono text-xs border"
              style={{ color: '#666', borderColor: '#333', background: 'rgba(0,0,0,0.3)', minHeight: 36 }}>
              CERRAR
            </button>
          </div>
        </div>
      )}

      {/* ===== ZONE WARNING INDICATORS ===== */}
      {gameState === 'playing' && !engineLiveState.hardcoreMode && (
        <>
          {/* Sonar mode indicator */}
          <div className="absolute top-1 sm:top-2 left-1/2 -translate-x-1/2 z-20 font-mono text-[10px] sm:text-xs tracking-widest"
            style={{
              color: engineLiveState.sonarMode === 'active' ? '#00e5ff' : '#9c27b0',
              textShadow: `0 0 10px ${engineLiveState.sonarMode === 'active' ? 'rgba(0,229,255,0.5)' : 'rgba(156,39,176,0.5)'}`,
            }}>
            SONAR: {engineLiveState.sonarMode === 'active' ? 'ACTIVO' : 'PASIVO'}
          </div>
          {engineLiveState.isInSilentZone && (
            <div className="absolute top-8 sm:top-14 left-1/2 -translate-x-1/2 z-20 font-mono text-xs sm:text-sm tracking-widest animate-pulse"
              style={{ color: '#9c27b0', textShadow: '0 0 10px rgba(156,39,176,0.5)' }}>
              🔇 ZONA SILENCIOSA
            </div>
          )}
          {engineLiveState.isInWhiteNoiseZone && (
            <div className="absolute top-8 sm:top-14 left-1/2 -translate-x-1/2 z-20 font-mono text-xs sm:text-sm tracking-widest animate-pulse"
              style={{ color: '#ffffff', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>
              📡 RUIDO BLANCO
            </div>
          )}
        </>
      )}

      {/* ===== WEAPON HUD & STATUS EFFECTS ===== */}
      {gameState === 'playing' && (
        <>
          {/* Weapon indicator - bottom center */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none">
            {engineLiveState.equippedWeapon && (
              <div className="font-mono text-[10px] sm:text-xs px-3 py-1 rounded-sm"
                style={{ color: '#ff1744', background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', textShadow: '0 0 8px rgba(255,23,68,0.3)' }}>
                ⚔️ {engineLiveState.equippedWeapon.replace(/_/g, ' ').toUpperCase()} | 💥 {engineLiveState.weaponAmmo}
              </div>
            )}
            {!engineLiveState.equippedWeapon && (
              <div className="font-mono text-[9px] sm:text-[10px] px-3 py-1 rounded-sm opacity-40"
                style={{ color: '#666', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                Sin arma — Recoge un arma para luchar
              </div>
            )}
          </div>

          {/* Health bar - bottom left */}
          <div className="absolute bottom-2 left-2 z-20 pointer-events-none" style={{ width: isMobile ? 80 : 120 }}>
            <div className="font-mono text-[8px] sm:text-[10px] mb-0.5" style={{ color: engineLiveState.playerHealth > 50 ? '#76ff03' : engineLiveState.playerHealth > 25 ? '#ffd600' : '#ff1744' }}>
              ❤️ {engineLiveState.playerHealth}/{engineLiveState.playerMaxHealth}
            </div>
            <div className="h-1.5 sm:h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(engineLiveState.playerHealth / engineLiveState.playerMaxHealth) * 100}%`,
                  background: engineLiveState.playerHealth > 50 ? '#76ff03' : engineLiveState.playerHealth > 25 ? '#ffd600' : '#ff1744',
                  boxShadow: `0 0 6px ${engineLiveState.playerHealth > 50 ? 'rgba(118,255,3,0.5)' : engineLiveState.playerHealth > 25 ? 'rgba(255,214,0,0.5)' : 'rgba(255,23,68,0.5)'}`,
                }} />
            </div>
          </div>

          {/* Status effects */}
          {engineLiveState.isWebbed && (
            <div className="absolute top-14 sm:top-20 left-1/2 -translate-x-1/2 z-20 font-mono text-xs sm:text-sm tracking-widest animate-pulse"
              style={{ color: '#76ff03', textShadow: '0 0 10px rgba(118,255,3,0.5)' }}>
              🕸️ ATRAPADO
            </div>
          )}
          {engineLiveState.isParalyzed && (
            <div className="absolute top-14 sm:top-20 left-1/2 -translate-x-1/2 z-20 font-mono text-xs sm:text-sm tracking-widest animate-pulse"
              style={{ color: '#e0e0e0', textShadow: '0 0 10px rgba(224,224,224,0.5)' }}>
              👁️ PARALIZADO
            </div>
          )}

          {/* Crosshair for desktop */}
          {!isMobile && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <div style={{ width: profile.crosshairSize * 2 + 4, height: profile.crosshairSize * 2 + 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {profile.crosshairStyle === 'cross' && (
                  <div style={{ position: 'relative', width: profile.crosshairSize * 2, height: profile.crosshairSize * 2 }}>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: profile.crosshairColor, transform: 'translateY(-50%)' }} />
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: profile.crosshairColor, transform: 'translateX(-50%)' }} />
                  </div>
                )}
                {profile.crosshairStyle === 'dot' && (
                  <div style={{ width: 3, height: 3, borderRadius: '50%', background: profile.crosshairColor }} />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Combat Stats - top left */}
      {gameState === 'playing' && !engineLiveState.hardcoreMode && (
        <div className="absolute top-1 left-1 z-20 font-mono text-[8px] sm:text-[10px] space-y-0.5 pointer-events-none"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ color: '#ff1744' }}>💀 {engineLiveState.killCount} kills</div>
          <div>⚔️ {engineLiveState.totalDamageDealt} dmg dealt</div>
          <div style={{ color: engineLiveState.totalDamageTaken > 50 ? '#ff1744' : '#888' }}>🩸 {engineLiveState.totalDamageTaken} dmg taken</div>
          <div style={{ color: '#ffd600' }}>👹 {engineLiveState.enemiesRemaining} remaining</div>
        </div>
      )}

      {/* Hazard Warning */}
      {engineLiveState.nearbyHazard && (
        <div className="absolute top-20 sm:top-28 left-1/2 -translate-x-1/2 z-20 font-mono text-xs sm:text-sm tracking-widest animate-pulse"
          style={{ color: engineLiveState.nearbyHazard === 'toxic' ? '#76ff03' : engineLiveState.nearbyHazard === 'electric' ? '#ffab00' : '#ff1744', textShadow: '0 0 10px currentColor' }}>
          {engineLiveState.nearbyHazard === 'toxic' ? '☠️ ZONA TÓXICA' : engineLiveState.nearbyHazard === 'electric' ? '⚡ PELIGRO ELÉCTRICO' : '📉 SUELO INESTABLE'}
        </div>
      )}

      {/* ===== CO-OP HUD ===== */}
      {gameState === 'playing' && coopRole !== 'none' && (
        <>
          {/* Role indicator at top */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 font-mono text-xs tracking-widest"
            style={{
              color: coopRole === 'ear' ? '#76ff03' : '#ff6d00',
              textShadow: `0 0 10px ${coopRole === 'ear' ? 'rgba(118,255,3,0.5)' : 'rgba(255,109,0,0.5)'}`,
            }}>
            {coopRole === 'ear' ? '👂 MODO OÍDO - Usa T para hacer ping' : '🏃 MODO CUERPO - Sigue los pings'}
          </div>
          {/* Ping count and active pings list */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 font-mono text-[10px] text-center"
            style={{ color: 'rgba(0,229,255,0.5)' }}>
            {engineLiveState.pingCount} pings activos
          </div>
          {/* Ping touch button for mobile (ear role only) */}
          {isMobile && coopRole === 'ear' && (
            <button className="touch-btn absolute top-1/2 right-3 -translate-y-1/2 z-20 game-touch-btn game-touch-btn-md"
              style={{ borderColor: 'rgba(118,255,3,0.5)', color: '#76ff03', background: 'rgba(118,255,3,0.05)' }}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.addCoopPing(); }}>
              PING
            </button>
          )}
        </>
      )}

      {/* ===== PAUSE BUTTON (Top Right) ===== */}
      {isMobile && gameState === 'playing' && (
        <button className="touch-btn absolute top-3 right-3 z-20 game-touch-btn game-touch-btn-sm"
          onTouchStart={(e) => {
            e.preventDefault(); e.stopPropagation();
            const eng = engineRef.current;
            if (eng) {
              eng.state = 'paused';
              setGameState('paused');
            }
          }}>
          ⏸
        </button>
      )}

      {/* ===== MENU / LANDING PAGE ===== */}
      {gameState === 'menu' && !isStarted && !showMiniDemo && (
        <div className="landing-page absolute inset-0 overflow-y-auto bg-black z-10">
          {/* Particle Background */}
          <ParticleBackground />

          {/* CRT Scanline overlay */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-1" style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,229,255,0.06) 2px,rgba(0,229,255,0.06) 4px)' }} />

          {/* ===== HERO SECTION ===== */}
          <section className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 sm:px-6 z-10 pt-12 pb-16">
            {/* Glitch Title with Chromatic Aberration */}
            <div className="text-center mb-6 sm:mb-8 animate-text-flicker">
              <h1 className="glitch-text text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-mono font-bold tracking-[0.15em] sm:tracking-[0.3em] mb-1 sm:mb-2"
                data-text="ECHOES"
                style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.5),0 0 40px rgba(0,229,255,0.3)' }}>
                ECHOES
              </h1>
              <h2 className="text-lg sm:text-2xl md:text-4xl font-mono tracking-[0.12em] sm:tracking-[0.2em] mb-1 sm:mb-2" style={{ color: '#0097a7' }}>OF THE STATIC</h2>
              <div className="text-xs sm:text-sm font-mono opacity-40" style={{ color: '#004d40' }}>v3.0 — Ecos de la Estática</div>
            </div>

            {/* Improved Hook Text */}
            <div className="max-w-lg text-center mb-6 sm:mb-10 px-2 sm:px-6 font-mono space-y-2 sm:space-y-3">
              <p className="text-sm sm:text-base md:text-lg leading-relaxed" style={{ color: 'rgba(0,229,255,0.6)', textShadow: '0 0 8px rgba(0,229,255,0.2)' }}>
                La oscuridad no es tu enemiga. El silencio sí.
              </p>
              <p className="text-xs sm:text-sm md:text-base" style={{ color: 'rgba(0,229,255,0.35)' }}>
                Usa el sonido para ver, pero recuerda:
              </p>
              <p className="text-sm sm:text-base md:text-lg font-bold" style={{ color: 'rgba(255,23,68,0.7)', textShadow: '0 0 10px rgba(255,23,68,0.3)' }}>
                ellos también escuchan.
              </p>
            </div>

            {/* Interactive Menu Buttons with Sound Wave Effect */}
            <div className="flex flex-col gap-2.5 sm:gap-3 mb-6 sm:mb-8 w-full max-w-sm px-2">
              {saveExists && cachedSave && (
                <SoundWaveButton onClick={() => {
                  setDifficulty(cachedSave.difficulty as Difficulty);
                  setSelectedChapter(cachedSave.currentChapter);
                  setUnlockedChapters(cachedSave.unlockedChapters);
                  setHardcoreMode(cachedSave.hardcoreMode);
                  setCoopRole(cachedSave.coopRole as CoopRole);
                  if (cachedSave.profile) setProfile(cachedSave.profile as unknown as ProfileSettings);
                  if (cachedSave.advanced) setAdvanced(cachedSave.advanced as unknown as AdvancedSettings);
                  if (cachedSave.controls && Array.isArray(cachedSave.controls)) setControls(cachedSave.controls as ControlBinding[]);
                  handleStart(cachedSave.currentChapter, cachedSave.difficulty as Difficulty, cachedSave.hardcoreMode, cachedSave.coopRole as CoopRole);
                }} color="#76ff03">
                  <span className="flex items-center justify-center gap-2">
                    <span>CONTINUAR PARTIDA</span>
                    <span className="animate-label-new text-[8px] px-1.5 py-0.5 rounded-sm" style={{ color: '#ffd600', backgroundColor: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.2)' }}>NUEVO</span>
                  </span>
                  <span className="block text-[9px] mt-1 opacity-60 font-mono">Guardado: {saveAgoStr} | Cap. {cachedSave.currentChapter} | {cachedSave.difficulty}</span>
                </SoundWaveButton>
              )}
              <SoundWaveButton onClick={() => { setIsStarted(true); setGameState('difficulty'); }}>
                NUEVA PARTIDA
              </SoundWaveButton>
              {/* Crash Recovery */}
              {crashRecoveryAvailable && (
                <SoundWaveButton onClick={async () => {
                  const data = loadCrashRecovery();
                  if (data) {
                    const eng = engineRef.current;
                    if (eng) {
                      await eng.startGame(data.currentChapter, data.difficulty as Difficulty, data.hardcoreMode, data.coopRole as CoopRole);
                      eng.restoreFullBackup(data);
                      setGameState('playing');
                      setCrashRecoveryAvailable(false);
                    }
                  }
                }} color="#ff1744">
                  <span className="flex items-center justify-center gap-2">
                    <span>⚠️ RECUPERAR PARTIDA</span>
                    <span className="animate-pulse text-[8px] px-1.5 py-0.5 rounded-sm" style={{ color: '#ff1744', backgroundColor: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)' }}>CRASH</span>
                  </span>
                  <span className="block text-[9px] mt-1 opacity-60 font-mono">Se encontró una partida sin guardar</span>
                </SoundWaveButton>
              )}
              <SoundWaveButton onClick={() => setShowBackupManager(true)} color="#76ff03" dim>
                💾 COPIAS DE SEGURIDAD
              </SoundWaveButton>
              <SoundWaveButton onClick={() => setShowMiniDemo(true)} color="#ff6d00">
                PROBAR ECOLOCALIZACIÓN
              </SoundWaveButton>
              <SoundWaveButton onClick={() => {
                const eng = engineRef.current;
                if (eng) {
                  eng.playCinematic(EchoGameEngine.TRAILER_CINEMATIC, () => {});
                }
              }} color="#9c27b0">
                VER TRÁILER
              </SoundWaveButton>
              <SoundWaveButton onClick={() => {
                const eng = engineRef.current;
                if (eng) {
                  eng.playCinematic(EchoGameEngine.STORY_CINEMATIC, () => {});
                }
              }} color="#8b0000">
                📖 HISTORIA COMPLETA
              </SoundWaveButton>
              <SoundWaveButton onClick={() => setShowSettings(true)} dim>
                AJUSTES
              </SoundWaveButton>
              <SoundWaveButton onClick={() => setShowLevelEditor(true)} dim isNew>
                EDITOR DE NIVELES
              </SoundWaveButton>
            </div>

            {/* Scroll indicator */}
            <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 animate-bounce font-mono text-[10px] sm:text-xs" style={{ color: 'rgba(0,229,255,0.3)' }}>
              ▼ DESCUBRE MÁS
            </div>
          </section>

          {/* ===== TRAILER SECTION ===== */}
          <section className="relative z-10 py-10 sm:py-16 px-4 sm:px-6" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,10,20,1) 50%, rgba(0,0,0,1) 100%)' }}>
            <div className="max-w-4xl mx-auto">
              <h2 className="font-mono text-xl sm:text-2xl md:text-3xl tracking-widest text-center mb-6 sm:mb-8" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.3)' }}>
                MECÁNICA DE ECOLOCALIZACIÓN
              </h2>
              {/* Trailer Simulation - Animated Canvas Preview */}
              <div className="trailer-glow rounded-lg overflow-hidden relative" style={{ aspectRatio: '16/9', background: '#000' }}>
                <TrailerPreview />
              </div>
              <p className="font-mono text-xs text-center mt-4" style={{ color: 'rgba(0,229,255,0.3)' }}>
                Oscuridad total → Pulso → Revelación del monstruo → Oscuridad
              </p>
            </div>
          </section>

          {/* ===== AUDIO DIARY SECTION ===== */}
          <section className="relative z-10 py-10 sm:py-16 px-4 sm:px-6" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(10,0,20,1) 50%, rgba(0,0,0,1) 100%)' }}>
            <div className="max-w-2xl mx-auto">
              <h2 className="font-mono text-xl sm:text-2xl md:text-3xl tracking-widest text-center mb-2" style={{ color: '#9c27b0', textShadow: '0 0 20px rgba(156,39,176,0.3)' }}>
                🎧 DIARIO DE AUDIO
              </h2>
              <p className="font-mono text-[10px] sm:text-xs text-center mb-6 sm:mb-8" style={{ color: 'rgba(156,39,176,0.4)' }}>
                Usa auriculares para escuchar los fragmentos del Proyecto Eco
              </p>
              <AudioDiary />
            </div>
          </section>

          {/* ===== FEATURES SECTION ===== */}
          <section className="relative z-10 py-10 sm:py-16 px-4 sm:px-6" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,10,10,1) 50%, rgba(0,0,0,1) 100%)' }}>
            <div className="max-w-4xl mx-auto">
              <h2 className="font-mono text-xl sm:text-2xl md:text-3xl tracking-widest text-center mb-6 sm:mb-8" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.3)' }}>
                CARACTERÍSTICAS
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
                {[
                  { icon: '🔊', title: 'Ecolocalización', desc: 'Usa pulsos de sonido para revelar el mundo. Cada eco ilumina las paredes... y alerta a tus enemigos.', color: '#00e5ff' },
                  { icon: '👹', title: '8 Monstruos Mortales', desc: 'Devorador, Abominación, Arácnida, Susurrador, Madre... y los originales. Cada uno con IA letal única.', color: '#ff1744' },
                  { icon: '⚔️', title: '10 Armas de Combate', desc: 'Pistola de Eco, Rifle Sónico, Escopeta de Pulso, Cañón de Éter... Destruye lo que te acecha.', color: '#ff6d00' },
                  { icon: '🔇', title: 'Zonas Silenciosas', desc: 'Áreas donde el sonido no existe. Tu ecolocalización no funciona. Sobrevive en el silencio absoluto.', color: '#9c27b0' },
                  { icon: '👥', title: 'Co-op Asimétrico', desc: 'El Oído ve el mapa. El Cuerpo se mueve. Coordínate con tu compañero para sobrevivir.', color: '#76ff03' },
                  { icon: '☠️', title: 'Modo Hardcore', desc: 'Una sola vida. Sin HUD. Sin linterna. Solo audio binaural. ¿Te atreves?', color: '#ffd600' },
                ].map((feat, i) => (
                  <div key={i} className="p-2.5 sm:p-4 border rounded-sm" style={{ borderColor: `${feat.color}20`, background: `${feat.color}05` }}>
                    <div className="text-lg sm:text-2xl mb-1 sm:mb-2">{feat.icon}</div>
                    <h3 className="font-mono text-[10px] sm:text-sm font-bold mb-0.5 sm:mb-1" style={{ color: feat.color }}>{feat.title}</h3>
                    <p className="font-mono text-[9px] sm:text-[11px] leading-relaxed hidden sm:block" style={{ color: 'rgba(255,255,255,0.4)' }}>{feat.desc}</p>
                    <p className="font-mono text-[8px] leading-relaxed sm:hidden" style={{ color: 'rgba(255,255,255,0.3)' }}>{feat.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ===== CONTROLS REFERENCE ===== */}
          <section className="relative z-10 py-8 sm:py-12 px-4 sm:px-6">
            <div className="max-w-md mx-auto text-center">
              <h3 className="font-mono text-base sm:text-lg tracking-widest mb-3 sm:mb-4" style={{ color: '#00e5ff' }}>CONTROLES</h3>
              <div className="font-mono text-[9px] sm:text-[10px] space-y-1" style={{ color: '#555' }}>
                <p>WASD: Mover | Ratón: Mirar | C/SHIFT: Agacharse</p>
                <p>SPACE: Eco Activo | Clic: Eco Pasivo / Atacar</p>
                <p>F: Atacar con arma equipada | R: Cambiar Sonar</p>
                <p>E: Interactuar | 1-4: Inventario | Q: Usar | G: Soltar</p>
                <p>⚔️ 10 armas | 👹 8 monstruos | 💀 ¡Que te persiguen!</p>
              </div>
              <div className="mt-3 font-mono text-[9px] sm:text-[10px] opacity-20" style={{ color: '#0097a7' }}>🎧 Auriculares recomendados</div>
              <div className="mt-2 font-mono text-[8px] sm:text-[9px] opacity-15" style={{ color: '#ffd700' }}>🏆 Complétalo rápido para desbloquear personajes exclusivos</div>
            </div>
          </section>

          {/* ===== FOOTER ===== */}
          <footer className="relative z-10 py-6 px-6 text-center border-t" style={{ borderColor: 'rgba(0,229,255,0.05)' }}>
            <p className="font-mono text-[9px]" style={{ color: 'rgba(0,229,255,0.2)' }}>
              ECHOES OF THE STATIC v3.0 — Ecos de la Estática
            </p>
          </footer>
        </div>
      )}

      {/* ===== MINI DEMO OVERLAY ===== */}
      {showMiniDemo && gameState === 'menu' && (
        <EchoMiniDemo onClose={() => setShowMiniDemo(false)} />
      )}

      {/* ===== DIFFICULTY SELECT ===== */}
      {gameState === 'difficulty' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 px-3 sm:px-4 overflow-y-auto py-8">
          <h2 className="text-xl sm:text-2xl font-mono mb-4 sm:mb-8 tracking-widest" style={{ color: '#00e5ff' }}>DIFICULTAD</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 max-w-4xl w-full mb-4 sm:mb-6">
            {(Object.entries(DIFFICULTY_CONFIGS) as [Difficulty, typeof DIFFICULTY_CONFIGS.medium][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setDifficulty(key)}
                className="p-2.5 sm:p-4 border font-mono text-left transition-all hover:scale-105 active:scale-95"
                style={{
                  borderColor: difficulty === key ? '#00e5ff' : 'rgba(0,229,255,0.15)',
                  backgroundColor: difficulty === key ? 'rgba(0,229,255,0.08)' : 'rgba(0,0,0,0.5)',
                  color: difficulty === key ? '#00e5ff' : '#666',
                  minHeight: 44,
                }}>
                <div className="text-xs sm:text-sm font-bold mb-0.5 sm:mb-1">{cfg.label}</div>
                <div className="text-[9px] sm:text-[10px] opacity-60">{cfg.description}</div>
                <div className="text-[8px] sm:text-[9px] mt-1 sm:mt-2 opacity-40">
                  {cfg.entityCount} enemigos | Inv: {cfg.inventorySize}
                </div>
              </button>
            ))}
          </div>

          {/* Hardcore Mode Toggle */}
          <div className="mb-4 sm:mb-6 w-full max-w-md">
            <button onClick={() => setHardcoreMode(!hardcoreMode)}
              className="w-full p-3 sm:p-4 border font-mono text-xs sm:text-sm transition-all active:scale-95"
              style={{
                borderColor: hardcoreMode ? '#ff1744' : 'rgba(255,23,68,0.2)',
                backgroundColor: hardcoreMode ? 'rgba(255,23,68,0.1)' : 'rgba(0,0,0,0.5)',
                color: hardcoreMode ? '#ff1744' : '#666',
                minHeight: 44,
              }}>
              <div className="flex items-center justify-between">
                <span className="font-bold">☠️ MODO HARDCORE</span>
                <span className="text-[10px] sm:text-xs">{hardcoreMode ? 'ON' : 'OFF'}</span>
              </div>
              <div className="text-[9px] sm:text-[10px] mt-1 opacity-60">⚠️ Una sola vida. Sin HUD. Solo audio binaural.</div>
            </button>
          </div>

          {/* Co-op Mode */}
          <div className="mb-4 sm:mb-6 w-full max-w-md">
            <button onClick={() => setShowCoopSetup(!showCoopSetup)}
              className="w-full p-3 sm:p-4 border font-mono text-xs sm:text-sm transition-all active:scale-95"
              style={{
                borderColor: coopRole !== 'none' ? '#76ff03' : 'rgba(118,255,3,0.2)',
                backgroundColor: coopRole !== 'none' ? 'rgba(118,255,3,0.1)' : 'rgba(0,0,0,0.5)',
                color: coopRole !== 'none' ? '#76ff03' : '#666',
                minHeight: 44,
              }}>
              <div className="flex items-center justify-between">
                <span className="font-bold">👥 MODO COOPERATIVO</span>
                <span className="text-[10px] sm:text-xs">{coopRole !== 'none' ? (coopRole === 'ear' ? 'EL OÍDO' : 'EL CUERPO') : 'OFF'}</span>
              </div>
            </button>

            {showCoopSetup && (
              <div className="mt-3 p-4 border" style={{ borderColor: 'rgba(118,255,3,0.2)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                <div className="text-[10px] font-mono mb-3" style={{ color: '#ff1744' }}>⚠️ Requiere comunicación por voz real</div>
                <div className="flex flex-col gap-2 mb-3">
                  <button onClick={() => setCoopRole('ear')}
                    className="p-3 border font-mono text-xs text-left transition-all"
                    style={{
                      borderColor: coopRole === 'ear' ? '#76ff03' : 'rgba(118,255,3,0.2)',
                      backgroundColor: coopRole === 'ear' ? 'rgba(118,255,3,0.1)' : 'rgba(0,0,0,0.3)',
                      color: coopRole === 'ear' ? '#76ff03' : '#888',
                    }}>
                    👂 EL OÍDO (Ve el mapa)
                  </button>
                  <button onClick={() => setCoopRole('body')}
                    className="p-3 border font-mono text-xs text-left transition-all"
                    style={{
                      borderColor: coopRole === 'body' ? '#76ff03' : 'rgba(118,255,3,0.2)',
                      backgroundColor: coopRole === 'body' ? 'rgba(118,255,3,0.1)' : 'rgba(0,0,0,0.3)',
                      color: coopRole === 'body' ? '#76ff03' : '#888',
                    }}>
                    🏃 EL CUERPO (Se mueve)
                  </button>
                </div>
                {coopRole !== 'none' && (
                  <button onClick={() => setShowCoopSetup(false)}
                    className="w-full p-2 font-mono text-xs border"
                    style={{ color: '#76ff03', borderColor: 'rgba(118,255,3,0.3)', background: 'rgba(118,255,3,0.05)' }}>
                    CONFIRMAR ROL
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <NeonButton onClick={() => setGameState('chapterSelect')}>SELECCIONAR CAPÍTULO</NeonButton>
            <NeonButton onClick={() => { setGameState('menu'); setIsStarted(false); setHardcoreMode(false); setCoopRole('none'); }} dim>VOLVER</NeonButton>
          </div>
        </div>
      )}

      {/* ===== CHAPTER SELECT ===== */}
      {gameState === 'chapterSelect' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 px-3 sm:px-4 overflow-y-auto py-8">
          <h2 className="text-xl sm:text-2xl font-mono mb-1 sm:mb-2 tracking-widest" style={{ color: '#00e5ff' }}>CAPÍTULOS</h2>
          <p className="font-mono text-[9px] sm:text-[10px] mb-3 sm:mb-6 opacity-30" style={{ color: '#ffd700' }}>🏆 Complétalos en tiempo récord para ganar puntos y personajes exclusivos</p>
          <div className="grid grid-cols-2 sm:grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 max-w-4xl w-full mb-4 sm:mb-6">
            {CHAPTERS.map(ch => {
              const unlocked = ch.id <= unlockedChapters;
              const challenge = SPEEDRUN_CHALLENGES.find(sc => sc.chapterId === ch.id);
              return (
                <button key={ch.id} onClick={() => unlocked && setSelectedChapter(ch.id)} disabled={!unlocked}
                  className="p-2.5 sm:p-4 border font-mono text-left transition-all active:scale-95"
                  style={{
                    borderColor: selectedChapter === ch.id ? '#00e5ff' : unlocked ? 'rgba(0,229,255,0.15)' : 'rgba(50,50,50,0.3)',
                    backgroundColor: selectedChapter === ch.id ? 'rgba(0,229,255,0.08)' : 'rgba(0,0,0,0.5)',
                    color: selectedChapter === ch.id ? '#00e5ff' : unlocked ? '#888' : '#333',
                    opacity: unlocked ? 1 : 0.4,
                    minHeight: 44,
                  }}>
                  <div className="text-[9px] sm:text-xs opacity-50 mb-0.5 sm:mb-1">{ch.subtitle}</div>
                  <div className="text-[11px] sm:text-sm font-bold mb-0.5 sm:mb-1">{unlocked ? ch.name : '???'}</div>
                  <div className="text-[9px] sm:text-[10px] opacity-50 hidden sm:block">{unlocked ? ch.description : 'Completa el capítulo anterior'}</div>
                  {unlocked && <div className="text-[8px] sm:text-[9px] mt-0.5 sm:mt-1 opacity-30">{ch.enemies.map(e => e.count).reduce((a,b) => a+b, 0)} entidades</div>}
                  {/* Speedrun challenge targets */}
                  {unlocked && challenge && (
                    <div className="mt-1 sm:mt-2 pt-1 sm:pt-2 border-t" style={{ borderColor: 'rgba(255,215,0,0.1)' }}>
                      <div className="text-[7px] sm:text-[8px] opacity-40 mb-0.5 sm:mb-1" style={{ color: '#ffd700' }}>RETO DE VELOCIDAD</div>
                      {challenge.rewards.map(r => {
                        const targetMins = Math.floor(r.timeLimitSeconds / 60);
                        const targetSecs = r.timeLimitSeconds % 60;
                        const targetStr = `${targetMins}:${targetSecs.toString().padStart(2, '0')}`;
                        const tierIcon = r.tier === 'gold' ? '🥇' : r.tier === 'silver' ? '🥈' : '🥉';
                        return (
                          <div key={r.tier} className="text-[7px] sm:text-[8px] opacity-35 flex items-center gap-1">
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
          <div className="flex gap-2 sm:gap-3 w-full max-w-sm px-2">
            <NeonButton onClick={() => handleStart(selectedChapter, difficulty, hardcoreMode, coopRole)}>JUGAR</NeonButton>
            <NeonButton onClick={() => setGameState('difficulty')} dim>VOLVER</NeonButton>
          </div>
        </div>
      )}

      {/* ===== CHAPTER INTRO ===== */}
      {gameState === 'chapterIntro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 px-4 sm:px-8 animate-fade-in">
          <div className="text-xs sm:text-sm font-mono mb-1 sm:mb-2 tracking-widest" style={{ color: '#0097a7' }}>{CHAPTERS[selectedChapter - 1]?.subtitle}</div>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-mono font-bold mb-4 sm:mb-6" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.4)' }}>{CHAPTERS[selectedChapter - 1]?.name}</h2>
          <p className="font-mono text-xs sm:text-sm max-w-sm sm:max-w-lg text-center leading-relaxed" style={{ color: 'rgba(0,229,255,0.5)' }}>{CHAPTERS[selectedChapter - 1]?.introText}</p>
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
          <div className="mt-6 sm:mt-8 font-mono text-[10px] sm:text-xs opacity-30 animate-pulse">Pulsa ESPACIO para comenzar</div>
          {isMobile && (
            <button className="mt-3 sm:mt-4 px-6 sm:px-8 py-3 sm:py-4 font-mono text-xs sm:text-sm tracking-widest border animate-pulse"
              style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.05)', minHeight: 44 }}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.startPlaying(); }}>
              TOCAR PARA COMENZAR
            </button>
          )}
        </div>
      )}

      {/* ===== AUTOSAVE NOTIFICATION ===== */}
      {showAutoSaveNotice && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 font-mono text-xs tracking-widest animate-save-flash"
          style={{ color: 'rgba(0,229,255,0.8)', textShadow: '0 0 10px rgba(0,229,255,0.3)' }}>
          Autoguardando...
        </div>
      )}

      {/* ===== SAVE TOAST ===== */}
      {showSaveToast && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 font-mono text-sm tracking-widest animate-save-flash px-6 py-3 border rounded"
          style={{ color: '#76ff03', textShadow: '0 0 10px rgba(118,255,3,0.3)', borderColor: 'rgba(118,255,3,0.3)', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          Guardado
        </div>
      )}

      {/* ===== PAUSED ===== */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 px-4 overflow-y-auto py-8">
          <h2 className="text-2xl sm:text-3xl font-mono mb-4 sm:mb-6 tracking-widest" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.3)' }}>PAUSADO</h2>
          <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-xs">
            <div className="animate-menu-appear" style={{ animationDelay: '0ms' }}>
              <NeonButton onClick={() => { const eng = engineRef.current; if (eng) eng.state = 'playing'; setGameState('playing'); }}>CONTINUAR</NeonButton>
            </div>
            <div className="animate-menu-appear" style={{ animationDelay: '50ms' }}>
              <NeonButton onClick={() => {
                const eng = engineRef.current;
                if (eng) {
                  eng.saveBackupToSlot(1);
                  const saveData = buildSaveData({
                    playerName: profile.playerName,
                    unlockedChapters,
                    currentChapter: eng.currentChapter,
                    difficulty: eng.difficulty,
                    hardcoreMode: eng.hardcoreMode,
                    coopRole: eng.coopRole,
                    profile: profile as unknown as Record<string, unknown>,
                    advanced: advanced as unknown as Record<string, unknown>,
                    controls: controls.map(c => ({ action: c.action, label: c.label, key: c.key })),
                    unlockedCharacters: Array.from(eng.unlockedCharacters || []),
                    bestTimes: Array.from(eng.bestChapterTimes?.entries?.() || []).map(([k, v]) => ({ chapterId: k, timeSeconds: v, difficulty: eng.difficulty })),
                    totalPoints: eng.totalPoints || 0,
                    playTime: playTimeRef.current,
                    customLevels: [],
                    achievements: [],
                  });
                  saveGame(saveData);
                  setSaveExists(true);
                  setLastAutoSaveTime(Date.now());
                  setShowSaveToast(true);
                  setTimeout(() => setShowSaveToast(false), 2000);
                }
              }} isNew>💾 GUARDAR PARTIDA</NeonButton>
            </div>
            {/* Backup Slots */}
            <div className="animate-menu-appear" style={{ animationDelay: '75ms' }}>
              <div className="flex gap-1.5">
                {[1, 2, 3].map(slot => (
                  <button key={slot} onClick={() => {
                    const eng = engineRef.current;
                    if (eng) {
                      const ok = eng.saveBackupToSlot(slot);
                      if (ok) { setShowSaveToast(true); setTimeout(() => setShowSaveToast(false), 2000); }
                    }
                  }}
                    className="flex-1 py-2 font-mono text-[9px] sm:text-[10px] border tracking-wider active:scale-95 transition-transform"
                    style={{ color: '#76ff03', borderColor: 'rgba(118,255,3,0.3)', background: 'rgba(118,255,3,0.05)', minHeight: 36 }}>
                    SLOT {slot}
                  </button>
                ))}
              </div>
            </div>
            <div className="animate-menu-appear" style={{ animationDelay: '100ms' }}>
              <NeonButton onClick={() => setShowSettings(true)} dim>AJUSTES</NeonButton>
            </div>
            <div className="animate-menu-appear" style={{ animationDelay: '150ms' }}>
              <NeonButton onClick={() => setShowStatsOverlay(true)} dim isNew>ESTADISTICAS</NeonButton>
            </div>
            <div className="animate-menu-appear" style={{ animationDelay: '200ms' }}>
              <NeonButton onClick={() => {
                const eng = engineRef.current;
                if (eng) {
                  eng.saveBackupToSlot(1);
                  const saveData = buildSaveData({
                    playerName: profile.playerName,
                    unlockedChapters,
                    currentChapter: eng.currentChapter,
                    difficulty: eng.difficulty,
                    hardcoreMode: eng.hardcoreMode,
                    coopRole: eng.coopRole,
                    profile: profile as unknown as Record<string, unknown>,
                    advanced: advanced as unknown as Record<string, unknown>,
                    controls: controls.map(c => ({ action: c.action, label: c.label, key: c.key })),
                    unlockedCharacters: Array.from(eng.unlockedCharacters || []),
                    bestTimes: Array.from(eng.bestChapterTimes?.entries?.() || []).map(([k, v]) => ({ chapterId: k, timeSeconds: v, difficulty: eng.difficulty })),
                    totalPoints: eng.totalPoints || 0,
                    playTime: playTimeRef.current,
                    customLevels: [],
                    achievements: [],
                  });
                  saveGame(saveData);
                  setSaveExists(true);
                }
                setGameState('menu');
                setIsStarted(false);
                setHardcoreMode(false);
                setCoopRole('none');
              }} isNew>GUARDAR Y SALIR</NeonButton>
            </div>
            <div className="animate-menu-appear" style={{ animationDelay: '250ms' }}>
              <NeonButton onClick={() => setShowSaveConfirm(true)} dim>SALIR SIN GUARDAR</NeonButton>
            </div>
          </div>
          {/* Autosave indicator */}
          {lastAutoSaveTime && autoSaveAgoStr && (
            <div className="mt-4 font-mono text-[10px] tracking-widest animate-pulse-glow"
              style={{ color: 'rgba(0,229,255,0.4)' }}>
              💾 Autoguardado: Hace {autoSaveAgoStr} | Backup automático cada 30s
            </div>
          )}
          {isMobile && (
            <button className="mt-4 px-8 py-4 font-mono text-sm tracking-widest border"
              style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.05)', minHeight: 48 }}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); const eng = engineRef.current; if (eng) { eng.state = 'playing'; } setGameState('playing'); }}>
              TOCAR PARA CONTINUAR
            </button>
          )}
        </div>
      )}

      {/* ===== SAVE CONFIRM DIALOG (Quit without saving) ===== */}
      {showSaveConfirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="p-6 border max-w-sm w-full mx-4" style={{ borderColor: 'rgba(255,23,68,0.3)', backgroundColor: 'rgba(0,0,0,0.95)' }}>
            <h3 className="font-mono text-sm mb-3" style={{ color: '#ff1744' }}>SALIR SIN GUARDAR</h3>
            <p className="font-mono text-[10px] mb-4" style={{ color: '#888' }}>
              Seguro? Se perdera el progreso no guardado.
            </p>
            <div className="flex gap-3">
              <button onClick={() => {
                setShowSaveConfirm(false);
                setGameState('menu');
                setIsStarted(false);
                setHardcoreMode(false);
                setCoopRole('none');
              }}
                className="flex-1 py-2 font-mono text-xs border"
                style={{ color: '#ff1744', borderColor: 'rgba(255,23,68,0.3)', background: 'rgba(255,23,68,0.05)' }}>
                SI
              </button>
              <button onClick={() => setShowSaveConfirm(false)}
                className="flex-1 py-2 font-mono text-xs border"
                style={{ color: '#666', borderColor: '#333', background: 'rgba(0,0,0,0.3)' }}>
                NO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== STATS OVERLAY ===== */}
      {showStatsOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="p-6 border max-w-md w-full mx-4" style={{ borderColor: 'rgba(0,229,255,0.2)', backgroundColor: 'rgba(0,0,0,0.95)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-sm" style={{ color: '#00e5ff' }}>ESTADISTICAS</h3>
              <button onClick={() => setShowStatsOverlay(false)} className="font-mono text-xs px-2 py-1 border" style={{ color: '#888', borderColor: '#333' }}>CERRAR</button>
            </div>
            <div className="space-y-3 font-mono">
              <div className="flex justify-between text-[11px]">
                <span style={{ color: '#888' }}>Tiempo jugado</span>
                <span style={{ color: '#00e5ff' }}>{(() => { const m = Math.floor(engineLiveState.playTimeSecs / 60); const h = Math.floor(m / 60); return h > 0 ? `${h}h ${m % 60}m` : `${m}m`; })()}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span style={{ color: '#888' }}>Capitulos completados</span>
                <span style={{ color: '#00e5ff' }}>{Math.max(0, unlockedChapters - 1)} / 6</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span style={{ color: '#888' }}>Capitulo actual</span>
                <span style={{ color: '#00e5ff' }}>{engineLiveState.currentChapter}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span style={{ color: '#888' }}>Puntos totales</span>
                <span style={{ color: '#ffd600' }}>{engineLiveState.totalPoints}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span style={{ color: '#888' }}>Personajes desbloqueados</span>
                <span style={{ color: '#76ff03' }}>{engineLiveState.unlockedCharCount}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span style={{ color: '#888' }}>Dificultad</span>
                <span style={{ color: '#00e5ff' }}>{engineLiveState.engineDifficulty}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span style={{ color: '#888' }}>Modo hardcore</span>
                <span style={{ color: engineLiveState.engineHardcore ? '#ff1744' : '#555' }}>{engineLiveState.engineHardcore ? 'ON' : 'OFF'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DEATH SCREEN ===== */}
      {gameState === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10"
          style={{ background: 'radial-gradient(ellipse at center, rgba(20,0,0,0.9) 0%, rgba(0,0,0,0.98) 70%, rgba(0,0,0,1) 100%)' }}>
          <h1 className="text-2xl sm:text-4xl md:text-6xl font-mono font-bold tracking-widest mb-3 sm:mb-4 animate-pulse"
            style={{ color: '#ff1744', textShadow: '0 0 30px rgba(255,23,68,0.6), 0 0 60px rgba(255,0,0,0.3)' }}>
            HAS MUERTO
          </h1>
          <div className="font-mono text-[10px] sm:text-xs mb-6 sm:mb-8 text-center space-y-1" style={{ color: 'rgba(255,23,68,0.5)' }}>
            <p>Capitulo: {CHAPTERS[(engineLiveState.currentChapter || selectedChapter) - 1]?.name || '???'}</p>
            <p>Tiempo sobrevivido: {Math.floor(engineLiveState.playTimeSecs / 60)}m {engineLiveState.playTimeSecs % 60}s</p>
          </div>
          <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-xs px-4">
            <NeonButton onClick={() => { engineRef.current?.restartChapter(); }}>REINTENTAR</NeonButton>
            {saveExists && (
              <NeonButton onClick={() => {
                const saved = loadGame();
                if (saved) {
                  setDifficulty(saved.difficulty as Difficulty);
                  setSelectedChapter(saved.currentChapter);
                  setUnlockedChapters(saved.unlockedChapters);
                  setHardcoreMode(saved.hardcoreMode);
                  setCoopRole(saved.coopRole as CoopRole);
                  handleStart(saved.currentChapter, saved.difficulty as Difficulty, saved.hardcoreMode, saved.coopRole as CoopRole);
                }
              }} dim>CARGAR ULTIMO GUARDADO</NeonButton>
            )}
            <NeonButton onClick={() => { setGameState('menu'); setIsStarted(false); setHardcoreMode(false); setCoopRole('none'); }} dim>VOLVER AL MENU</NeonButton>
          </div>
          {/* Mobile touch */}
          {isMobile && (
            <button className="mt-6 px-8 py-4 font-mono text-sm tracking-widest border animate-pulse"
              style={{ color: '#ff1744', borderColor: 'rgba(255,23,68,0.4)', background: 'rgba(255,23,68,0.05)', minHeight: 48 }}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); engineRef.current?.restartChapter(); }}>
              TOCAR PARA REINTENTAR
            </button>
          )}
        </div>
      )}

      {/* ===== WON SCREEN TOUCH ===== */}
      {isMobile && gameState === 'won' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10"
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const eng = engineRef.current;
            if (eng) {
              const nextChapter = eng.currentChapter + 1;
              if (nextChapter <= 6) {
                eng.startGame(nextChapter, eng.difficulty);
              } else {
                setGameState('menu');
              }
            }
          }}>
          <button className="px-6 sm:px-8 py-3 sm:py-4 font-mono text-xs sm:text-sm tracking-widest border animate-pulse"
            style={{ color: '#76ff03', borderColor: 'rgba(118,255,3,0.4)', background: 'rgba(118,255,3,0.05)', minHeight: 48 }}>
            TOCAR PARA CONTINUAR
          </button>
        </div>
      )}

      {/* ===== VICTORY / STATS SCREEN ===== */}
      {gameState === 'won' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-20">
          <div className="text-center max-w-md px-4">
            {/* Rank display */}
            <div className="mb-4" style={{ fontSize: 72, fontWeight: 'bold', fontFamily: 'monospace',
              color: engineLiveState.totalDamageTaken < 20 ? '#ffd600' : engineLiveState.totalDamageTaken < 50 ? '#c0c0c0' : '#cd7f32',
              textShadow: '0 0 30px currentColor, 0 0 60px currentColor' }}>
              {engineLiveState.totalDamageTaken < 20 ? 'S' : engineLiveState.totalDamageTaken < 40 ? 'A' : engineLiveState.totalDamageTaken < 60 ? 'B' : engineLiveState.totalDamageTaken < 80 ? 'C' : 'D'}
            </div>
            <h2 className="font-mono text-xl sm:text-2xl tracking-widest mb-4" style={{ color: '#00e5ff', textShadow: '0 0 20px rgba(0,229,255,0.5)' }}>
              CAPÍTULO COMPLETADO
            </h2>
            <div className="font-mono text-xs sm:text-sm space-y-2 mb-6" style={{ color: '#888' }}>
              <div className="flex justify-between"><span>⏱️ Tiempo</span><span style={{ color: '#00e5ff' }}>{Math.floor((engineLiveState.playTimeSecs || 0) / 60)}:{String((engineLiveState.playTimeSecs || 0) % 60).padStart(2, '0')}</span></div>
              <div className="flex justify-between"><span>💀 Monstruos eliminados</span><span style={{ color: '#ff1744' }}>{engineLiveState.killCount}</span></div>
              <div className="flex justify-between"><span>⚔️ Daño infligido</span><span style={{ color: '#ff6d00' }}>{engineLiveState.totalDamageDealt}</span></div>
              <div className="flex justify-between"><span>🩸 Daño recibido</span><span style={{ color: engineLiveState.totalDamageTaken > 50 ? '#ff1744' : '#76ff03' }}>{engineLiveState.totalDamageTaken}</span></div>
              <div className="flex justify-between"><span>❤️ Salud restante</span><span style={{ color: '#76ff03' }}>{engineLiveState.playerHealth}</span></div>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => {
                const eng = engineRef.current;
                if (eng) {
                  const nextChapter = Math.min(eng.currentChapter + 1, 6);
                  handleStart(nextChapter, difficulty, hardcoreMode, coopRole);
                }
              }}
                className="px-4 py-2 font-mono text-sm border"
                style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.05)', minHeight: 44 }}>
                SIGUIENTE CAPÍTULO →
              </button>
              <button onClick={() => { setGameState('menu'); setIsStarted(false); }}
                className="px-4 py-2 font-mono text-sm border"
                style={{ color: '#666', borderColor: '#333', background: 'rgba(0,0,0,0.3)', minHeight: 44 }}>
                MENÚ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PERMANENT DEATH SCREEN (Hardcore) ===== */}
      {gameState === 'permanentDeath' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10"
          style={{ background: 'radial-gradient(ellipse at center, rgba(30,0,0,0.95) 0%, rgba(5,0,0,0.98) 70%, rgba(0,0,0,1) 100%)' }}>
          {/* Scanline effect */}
          <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,0,0,0.04) 2px,rgba(255,0,0,0.04) 4px)' }} />

          <h1 className="text-2xl sm:text-4xl md:text-6xl font-mono font-bold tracking-widest mb-4 sm:mb-6 animate-pulse"
            style={{ color: '#ff1744', textShadow: '0 0 40px rgba(255,23,68,0.8), 0 0 80px rgba(255,0,0,0.4)' }}>
            MUERTE PERMANENTE
          </h1>
          <p className="font-mono text-sm sm:text-lg md:text-xl mb-3 sm:mb-4 text-center px-4 sm:px-8"
            style={{ color: 'rgba(255,23,68,0.7)', textShadow: '0 0 20px rgba(255,23,68,0.3)' }}>
            Tu viaje termina aquí. La estática te consume.
          </p>
          <p className="font-mono text-[10px] sm:text-xs mb-6 sm:mb-8 opacity-30" style={{ color: '#ff1744' }}>
            Todo el progreso se ha perdido
          </p>
          <button onClick={() => {
            const eng = engineRef.current;
            if (eng) {
              eng.hardcoreMode = false;
              eng.currentChapter = 1;
              eng.unlockedChapters = new Set([1]);
              eng.totalPoints = 0;
              eng.unlockedCharacters = [];
              eng.bestChapterTimes = new Map();
            }
            setGameState('menu');
            setIsStarted(false);
            setHardcoreMode(false);
            setCoopRole('none');
          }}
            className="px-8 py-4 font-mono text-sm tracking-widest border transition-all hover:scale-105"
            style={{ color: '#ff1744', borderColor: 'rgba(255,23,68,0.4)', background: 'rgba(255,23,68,0.05)' }}>
            VOLVER AL MENÚ
          </button>
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

      {/* ===== LEVEL EDITOR ===== */}
      {showLevelEditor && (
        <LevelEditor
          onTestPlay={async (level: CustomLevel) => {
            const eng = engineRef.current;
            if (eng) {
              await eng.loadCustomLevel(level);
              setGameState('playing');
              setShowLevelEditor(false);
            }
          }}
          onExit={() => {
            setShowLevelEditor(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function NeonButton({ children, onClick, dim = false, isNew = false }: { children: React.ReactNode; onClick: () => void; dim?: boolean; isNew?: boolean }) {
  return (
    <button onClick={onClick}
      className="px-5 sm:px-8 py-2.5 sm:py-3 font-mono text-xs sm:text-sm tracking-widest border transition-all duration-300 hover:scale-105 active:scale-95 w-full sm:w-auto"
      style={{
        color: dim ? '#555' : '#00e5ff',
        borderColor: dim ? 'rgba(100,100,100,0.2)' : 'rgba(0,229,255,0.25)',
        backgroundColor: dim ? 'rgba(0,0,0,0.3)' : 'rgba(0,229,255,0.03)',
        minHeight: 44,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#00e5ff'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,229,255,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = dim ? 'rgba(100,100,100,0.2)' : 'rgba(0,229,255,0.25)'; e.currentTarget.style.boxShadow = 'none'; }}>
      <span className="flex items-center justify-center gap-2">
        {children}
        {isNew && (
          <span className="animate-label-new text-[8px] px-1.5 py-0.5 rounded-sm" style={{ color: '#ffd600', backgroundColor: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.2)' }}>NUEVO</span>
        )}
      </span>
    </button>
  );
}

// ============================================================
// Sound Wave Button - Interactive menu button with expanding
// wave rings and audio feedback on hover
// ============================================================
function SoundWaveButton({ children, onClick, dim = false, isNew = false, color = '#00e5ff' }: {
  children: React.ReactNode; onClick: () => void; dim?: boolean; isNew?: boolean; color?: string;
}) {
  const audioRef = useRef<AudioContext | null>(null);

  const playHoverSound = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext();
      }
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  };

  return (
    <button onClick={onClick}
      className="sound-wave-btn relative px-5 sm:px-8 py-2.5 sm:py-3 font-mono text-xs sm:text-sm tracking-widest border transition-all duration-300 hover:scale-105 active:scale-95 overflow-visible w-full"
      style={{
        color: dim ? '#555' : color,
        borderColor: dim ? 'rgba(100,100,100,0.2)' : `${color}40`,
        backgroundColor: dim ? 'rgba(0,0,0,0.3)' : `${color}0a`,
        textShadow: dim ? 'none' : `0 0 8px ${color}40`,
        minHeight: 44,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.boxShadow = `0 0 20px ${color}30`;
        playHoverSound();
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = dim ? 'rgba(100,100,100,0.2)' : `${color}40`;
        e.currentTarget.style.boxShadow = 'none';
      }}>
      {/* Expanding wave rings on hover */}
      <div className="wave-ring" style={{ borderColor: color }} />
      <div className="wave-ring" style={{ borderColor: color }} />
      <div className="wave-ring" style={{ borderColor: color }} />
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
        {isNew && (
          <span className="animate-label-new text-[8px] px-1.5 py-0.5 rounded-sm" style={{ color: '#ffd600', backgroundColor: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.2)' }}>NUEVO</span>
        )}
      </span>
    </button>
  );
}

// ============================================================
// Trailer Preview - Animated canvas showing echolocation mechanic
// Demonstrates: darkness → pulse → monster reveal → darkness
// ============================================================
function TrailerPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = 800;
    canvas.height = 450;

    // Pre-define scene
    const walls = [
      { x1: 50, y1: 50, x2: 750, y2: 50 },
      { x1: 750, y1: 50, x2: 750, y2: 400 },
      { x1: 750, y1: 400, x2: 50, y2: 400 },
      { x1: 50, y1: 400, x2: 50, y2: 50 },
      { x1: 200, y1: 50, x2: 200, y2: 200 },
      { x1: 400, y1: 150, x2: 400, y2: 300 },
      { x1: 550, y1: 250, x2: 550, y2: 400 },
      { x1: 300, y1: 300, x2: 450, y2: 300 },
    ];

    const entityPos = { x: 600, y: 250 };
    const playerPos = { x: 150, y: 300 };
    const cycleDuration = 6000; // 6 seconds per cycle

    const render = (time: number) => {
      const cycleTime = time % cycleDuration;
      const phase = cycleTime / cycleDuration;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 800, 450);

      // Phase 0-0.2: Complete darkness
      // Phase 0.2-0.4: Pulse expanding, walls appearing
      // Phase 0.4-0.6: Monster revealed
      // Phase 0.6-0.8: Pulse fading, darkness returning
      // Phase 0.8-1.0: Complete darkness again

      if (phase > 0.15 && phase < 0.75) {
        const pulsePhase = (phase - 0.15) / 0.6;
        const pulseRadius = pulsePhase * 500;
        const wallAlpha = phase < 0.5
          ? Math.min(1, (phase - 0.15) * 3)
          : Math.max(0, 1 - (phase - 0.5) * 2.5);

        // Draw pulse ring
        const ringAlpha = Math.max(0, 1 - pulsePhase);
        ctx.strokeStyle = `rgba(0,229,255,${ringAlpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(playerPos.x, playerPos.y, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw illuminated walls
        ctx.strokeStyle = `rgba(0,229,255,${wallAlpha * 0.8})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = `rgba(0,229,255,${wallAlpha * 0.4})`;
        ctx.shadowBlur = 8;
        for (const w of walls) {
          const wallDist = Math.min(
            Math.sqrt((w.x1 - playerPos.x) ** 2 + (w.y1 - playerPos.y) ** 2),
            Math.sqrt((w.x2 - playerPos.x) ** 2 + (w.y2 - playerPos.y) ** 2)
          );
          if (wallDist < pulseRadius) {
            ctx.beginPath();
            ctx.moveTo(w.x1, w.y1);
            ctx.lineTo(w.x2, w.y2);
            ctx.stroke();
          }
        }
        ctx.shadowBlur = 0;

        // Draw monster silhouette (appears when pulse reaches it)
        const entityDist = Math.sqrt(
          (entityPos.x - playerPos.x) ** 2 + (entityPos.y - playerPos.y) ** 2
        );
        if (pulseRadius > entityDist && phase > 0.3 && phase < 0.7) {
          const monsterAlpha = Math.min(1, (phase - 0.3) * 5) * Math.max(0, 1 - (phase - 0.55) * 4);
          ctx.fillStyle = `rgba(255,23,68,${monsterAlpha * 0.8})`;
          ctx.shadowColor = `rgba(255,23,68,${monsterAlpha * 0.5})`;
          ctx.shadowBlur = 15;
          // Scary humanoid shape
          ctx.beginPath();
          ctx.ellipse(entityPos.x, entityPos.y, 15, 30, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(entityPos.x, entityPos.y - 38, 12, 0, Math.PI * 2);
          ctx.fill();
          // Glowing red eyes
          ctx.fillStyle = `rgba(255,0,0,${monsterAlpha})`;
          ctx.shadowColor = `rgba(255,0,0,${monsterAlpha})`;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(entityPos.x - 4, entityPos.y - 40, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(entityPos.x + 4, entityPos.y - 40, 3, 0, Math.PI * 2);
          ctx.fill();
          // Reaching arms
          ctx.strokeStyle = `rgba(255,23,68,${monsterAlpha * 0.6})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(entityPos.x - 15, entityPos.y - 15);
          ctx.lineTo(entityPos.x - 35, entityPos.y + 10 + Math.sin(time * 0.003) * 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(entityPos.x + 15, entityPos.y - 15);
          ctx.lineTo(entityPos.x + 35, entityPos.y + 10 + Math.sin(time * 0.003 + 1) * 5);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Player position indicator
        ctx.fillStyle = `rgba(0,229,255,${wallAlpha})`;
        ctx.beginPath();
        ctx.arc(playerPos.x, playerPos.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Phase text overlay
      let phaseText = '';
      if (phase < 0.15) phaseText = 'OSCURIDAD TOTAL';
      else if (phase < 0.35) phaseText = 'PULSO DE SONIDO...';
      else if (phase < 0.55) phaseText = '¡ENTIDAD DETECTADA!';
      else if (phase < 0.75) phaseText = 'LA OSCURIDAD REGRESA...';
      else phaseText = 'OSCURIDAD TOTAL';

      ctx.fillStyle = phase > 0.3 && phase < 0.55 ? 'rgba(255,23,68,0.7)' : 'rgba(0,229,255,0.4)';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = phase > 0.3 && phase < 0.55 ? 'rgba(255,23,68,0.5)' : 'rgba(0,229,255,0.3)';
      ctx.shadowBlur = 10;
      ctx.fillText(phaseText, 400, 430);
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: 'auto' }}
    />
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
