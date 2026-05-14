// ============================================================
// Echoes of the Static - Game Engine v2.5
// ============================================================

import {
  Vec2,
  Player,
  Entity,
  EntityState,
  EcholocationPulse,
  GameState,
  Difficulty,
  NEON_COLORS,
  FADE_DURATION,
  PULSE_ANIM_DURATION,
  RayHit,
  Door,
  CHAPTERS,
  DIFFICULTY_CONFIGS,
  ENEMY_TEMPLATES,
  ControlBinding,
  ProfileSettings,
  AdvancedSettings,
  DEFAULT_CONTROLS,
  DEFAULT_PROFILE,
  DEFAULT_ADVANCED,
  InventorySlot,
  ItemDef,
  GameMap,
  EnemyType,
  SonarMode,
  SPEEDRUN_CHALLENGES,
  SpeedrunReward,
  UnlockedCharacter,
  AMBIENT_LIGHT_RADIUS,
  AMBIENT_LIGHT_INTENSITY,
  CoopRole,
  PingMarker,
  CustomLevel,
  EditorCell,
} from './types';
import {
  generateLevel,
  findEntitySpawnPositions,
  isWalkable,
  isExit,
  isDoor,
  wallKey,
  findItemNearby,
  isInZone,
  customLevelToGameMap,
} from './level';
import { AudioSystem } from './audio';
import { ITEM_BY_ID } from './items';

// ---- Internal interfaces ----

interface WallIllum {
  initialIntensity: number;
  timestamp: number;
  color: string;
  fadeMultiplier?: number; // 1.0 = normal, >1 = persists longer (echo), <1 = fades faster (absorb)
}

interface SoundEvent {
  pos: Vec2;
  volume: number;
  radius: number;
  time: number;
}

interface FlareEffect {
  pos: Vec2;
  startTime: number;
  duration: number;
  radius: number;
  intensity: number;
}

interface CinematicFrame {
  duration: number; // seconds
  type: 'fade_in' | 'fade_out' | 'text' | 'scanlines' | 'pulse_wave' | 'static' | 'entity_reveal' | 'blackout' | 'logo' | 'warning';
  text?: string;
  subtext?: string;
  color?: string;
  intensity?: number;
}

// ============================================================
// EchoGameEngine - Main game engine class
// ============================================================

export class EchoGameEngine {
  // ---- Canvas ----
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  width = 0;
  height = 0;

  // ---- Game state ----
  state: GameState = 'menu';
  map!: GameMap;
  player!: Player;
  entities: Entity[] = [];
  pulses: EcholocationPulse[] = [];
  soundEvents: SoundEvent[] = [];
  flares: FlareEffect[] = [];

  // ---- Illumination map ----
  illumination: Map<string, WallIllum> = new Map();

  // ---- Settings ----
  difficulty: Difficulty = 'medium';
  currentChapter = 1;
  controls: ControlBinding[];
  profile: ProfileSettings;
  advanced: AdvancedSettings;

  // ---- Progression ----
  unlockedChapters: Set<number> = new Set([1]);
  totalPoints = 0;
  unlockedCharacters: UnlockedCharacter[] = [];
  lastCompletionTimeSeconds = 0;
  lastReward: SpeedrunReward | null = null;
  bestChapterTimes: Map<number, number> = new Map(); // chapterId -> best time in seconds

  // ---- Input ----
  keys: Set<string> = new Set();
  mouseLocked = false;
  private _cleanup?: () => void;

  // ---- Touch input ----
  touchMoveX: number = 0; // -1 to 1 (left stick horizontal)
  touchMoveY: number = 0; // -1 to 1 (left stick vertical)
  touchSneak: boolean = false; // sneak toggle from touch button
  touchLookDelta: number = 0; // rotation delta from touch swipe
  isMobile: boolean = false; // whether running on mobile

  // ---- Timing ----
  lastTime = 0;
  pulseCooldownTimer = 0;
  gameStartTime = 0;
  animFrameId = 0;

  // ---- Audio ----
  audio: AudioSystem;

  // ---- Danger tracking ----
  closestEntityDist = Infinity;

  // ---- Entity afterimage trails ----
  private entityAfterimages: Array<{
    entityId: number;
    x: number;
    y: number;
    spriteHeight: number;
    spriteWidth: number;
    type: EnemyType;
    color: string;
    alpha: number;
    time: number;
  }> = [];

  // ---- Animation state ----
  breathPhase = 0;
  glitchIntensity = 0;
  staticPhase = 0;
  deathTimer = 0;
  introTimer = 0;

  // ---- Screen shake ----
  shakeX = 0;
  shakeY = 0;
  shakeDecay = 0;

  // ---- Zone state ----
  isInSilentZone: boolean = false;
  isInWhiteNoiseZone: boolean = false;

  // ---- Crouch toggle state (C key toggles, Shift holds) ----
  isCrouching: boolean = false;

  // ---- Lore state ----
  currentLoreIndex: number = 0;
  pendingLore: string | null = null;
  loreTimer: number = 0;
  loreCharIndex: number = 0;
  loreTypewriterTimer: number = 0;

  // ---- FPS tracking ----
  frameCount = 0;
  fpsTime = 0;
  fps = 60;

  // ---- Hardcore mode ----
  hardcoreMode: boolean = false;

  // ---- Co-op mode ----
  coopEnabled: boolean = false;
  coopRole: CoopRole = 'none';
  coopPartnerRole: CoopRole = 'none';
  pingMarkers: PingMarker[] = [];
  coopPingMarkers: PingMarker[] = []; // Tracked pings from The Ear
  coopBlindFolded: boolean = false;
  private nextPingId = 0;
  // Ear role spectator camera
  earCameraDir: number = 0;

  // ---- Hardcore audio ----
  hardcoreAudioEnabled: boolean = false;
  private hardcoreStaticTimer: number = 0; // seconds until next static interference

  // ---- Microphone integration ----
  micEnabled: boolean = false;
  micNoiseLevel: number = 0;
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micAudioCtx: AudioContext | null = null;
  micSensitivity: number = 1.0;
  micNoiseThreshold: number = 0.3;

  // ---- Sonar system ----
  sonarMode: SonarMode = 'active';
  passiveSonarRevealRadius: number = 2.5;
  passiveEntityRevealRadius: number = 4;
  private echoAmplifierActive: boolean = false;
  private soundDampenerTimer: number = 0; // seconds remaining

  // ---- Entity Lore ----
  static readonly ENTITY_LORE: Record<EnemyType, { name: string; origin: string; story: string }> = {
    stalker: {
      name: 'Acechador',
      origin: 'Proyecto Eco - Sujeto #3',
      story: 'El primer voluntario del Proyecto Eco. Ciego tras el tercer día, su audición se amplificó cien veces. Ahora recorre los pasillos escuchando cada latido, cada suspiro. Nunca olvida un sonido. Nunca deja de perseguirlo. Lo que alguna vez fue un científico brillante ahora es una sombra que acecha en la oscuridad, guiada solo por el eco de tus pasos.',
    },
    hunter: {
      name: 'Cazador',
      origin: 'Proyecto Eco - Sujeto #12',
      story: 'Un soldado reclutado para pruebas de amplificación auditiva. El tratamiento le otorgó velocidad sobrehumana pero destruyó su corteza prefrontal. Ya no piensa, solo reacciona. Cada sonido es una presa, cada eco una señal de ataque. Su atención es corta pero su embestida es devastadora. Corre hacia el ruido más cercano con una ferocidad que no conoce freno.',
    },
    phantom: {
      name: 'Fantasma',
      origin: 'Proyecto Eco - Sujeto #7',
      story: 'El sujeto que dijo "Puedo oír las paredes respirar". Su conciencia se fracturó entre frecuencias, permitiéndole existir parcialmente fuera del plano físico. Aparece y desaparece como una mala sintonía de radio. Se teletransporta cerca de sonidos fuertes, susurrando en frecuencias que solo los locos pueden oír. Es el más antiguo, el más consciente de lo que fue.',
    },
  };

  // ---- Cinematic system ----
  cinematicMode: boolean = false;
  cinematicSequence: CinematicFrame[] = [];
  cinematicIndex: number = 0;
  cinematicTimer: number = 0;
  cinematicCallback: (() => void) | null = null;
  cinematicAlpha: number = 0;

  // ---- Callback ----
  onStateChange?: (state: GameState) => void;

  // ---- Entity ID counter ----
  private nextEntityId = 0;

  // ---- Acoustic zone map (for custom levels) ----
  acousticZoneMap: Map<string, EditorCell['acousticProperty']> = new Map();
  customAcousticProfile: CustomLevel['acousticProfile'] | null = null;

  // ---- Difficulty config helper ----
  private get diffConfig() {
    return DIFFICULTY_CONFIGS[this.difficulty];
  }

  // ============================================================
  // Constructor
  // ============================================================

  constructor() {
    this.audio = new AudioSystem();
    this.controls = DEFAULT_CONTROLS.map(c => ({ ...c }));
    this.profile = { ...DEFAULT_PROFILE };
    this.advanced = { ...DEFAULT_ADVANCED };
  }

  // ============================================================
  // Initialization
  // ============================================================

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.setupInput();
  }

  async startGame(chapterId: number = 1, difficulty: Difficulty = 'medium', hardcore: boolean = false, coopRole: CoopRole = 'none') {
    await this.audio.init();
    this.audio.resume();

    this.currentChapter = chapterId;
    this.difficulty = difficulty;
    this.hardcoreMode = hardcore;
    this.coopRole = coopRole;
    this.coopEnabled = coopRole !== 'none';
    this.coopPartnerRole = coopRole === 'ear' ? 'body' : coopRole === 'body' ? 'ear' : 'none';
    this.pingMarkers = [];
    this.initLevel();

    this.state = 'chapterIntro';
    this.introTimer = 0;
    this.onStateChange?.('chapterIntro');
  }

  /** Transition from chapterIntro to playing (used by touch UI) */
  startPlaying() {
    if (this.state === 'chapterIntro') {
      this.state = 'playing';
      this.audio.startAmbient();
      this.audio.startHeartbeat();
      this.onStateChange?.('playing');
    }
  }

  /** Restart the current chapter */
  restartChapter() {
    this.startGame(this.currentChapter, this.difficulty, this.hardcoreMode, this.coopRole);
  }

  /** Load a custom level from the level editor */
  async loadCustomLevel(level: CustomLevel) {
    await this.audio.init();
    this.audio.resume();

    this.currentChapter = 0; // Custom level
    this.difficulty = 'medium';
    this.hardcoreMode = false;
    this.coopRole = 'none';
    this.coopEnabled = false;
    this.pingMarkers = [];

    // Convert custom level to game map
    this.map = customLevelToGameMap(level);
    this.illumination = new Map();
    this.flares = [];
    this.nextEntityId = 0;

    // Build acoustic zone map from the custom level
    this.acousticZoneMap = new Map();
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const cell = level.cells[y][x];
        if (cell.acousticProperty !== 'normal') {
          this.acousticZoneMap.set(`${x},${y}`, cell.acousticProperty);
        }
      }
    }
    this.customAcousticProfile = { ...level.acousticProfile };

    const invSize = this.diffConfig.inventorySize;
    const flashlightDef = ITEM_BY_ID('flashlight');
    const startingInventory: InventorySlot[] = [];
    if (flashlightDef) {
      startingInventory.push({
        item: flashlightDef,
        count: 1,
        uses: flashlightDef.uses,
      });
    }

    this.player = {
      pos: { x: level.playerStart.x + 0.5, y: level.playerStart.y + 0.5 },
      dir: 0,
      speed: this.diffConfig.playerSpeed,
      isMoving: false,
      isSneaking: false,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      noiseLevel: 0,
      lastFootstepTime: 0,
      flashlightOn: true,
      flashlightBattery: 100,
      maxFlashlightBattery: 100,
      inventory: startingInventory,
      inventorySize: invSize,
      selectedSlot: 0,
      interactCooldown: 0,
      hardcore: false,
    };

    // Spawn entities at marked positions
    this.entities = [];
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const cell = level.cells[y][x];
        if (cell.entitySpawn) {
          const template = ENEMY_TEMPLATES[cell.entitySpawn];
          if (template) {
            this.entities.push({
              id: this.nextEntityId++,
              type: cell.entitySpawn,
              pos: { x: x + 0.5, y: y + 0.5 },
              targetPos: null,
              state: 'patrol',
              speed: template.baseSpeed * (this.diffConfig.entityBaseSpeed / 1.0),
              hearingRange: template.hearingRange * (this.diffConfig.entityHearingRange / 12),
              lastHeardSound: null,
              lastHeardTime: 0,
              stateTimer: 2 + Math.random() * 4,
              patrolAngle: Math.random() * Math.PI * 2,
              animPhase: Math.random() * Math.PI * 2,
              killTimer: 0,
              health: 3,
              teleportCooldown: 0,
              isTeleporting: false,
              teleportTimer: 0,
              rushTimer: 0,
              persistenceTimer: 0,
            });
          }
        }
      }
    }

    this.pulses = [];
    this.soundEvents = [];
    this.pulseCooldownTimer = 0;
    this.closestEntityDist = Infinity;
    this.deathTimer = 0;
    this.glitchIntensity = 0;
    this.gameStartTime = performance.now();

    this.state = 'playing';
    this.audio.startAmbient();
    this.audio.startHeartbeat();
    this.onStateChange?.('playing');
  }

  /** Get the acoustic property at a given cell position */
  getAcousticAt(x: number, y: number): EditorCell['acousticProperty'] {
    return this.acousticZoneMap.get(`${x},${y}`) || 'normal';
  }

  private initLevel() {
    this.map = generateLevel(this.currentChapter, this.difficulty);
    this.illumination = new Map();
    this.flares = [];
    this.nextEntityId = 0;
    // Clear custom acoustic data for normal levels
    this.acousticZoneMap = new Map();
    this.customAcousticProfile = null;

    const sr = this.map.startRoom;
    const invSize = this.diffConfig.inventorySize;

    // Give player starting flashlight (unless hardcore)
    const flashlightDef = ITEM_BY_ID('flashlight');
    const startingInventory: InventorySlot[] = [];
    if (flashlightDef && !this.hardcoreMode) {
      startingInventory.push({
        item: flashlightDef,
        count: 1,
        uses: flashlightDef.uses,
      });
    }

    // Hardcore mode: no flashlight at start, must find it
    const hasStartingFlashlight = !this.hardcoreMode && !!flashlightDef;

    this.player = {
      pos: { x: sr.x + sr.w / 2 + 0.5, y: sr.y + sr.h / 2 + 0.5 },
      dir: 0,
      speed: this.diffConfig.playerSpeed,
      isMoving: false,
      isSneaking: false,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      noiseLevel: 0,
      lastFootstepTime: 0,
      flashlightOn: hasStartingFlashlight, // Hardcore: starts OFF
      flashlightBattery: 100,
      maxFlashlightBattery: 100,
      inventory: hasStartingFlashlight ? startingInventory : [],
      inventorySize: invSize,
      selectedSlot: 0,
      interactCooldown: 0,
      hardcore: this.hardcoreMode,
    };

    // Spawn entities based on chapter definition
    const chapter = CHAPTERS.find(c => c.id === this.currentChapter) || CHAPTERS[0];
    this.entities = [];

    for (const enemyDef of chapter.enemies) {
      const template = ENEMY_TEMPLATES[enemyDef.type];
      const count = enemyDef.count;
      const spawns = findEntitySpawnPositions(
        this.map,
        count,
        this.player.pos,
        8
      );

      for (let i = 0; i < spawns.length; i++) {
        const baseSpeedMult = 1 + (this.currentChapter - 1) * 0.1;
        const hearingMult = 1 + (this.currentChapter - 1) * 0.05;

        this.entities.push({
          id: this.nextEntityId++,
          type: enemyDef.type,
          pos: { ...spawns[i] },
          targetPos: null,
          state: 'patrol',
          speed: template.baseSpeed * baseSpeedMult * (this.diffConfig.entityBaseSpeed / 1.0),
          hearingRange: template.hearingRange * hearingMult * (this.diffConfig.entityHearingRange / 12),
          lastHeardSound: null,
          lastHeardTime: 0,
          stateTimer: 2 + Math.random() * 4,
          patrolAngle: Math.random() * Math.PI * 2,
          animPhase: Math.random() * Math.PI * 2,
          killTimer: 0,
          health: 3,
          teleportCooldown: 0,
          isTeleporting: false,
          teleportTimer: 0,
          rushTimer: 0,
          persistenceTimer: 0,
        });
      }
    }

    this.pulses = [];
    this.soundEvents = [];
    this.pulseCooldownTimer = 0;
    this.closestEntityDist = Infinity;
    this.deathTimer = 0;
    this.glitchIntensity = 0;
    this.gameStartTime = performance.now();
  }

  // ============================================================
  // Input handling
  // ============================================================

  private setupInput() {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.code);

      // Cinematic skip
      if (this.cinematicMode && e.code === 'Space') {
        e.preventDefault();
        this.skipCinematic();
        return;
      }

      if (this.state === 'chapterIntro') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          this.state = 'playing';
          this.audio.startAmbient();
          this.audio.startHeartbeat();
          this.onStateChange?.('playing');
        }
        return;
      }

      if (this.state === 'playing') {
        if (this.isAction('pulse', e.code)) {
          e.preventDefault();
          this.emitPulse();
        }
        if (this.isAction('softPulse', e.code) || this.isAction('interact', e.code)) {
          e.preventDefault();
          this.handleInteract();
        }
        if (this.isAction('flashlight', e.code)) {
          e.preventDefault();
          this.emitActivePulse();
        }
        if (this.isAction('crouch', e.code)) {
          e.preventDefault();
          this.isCrouching = !this.isCrouching;
        }
        if (this.isAction('sonarToggle', e.code)) {
          e.preventDefault();
          this.toggleSonarMode();
        }
        if (this.isAction('coopPing', e.code)) {
          e.preventDefault();
          this.addCoopPing();
        }
        if (this.isAction('inventory1', e.code)) {
          this.player.selectedSlot = 0;
        }
        if (this.isAction('inventory2', e.code)) {
          this.player.selectedSlot = 1;
        }
        if (this.isAction('inventory3', e.code)) {
          this.player.selectedSlot = 2;
        }
        if (this.isAction('inventory4', e.code)) {
          this.player.selectedSlot = 3;
        }
        if (this.isAction('useItem', e.code)) {
          e.preventDefault();
          this.useSelectedItem();
        }
        if (this.isAction('dropItem', e.code)) {
          e.preventDefault();
          this.dropSelectedItem();
        }
      }

      if (this.isAction('pause', e.code)) {
        if (this.state === 'playing') {
          this.state = 'paused';
          this.onStateChange?.('paused');
        } else if (this.state === 'paused') {
          this.state = 'playing';
          this.onStateChange?.('playing');
        }
      }

      if (e.code === 'KeyR' && (this.state === 'dead' || this.state === 'won')) {
        this.startGame(this.currentChapter, this.difficulty);
      }
      // Note: KeyR is now also bound to sonarToggle via controls when playing.
      // The above handler for dead/won only fires outside 'playing' state.
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (this.mouseLocked && this.state === 'playing') {
        const sens = this.advanced.mouseSensitivity * 0.001;
        const invertY = this.advanced.mouseInvertY ? -1 : 1;
        this.player.dir += e.movementX * sens;
        // No pitch in this 2.5D engine, but we track for future use
        void invertY;
      }
    };

    const onClick = () => {
      if (this.state === 'playing') {
        if (this.mouseLocked) {
          // Left click while pointer locked: emit passive echo
          this.emitPassiveEcho();
        } else if (this.canvas) {
          this.canvas.requestPointerLock();
        }
      }
    };

    const onPointerLockChange = () => {
      this.mouseLocked = document.pointerLockElement === this.canvas;
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    this._cleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }

  private isAction(action: string, code: string): boolean {
    const binding = this.controls.find(c => c.action === action);
    return binding ? binding.key === code : false;
  }

  private isActionDown(action: string): boolean {
    const binding = this.controls.find(c => c.action === action);
    return binding ? this.keys.has(binding.key) : false;
  }

  // ============================================================
  // Illumination system
  // ============================================================

  private getCurrentIntensity(illum: WallIllum): number {
    const fadeDuration = this.advanced.pulseFadeDuration * (illum.fadeMultiplier ?? 1.0);
    const elapsed = performance.now() - illum.timestamp;
    if (elapsed >= fadeDuration) return 0;
    return illum.initialIntensity * (1 - elapsed / fadeDuration);
  }

  private setIllumination(key: string, intensity: number, color: string) {
    const existing = this.illumination.get(key);
    const currentIntensity = existing ? this.getCurrentIntensity(existing) : 0;

    if (intensity > currentIntensity) {
      // Apply acoustic modifications based on wall position
      let adjustedIntensity = intensity;
      let adjustedColor = color;
      let fadeMultiplier = 1.0;

      // Parse position from key (format: "x,y,side")
      const parts = key.split(',');
      const kx = parseInt(parts[0]);
      const ky = parseInt(parts[1]);

      const acoustic = this.getAcousticAt(kx, ky);

      if (acoustic === 'echo') {
        // Echo zones: illumination persists 50% longer and travels 30% further
        adjustedIntensity = intensity * 1.3;
        fadeMultiplier = 1.5; // persists 50% longer
      } else if (acoustic === 'absorb') {
        // Absorb zones: illumination fades 50% faster
        adjustedIntensity = intensity * 0.5;
        fadeMultiplier = 0.5; // fades 50% faster
      } else if (acoustic === 'reflect') {
        // Reflect zones: illumination slightly brighter
        adjustedIntensity = intensity * 1.15;
        adjustedColor = '#ffd600'; // Yellow tint for reflect
      }

      // Also apply global acoustic profile modifiers
      if (this.customAcousticProfile) {
        adjustedIntensity *= (1 + this.customAcousticProfile.globalEcho * 0.3);
        adjustedIntensity *= (1 - this.customAcousticProfile.globalAbsorption * 0.3);
        fadeMultiplier *= (1 + this.customAcousticProfile.globalEcho * 0.5);
        fadeMultiplier *= (1 - this.customAcousticProfile.globalAbsorption * 0.3);
        // Global reflection is handled in illuminateArea for neighbor bouncing
      }

      this.illumination.set(key, {
        initialIntensity: adjustedIntensity,
        timestamp: performance.now(),
        color: adjustedColor,
        fadeMultiplier,
      });
    }
  }

  // ============================================================
  // Echolocation pulses
  // ============================================================

  emitPulse() {
    // Body role: CANNOT emit echolocation pulses
    if (this.coopEnabled && this.coopRole === 'body') return;
    // Ear role: infinite echolocation handled separately in earEcholocationUpdate
    if (this.coopEnabled && this.coopRole === 'ear') return;

    if (this.pulseCooldownTimer > 0) return;
    if (this.isInSilentZone) return; // Cannot emit pulse in silent zone

    const now = performance.now();

    if (this.sonarMode === 'passive') {
      // Passive sonar: much smaller, quieter pulse. No noise generated.
      const passiveRadius = this.diffConfig.pulseRadius * 0.3;
      this.pulses.push({
        origin: { ...this.player.pos },
        radius: passiveRadius,
        startTime: now,
        duration: PULSE_ANIM_DURATION * 0.6,
        intensity: 0.5,
      });

      this.pulseCooldownTimer = this.diffConfig.pulseCooldown * 0.6;
      // Passive mode: NO sound event, entities are NOT alerted
      this.audio.playPulse(false); // quiet pulse sound (just for player feedback)
      this.audio.resume();

      // Faint illumination near player
      this.illuminateArea(this.player.pos, 2, 0.4, NEON_COLORS.wallSide);

      // Minimal shake
      this.shakeX = (Math.random() - 0.5) * 1;
      this.shakeY = (Math.random() - 0.5) * 1;
      this.shakeDecay = 100;
    } else {
      // Active sonar (original behavior): loud pulse, reveals large area, alerts entities
      this.pulses.push({
        origin: { ...this.player.pos },
        radius: this.diffConfig.pulseRadius * (this.echoAmplifierActive ? 1.5 : 1.0),
        startTime: now,
        duration: PULSE_ANIM_DURATION,
        intensity: 1.0,
      });

      this.pulseCooldownTimer = this.diffConfig.pulseCooldown;
      if (!this.isInSilentZone) {
        this.addSoundEvent(this.player.pos, 1.0, this.diffConfig.pulseRadius);
      }
      this.audio.playPulse(true);
      this.audio.resume();

      // Immediate strong illumination near player (suppressed in silent zone)
      if (!this.isInSilentZone) {
        this.illuminateArea(this.player.pos, 3, 1.0, NEON_COLORS.wall);
      }

      this.shakeX = (Math.random() - 0.5) * 6;
      this.shakeY = (Math.random() - 0.5) * 6;
      this.shakeDecay = 300;
    }
  }

  toggleSonarMode() {
    this.sonarMode = this.sonarMode === 'active' ? 'passive' : 'active';
  }

  emitSoftPulse() {
    // Body role: CANNOT emit echolocation pulses
    if (this.coopEnabled && this.coopRole === 'body') return;

    const now = performance.now();
    const radius = this.advanced.footstepVisualRange * 3;
    this.pulses.push({
      origin: { ...this.player.pos },
      radius,
      startTime: now,
      duration: 500,
      intensity: 0.6,
    });

    this.addSoundEvent(this.player.pos, 0.4, radius);
    this.audio.playPulse(false);
    this.audio.resume();

    this.illuminateArea(this.player.pos, 2, 0.6, NEON_COLORS.wallSide);
  }

  /** Active Pulse (F key): reveals the entire map in a LARGE radius but generates MAXIMUM noise */
  emitActivePulse() {
    if (this.pulseCooldownTimer > 0) return;
    if (this.isInSilentZone) return;

    // Body role: CANNOT emit echolocation pulses
    if (this.coopEnabled && this.coopRole === 'body') return;
    // Ear role: handled separately
    if (this.coopEnabled && this.coopRole === 'ear') return;

    const now = performance.now();
    const radius = this.diffConfig.pulseRadius * 2.0; // 2x radius
    this.pulses.push({
      origin: { ...this.player.pos },
      radius,
      startTime: now,
      duration: PULSE_ANIM_DURATION * 1.5,
      intensity: 1.0,
    });

    this.pulseCooldownTimer = this.diffConfig.pulseCooldown * 1.5; // 1.5x cooldown
    this.addSoundEvent(this.player.pos, 1.5, radius); // 1.5x noise
    this.audio.playPulse(true);
    this.audio.resume();
    this.illuminateArea(this.player.pos, 5, 1.0, '#ff6d00'); // Orange color for active pulse
    this.shakeX = (Math.random() - 0.5) * 10;
    this.shakeY = (Math.random() - 0.5) * 10;
    this.shakeDecay = 500;
  }

  /** Passive Echo (left click): silent, short range ~30% of normal, does NOT alert entities */
  emitPassiveEcho() {
    // Body role: CANNOT emit echolocation pulses
    if (this.coopEnabled && this.coopRole === 'body') return;
    // Ear role: handled separately
    if (this.coopEnabled && this.coopRole === 'ear') return;

    const now = performance.now();
    const radius = this.diffConfig.pulseRadius * 0.3; // 30% range
    this.pulses.push({
      origin: { ...this.player.pos },
      radius,
      startTime: now,
      duration: PULSE_ANIM_DURATION * 0.5,
      intensity: 0.4,
    });

    this.pulseCooldownTimer = this.diffConfig.pulseCooldown * 0.3; // Short cooldown
    // NO sound event - passive echo is silent
    this.audio.playPulse(false);
    this.audio.resume();
    this.illuminateArea(this.player.pos, 2, 0.3, NEON_COLORS.wallSide);
  }

  // ============================================================
  // Co-op: Ear role echolocation (infinite, silent)
  // ============================================================

  private earEcholocationUpdate() {
    const now = performance.now();
    const p = this.player;
    // Emit a full-map silent pulse every frame for the Ear role
    this.pulses.push({
      origin: { ...p.pos },
      radius: Math.max(this.map.width, this.map.height),
      startTime: now,
      duration: PULSE_ANIM_DURATION,
      intensity: 0.8,
    });
    // Illuminate everything within render distance
    this.illuminateArea(p.pos, this.advanced.renderDistance, 1.0, NEON_COLORS.wall);
  }

  // ============================================================
  // Co-op: Ping system
  // ============================================================

  /** Add a co-op ping at the Ear player's look direction */
  addCoopPing(x?: number, y?: number) {
    // Only the Ear role can place pings
    if (this.coopRole !== 'ear') return;

    const p = this.player;
    const pingX = x ?? p.pos.x + Math.cos(p.dir) * 5;
    const pingY = y ?? p.pos.y + Math.sin(p.dir) * 5;

    const now = performance.now();

    // Remove pings older than 10 seconds
    this.pingMarkers = this.pingMarkers.filter(ping => now - ping.time < 10000);
    this.coopPingMarkers = this.coopPingMarkers.filter(ping => now - ping.time < 10000);

    // Limit to 5 active pings
    if (this.pingMarkers.length >= 5) {
      this.pingMarkers.shift();
    }
    if (this.coopPingMarkers.length >= 5) {
      this.coopPingMarkers.shift();
    }

    const marker: PingMarker = {
      pos: { x: pingX, y: pingY },
      time: now,
      id: this.nextPingId++,
    };
    this.pingMarkers.push(marker);
    this.coopPingMarkers.push({ ...marker });

    // Illumination at ping location (3-unit radius)
    this.illuminateArea({ x: pingX, y: pingY }, 3, 1.0, NEON_COLORS.pulse);

    // Audio feedback
    this.audio.playPickup();
  }

  /** Update illumination from active ping markers */
  private updatePingIllumination() {
    const now = performance.now();
    for (const ping of this.pingMarkers) {
      const age = (now - ping.time) / 1000;
      if (age > 10) continue;
      const fadeIntensity = 1 - age / 10;
      // Pings illuminate a 3-unit radius
      this.illuminateArea(ping.pos, 3, fadeIntensity * 0.8, NEON_COLORS.pulse);
    }
    // Clean expired pings
    this.pingMarkers = this.pingMarkers.filter(ping => now - ping.time < 10000);
    this.coopPingMarkers = this.coopPingMarkers.filter(ping => now - ping.time < 10000);
  }

  private addSoundEvent(pos: Vec2, volume: number, radius: number) {
    if (this.isInSilentZone) return; // No sound in silent zone
    this.soundEvents.push({
      pos: { ...pos },
      volume,
      radius,
      time: performance.now(),
    });
  }

  // ============================================================
  // Flashlight
  // ============================================================

  toggleFlashlight() {
    if (this.player.flashlightBattery <= 0 && !this.player.flashlightOn) return;
    this.player.flashlightOn = !this.player.flashlightOn;
    this.audio.playFlashlightClick();

    if (this.player.flashlightOn) {
      this.addSoundEvent(this.player.pos, 0.15, 5);
    }
  }

  private updateFlashlight(dt: number) {
    const p = this.player;
    if (!p.flashlightOn) return;

    // Drain battery
    p.flashlightBattery -= this.diffConfig.flashlightDrain * dt;
    if (p.flashlightBattery <= 0) {
      p.flashlightBattery = 0;
      p.flashlightOn = false;
      this.audio.playFlashlightClick();
      return;
    }

    // Flashlight creates faint constant noise
    if (Math.random() < dt * 0.5) {
      this.addSoundEvent(p.pos, 0.1, 4);
    }

    // Illuminate walls in flashlight cone
    this.illuminateFlashlightCone();
  }

  private illuminateFlashlightCone() {
    const p = this.player;
    const halfFov = (this.advanced.flashlightFov * Math.PI / 180) / 2;
    const numRays = 40;
    const maxDist = this.advanced.renderDistance;
    const intensity = this.advanced.flashlightIntensity;

    for (let i = 0; i < numRays; i++) {
      const angle = p.dir - halfFov + (2 * halfFov * i) / (numRays - 1);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      const hit = this.castRay(p.pos.x, p.pos.y, dirX, dirY);
      if (!hit || hit.distance > maxDist) continue;

      const distFade = Math.max(0.2, 1 - hit.distance / maxDist);
      const angleFade = 1 - Math.abs(i - numRays / 2) / (numRays / 2) * 0.3;
      const illumIntensity = intensity * distFade * angleFade;

      const key = wallKey(hit.mapX, hit.mapY, hit.side);
      this.setIllumination(key, illumIntensity, NEON_COLORS.flashlight);

      // Also illuminate adjacent wall faces for better visual
      const otherSide = hit.side === 0 ? 1 : 0;
      const otherKey = wallKey(hit.mapX, hit.mapY, otherSide);
      this.setIllumination(otherKey, illumIntensity * 0.5, NEON_COLORS.flashlight);
    }
  }

  // ============================================================
  // Item and Inventory system
  // ============================================================

  private handleItemPickup() {
    const p = this.player;
    const nearby = findItemNearby(this.map, p.pos.x, p.pos.y, 1.5);
    if (!nearby) return;

    const itemDef = ITEM_BY_ID(nearby.itemId);
    if (!itemDef) return;

    // Check if inventory has space
    if (p.inventory.length >= p.inventorySize) {
      // Try to stack
      const existingSlot = p.inventory.find(
        s => s.item.id === itemDef.id && s.item.stackable && s.count < s.item.maxStack
      );
      if (!existingSlot) return; // No space
      existingSlot.count++;
      if (itemDef.uses) existingSlot.uses = (existingSlot.uses || 0) + itemDef.uses;
    } else {
      // Add to new slot
      const slot: InventorySlot = {
        item: itemDef,
        count: 1,
        uses: itemDef.uses,
      };
      p.inventory.push(slot);
    }

    // Remove from map
    this.map.items.splice(nearby.index, 1);
    this.audio.playPickup();
  }

  useSelectedItem() {
    const p = this.player;
    if (p.selectedSlot >= p.inventory.length) return;

    const slot = p.inventory[p.selectedSlot];
    if (!slot) return;

    const item = slot.item;
    let consumed = false;

    switch (item.effect) {
      case 'heal': {
        const healAmt = item.value || 30;
        if (p.health < p.maxHealth) {
          p.health = Math.min(p.maxHealth, p.health + healAmt);
          consumed = true;
        }
        break;
      }
      case 'heal_stamina': {
        const amt = item.value || 10;
        p.health = Math.min(p.maxHealth, p.health + amt);
        p.stamina = Math.min(p.maxStamina, p.stamina + amt);
        consumed = true;
        break;
      }
      case 'stamina': {
        const stamAmt = item.value || 50;
        if (p.stamina < p.maxStamina) {
          p.stamina = Math.min(p.maxStamina, p.stamina + stamAmt);
          consumed = true;
        }
        break;
      }
      case 'recharge_flashlight': {
        const charge = item.value || 20;
        p.flashlightBattery = Math.min(p.maxFlashlightBattery, p.flashlightBattery + charge);
        consumed = true;
        break;
      }
      case 'throw_distraction':
      case 'throw_loud': {
        this.throwItem(item);
        consumed = true;
        break;
      }
      case 'flare': {
        this.activateFlare();
        consumed = true;
        break;
      }
      case 'unlock_door': {
        if (this.tryLockpick()) {
          consumed = true;
        }
        break;
      }
      case 'flashlight': {
        this.toggleFlashlight();
        // Don't consume flashlight on toggle
        return;
      }
      case 'passive_sonar_module': {
        this.sonarMode = 'passive';
        consumed = true;
        break;
      }
      case 'active_sonar_module': {
        this.sonarMode = 'active';
        consumed = true;
        break;
      }
      case 'echo_amplifier': {
        this.echoAmplifierActive = true;
        // Effect lasts for the current level
        consumed = true;
        break;
      }
      case 'sound_dampener_field': {
        this.soundDampenerTimer = 30; // 30 seconds
        consumed = true;
        break;
      }
      default: {
        // Generic consumable - just consume
        if (item.category === 'consumable') {
          consumed = true;
        }
        break;
      }
    }

    if (consumed) {
      this.audio.playUseItem();

      // Noise on use
      if (item.noiseOnUse) {
        this.addSoundEvent(p.pos, item.noiseOnUse, item.rangeOnUse || 5);
      }

      // Decrease uses or count
      if (slot.uses !== undefined && slot.uses > 1) {
        slot.uses--;
      } else if (slot.count > 1) {
        slot.count--;
        slot.uses = item.uses; // Reset uses for next item in stack
      } else {
        p.inventory.splice(p.selectedSlot, 1);
      }
    }
  }

  dropSelectedItem() {
    const p = this.player;
    if (p.selectedSlot >= p.inventory.length) return;

    const slot = p.inventory[p.selectedSlot];
    if (!slot) return;

    // Drop item at player position
    this.map.items.push({
      itemId: slot.item.id,
      pos: { x: p.pos.x, y: p.pos.y },
    });

    p.inventory.splice(p.selectedSlot, 1);
    this.audio.playUseItem();
  }

  private throwItem(item: ItemDef) {
    const p = this.player;
    const range = item.rangeOnUse || 10;
    const volume = item.noiseOnUse || 0.8;

    // Calculate target position in front of player
    const targetX = p.pos.x + Math.cos(p.dir) * range;
    const targetY = p.pos.y + Math.sin(p.dir) * range;

    // Clamp to walkable area
    const clampedX = Math.max(1, Math.min(this.map.width - 2, targetX));
    const clampedY = Math.max(1, Math.min(this.map.height - 2, targetY));

    // Find nearest walkable position to target
    let soundX = clampedX;
    let soundY = clampedY;
    if (!isWalkable(this.map, clampedX, clampedY)) {
      // Search nearby
      for (let r = 0; r < 3; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (isWalkable(this.map, clampedX + dx, clampedY + dy)) {
              soundX = clampedX + dx;
              soundY = clampedY + dy;
              r = 3; dx = r + 1; dy = r + 1; // Break out
            }
          }
        }
      }
    }

    const targetPos: Vec2 = { x: soundX, y: soundY };
    this.addSoundEvent(targetPos, volume, range);
    this.audio.playThrow();

    // Illumination at impact point
    this.illuminateArea(targetPos, 4, 0.7, NEON_COLORS.item);
    this.pulses.push({
      origin: targetPos,
      radius: 6,
      startTime: performance.now(),
      duration: 400,
      intensity: 0.5,
    });
  }

  private activateFlare() {
    const p = this.player;
    const flarePos: Vec2 = {
      x: p.pos.x + Math.cos(p.dir) * 2,
      y: p.pos.y + Math.sin(p.dir) * 2,
    };

    this.flares.push({
      pos: flarePos,
      startTime: performance.now(),
      duration: 10000,
      radius: 15,
      intensity: 0.9,
    });

    this.addSoundEvent(flarePos, 1.0, 20);
    this.audio.playThrow();
  }

  private tryLockpick(): boolean {
    const p = this.player;
    // Find nearest locked door
    let nearestDoor: Door | null = null;
    let nearestDist = 2.0;

    for (const door of this.map.doors) {
      if (door.isOpen || !door.isLocked) continue;
      const dist = Math.sqrt(
        (door.x + 0.5 - p.pos.x) ** 2 + (door.y + 0.5 - p.pos.y) ** 2
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestDoor = door;
      }
    }

    if (nearestDoor) {
      nearestDoor.isLocked = false;
      nearestDoor.isOpen = true;
      this.addSoundEvent(p.pos, 0.6, 5);
      this.audio.playDoorOpen();
      return true;
    }
    return false;
  }

  private tryUseKey(): boolean {
    const p = this.player;
    // Find nearest locked door
    let nearestDoor: Door | null = null;
    let nearestDist = 2.0;

    for (const door of this.map.doors) {
      if (door.isOpen || !door.isLocked) continue;
      const dist = Math.sqrt(
        (door.x + 0.5 - p.pos.x) ** 2 + (door.y + 0.5 - p.pos.y) ** 2
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestDoor = door;
      }
    }

    if (!nearestDoor) return false;

    // Check inventory for matching key
    for (let i = 0; i < p.inventory.length; i++) {
      const slot = p.inventory[i];
      const effect = slot.item.effect || '';

      // Master key opens everything
      if (effect === 'key_master') {
        nearestDoor.isLocked = false;
        nearestDoor.isOpen = true;
        p.inventory.splice(i, 1);
        this.addSoundEvent(p.pos, 0.4, 4);
        this.audio.playDoorOpen();
        return true;
      }

      // Specific key match
      if (effect === nearestDoor.keyId) {
        nearestDoor.isLocked = false;
        nearestDoor.isOpen = true;
        p.inventory.splice(i, 1);
        this.addSoundEvent(p.pos, 0.4, 4);
        this.audio.playDoorOpen();
        return true;
      }
    }

    // No matching key
    this.audio.playDoorLocked();
    return false;
  }

  // ============================================================
  // Door interaction
  // ============================================================

  handleInteract() {
    const p = this.player;
    if (p.interactCooldown > 0) return;
    // Ear role: CANNOT interact with items/doors
    if (this.coopEnabled && this.coopRole === 'ear') return;
    p.interactCooldown = 0.3;

    // Check for nearby doors
    const checkDist = 1.8;
    let nearestDoor: Door | null = null;
    let nearestDist = checkDist;

    for (const door of this.map.doors) {
      const dist = Math.sqrt(
        (door.x + 0.5 - p.pos.x) ** 2 + (door.y + 0.5 - p.pos.y) ** 2
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestDoor = door;
      }
    }

    if (nearestDoor) {
      if (nearestDoor.isLocked) {
        // Try to use a key
        this.tryUseKey();
        return;
      }

      // Toggle door
      nearestDoor.isOpen = !nearestDoor.isOpen;
      this.addSoundEvent(p.pos, 0.6, 6);
      this.audio.playDoorOpen();

      // Illuminate the door area
      const doorPos: Vec2 = { x: nearestDoor.x + 0.5, y: nearestDoor.y + 0.5 };
      this.illuminateArea(doorPos, 2, 0.5, NEON_COLORS.door);
      return;
    }

    // No door nearby - do a soft pulse instead
    this.emitSoftPulse();
  }

  // ============================================================
  // Main game loop
  // ============================================================

  update(timestamp: number) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    // FPS counter
    this.frameCount++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = 0;
    }

    // Cinematic mode update
    if (this.cinematicMode) {
      this.cinematicTimer += dt;
      const currentFrame = this.cinematicSequence[this.cinematicIndex];
      if (currentFrame && this.cinematicTimer >= currentFrame.duration) {
        this.cinematicTimer = 0;
        this.cinematicIndex++;
        if (this.cinematicIndex >= this.cinematicSequence.length) {
          // Cinematic finished
          this.cinematicMode = false;
          this.cinematicSequence = [];
          this.cinematicIndex = 0;
          this.cinematicTimer = 0;
          this.cinematicAlpha = 0;
          if (this.cinematicCallback) {
            this.cinematicCallback();
            this.cinematicCallback = null;
          }
        }
      }
      return;
    }

    if (this.state === 'chapterIntro') {
      this.introTimer += dt;
      return;
    }

    if (this.state !== 'playing') return;

    this.updatePlayer(dt);
    this.updateFlashlight(dt);
    this.updateZones(dt);
    this.updateAmbientLight();
    this.updateEntities(dt);
    this.updatePulses();
    this.updateFlares();
    this.updateProximityIllumination();
    this.cleanIllumination();
    this.updateDanger();
    this.updateAnimations(dt);
    this.handleItemPickup();
    this.checkWinCondition();

    // Co-op: Body role ping illumination
    if (this.coopEnabled && this.coopRole === 'body') {
      this.updatePingIllumination();
    }

    // Hardcore: static interference and audio
    if (this.hardcoreMode) {
      this.updateHardcoreEffects(dt);
    }

    // Sound dampener field timer
    if (this.soundDampenerTimer > 0) {
      this.soundDampenerTimer -= dt;
    }

    // Cooldowns
    if (this.pulseCooldownTimer > 0) {
      this.pulseCooldownTimer -= dt * 1000;
    }

    if (this.player.interactCooldown > 0) {
      this.player.interactCooldown -= dt;
    }

    // Screen shake decay
    if (this.shakeDecay > 0) {
      this.shakeDecay -= dt * 1000;
      this.shakeX *= 0.9;
      this.shakeY *= 0.9;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // Clean old sound events
    const now = performance.now();
    this.soundEvents = this.soundEvents.filter(s => now - s.time < 5000);
  }

  // ============================================================
  // Player update
  // ============================================================

  private updatePlayer(dt: number) {
    const p = this.player;
    p.isMoving = false;
    p.isSneaking = this.isActionDown('sneak') || this.isCrouching || this.touchSneak;

    // Crouch reduces echolocation range by 40%
    if (p.isSneaking) {
      this.passiveSonarRevealRadius = 1.5;
      this.passiveEntityRevealRadius = 2.5;
    } else {
      this.passiveSonarRevealRadius = 2.5;
      this.passiveEntityRevealRadius = 4;
    }

    // Ear role: CANNOT move, CAN rotate only
    if (this.coopEnabled && this.coopRole === 'ear') {
      // Allow rotation via mouse/touch
      if (this.touchLookDelta !== 0) {
        const sens = this.advanced.mouseSensitivity * 0.001;
        p.dir += this.touchLookDelta * sens;
        this.touchLookDelta = 0;
      }
      // Ear role: emit infinite silent echolocation pulses
      this.earEcholocationUpdate();
      // Ping marker illumination
      this.updatePingIllumination();
      return;
    }

    const speed = p.isSneaking ? this.diffConfig.sneakSpeed : this.diffConfig.playerSpeed;

    // Apply touch look delta
    if (this.touchLookDelta !== 0) {
      const sens = this.advanced.mouseSensitivity * 0.001;
      p.dir += this.touchLookDelta * sens;
      this.touchLookDelta = 0;
    }

    // White noise zone: wobbly rotation
    if (this.isInWhiteNoiseZone) {
      p.dir += (Math.random() - 0.5) * 0.05;
    }

    let moveX = 0;
    let moveY = 0;

    // White noise zone: speed reduction
    let effectiveSpeed = speed;
    if (this.isInWhiteNoiseZone) {
      effectiveSpeed = speed * 0.5;
    }

    // Keyboard movement
    if (this.isActionDown('moveForward')) {
      moveX += Math.cos(p.dir) * effectiveSpeed * dt;
      moveY += Math.sin(p.dir) * effectiveSpeed * dt;
      p.isMoving = true;
    }
    if (this.isActionDown('moveBack')) {
      moveX -= Math.cos(p.dir) * effectiveSpeed * dt;
      moveY -= Math.sin(p.dir) * effectiveSpeed * dt;
      p.isMoving = true;
    }
    if (this.isActionDown('moveLeft')) {
      moveX += Math.cos(p.dir - Math.PI / 2) * effectiveSpeed * dt;
      moveY += Math.sin(p.dir - Math.PI / 2) * effectiveSpeed * dt;
      p.isMoving = true;
    }
    if (this.isActionDown('moveRight')) {
      moveX -= Math.cos(p.dir - Math.PI / 2) * effectiveSpeed * dt;
      moveY -= Math.sin(p.dir - Math.PI / 2) * effectiveSpeed * dt;
      p.isMoving = true;
    }

    // Touch joystick movement (additive with keyboard)
    if (this.touchMoveX !== 0 || this.touchMoveY !== 0) {
      // touchMoveY > 0 = forward, touchMoveX > 0 = strafe right
      const touchForward = this.touchMoveY;
      const touchStrafe = this.touchMoveX;
      moveX += Math.cos(p.dir) * touchForward * effectiveSpeed * dt;
      moveY += Math.sin(p.dir) * touchForward * effectiveSpeed * dt;
      moveX += Math.cos(p.dir - Math.PI / 2) * touchStrafe * effectiveSpeed * dt;
      moveY += Math.sin(p.dir - Math.PI / 2) * touchStrafe * effectiveSpeed * dt;
      p.isMoving = true;
    }

    const margin = 0.2;
    const newX = p.pos.x + moveX;
    const newY = p.pos.y + moveY;

    let bumped = false;

    // Try X movement
    if (
      isWalkable(this.map, newX, p.pos.y) &&
      isWalkable(this.map, newX + margin * Math.sign(moveX), p.pos.y + margin) &&
      isWalkable(this.map, newX + margin * Math.sign(moveX), p.pos.y - margin)
    ) {
      p.pos.x = newX;
    } else if (Math.abs(moveX) > 0.001) {
      bumped = true;
    }

    // Try Y movement
    if (
      isWalkable(this.map, p.pos.x, newY) &&
      isWalkable(this.map, p.pos.x + margin, newY + margin * Math.sign(moveY)) &&
      isWalkable(this.map, p.pos.x - margin, newY + margin * Math.sign(moveY))
    ) {
      p.pos.y = newY;
    } else if (Math.abs(moveY) > 0.001) {
      bumped = true;
    }

    // Wall bump effects
    if (bumped && !p.isSneaking) {
      this.audio.playBump();
      this.addSoundEvent(p.pos, 0.15, 2);
      this.illuminateArea(p.pos, 2, 0.3, NEON_COLORS.wallSide);
    }

    // Footsteps
    if (p.isMoving) {
      const now = performance.now();
      const footstepInterval = p.isSneaking ? 700 : 400;
      if (now - p.lastFootstepTime > footstepInterval) {
        p.lastFootstepTime = now;
        // Silent zone: no footstep sounds at all
        if (!this.isInSilentZone) {
          this.audio.playFootstep(p.isSneaking);
        }

        const radius = p.isSneaking ? this.diffConfig.footstepRadius * 0.25 : this.diffConfig.footstepRadius;
        const volume = p.isSneaking ? 0.2 : 0.5;
        if (!this.isInSilentZone) {
          this.addSoundEvent(p.pos, volume, radius);
        }

        // Footstep echolocation (suppressed in silent zone)
        if (!this.isInSilentZone) {
          const footIllum = p.isSneaking ? 0.12 : 0.25;
          const footRadius = p.isSneaking ? 1.5 : this.advanced.footstepVisualRange;
          this.illuminateArea(p.pos, footRadius, footIllum, '#004d40');

          this.pulses.push({
            origin: { ...p.pos },
            radius: footRadius,
            startTime: now,
            duration: 200,
            intensity: footIllum,
          });
        }
      }
    }

    // Stamina regeneration
    if (!p.isMoving) {
      p.stamina = Math.min(p.maxStamina, p.stamina + dt * 15);
    } else if (p.isSneaking) {
      p.stamina = Math.min(p.maxStamina, p.stamina + dt * 5);
    } else {
      p.stamina = Math.max(0, p.stamina - dt * 3);
    }

    p.noiseLevel = p.isMoving ? (p.isSneaking ? 0.2 : 0.5) : 0;
    if (p.flashlightOn) p.noiseLevel += 0.1;

    // Sound dampener field reduces all noise
    if (this.soundDampenerTimer > 0) {
      p.noiseLevel *= 0.1;
    }

    // White noise zone: force max noise level
    if (this.isInWhiteNoiseZone) {
      p.noiseLevel = 1.0;
    }

    // Passive sonar: constant subtle illumination around the player
    if (this.sonarMode === 'passive') {
      this.illuminateArea(this.player.pos, this.passiveSonarRevealRadius, 0.15, NEON_COLORS.wallSide);
    }
  }

  // ============================================================
  // Entity AI
  // ============================================================

  private updateEntities(dt: number) {
    const now = performance.now();

    for (const entity of this.entities) {
      entity.animPhase += dt * 3;
      entity.stateTimer -= dt;
      entity.teleportCooldown = Math.max(0, entity.teleportCooldown - dt);

      // Find best audible sound
      let bestSound: { pos: Vec2; volume: number } | null = null;
      let bestVolume = 0;

      for (const sound of this.soundEvents) {
        const dist = this.dist(entity.pos, sound.pos);
        const maxRange = Math.min(sound.radius, entity.hearingRange);
        if (dist < maxRange) {
          const effectiveVolume = sound.volume * (1 - dist / maxRange);
          if (effectiveVolume > bestVolume) {
            bestVolume = effectiveVolume;
            bestSound = { pos: sound.pos, volume: effectiveVolume };
          }
        }
      }

      const playerDist = this.dist(entity.pos, this.player.pos);

      // Type-specific AI
      switch (entity.type) {
        case 'stalker':
          this.updateStalkerAI(entity, dt, bestSound, bestVolume, playerDist, now);
          break;
        case 'hunter':
          this.updateHunterAI(entity, dt, bestSound, bestVolume, playerDist, now);
          break;
        case 'phantom':
          this.updatePhantomAI(entity, dt, bestSound, bestVolume, playerDist, now);
          break;
      }

      // Proximity detection - entity "feels" player
      if (playerDist < 1.5 && entity.state !== 'chase') {
        entity.state = 'chase';
        entity.stateTimer = 6;
      }

      // Kill check
      if (playerDist < this.diffConfig.killDistance) {
        entity.killTimer += dt;
        if (entity.killTimer > 0.4) {
          this.playerDeath();
          return;
        }
      } else {
        entity.killTimer = Math.max(0, entity.killTimer - dt * 2);
      }

      // Entity sounds
      if (playerDist < 8 && Math.random() < 0.004) {
        this.audio.playEntityGrowl(playerDist, entity.type);
      }

      // Entity movement sound during chase
      if (entity.state === 'chase' && Math.random() < 0.01) {
        this.addSoundEvent(entity.pos, 0.2, 3);
      }

      // Passive sonar: entities near the player create faint illumination (you can "hear" them breathing)
      if (this.sonarMode === 'passive' && playerDist < this.passiveEntityRevealRadius) {
        const revealIntensity = 0.25 * (1 - playerDist / this.passiveEntityRevealRadius);
        const entityColor = entity.type === 'stalker' ? NEON_COLORS.stalkerGlow
          : entity.type === 'hunter' ? NEON_COLORS.hunterGlow
          : NEON_COLORS.phantomGlow;
        this.illuminateArea(entity.pos, 1.5, revealIntensity, entityColor);
      }
    }
  }

  // ---- Stalker AI: slow, persistent, hears everything ----
  private updateStalkerAI(
    entity: Entity, dt: number,
    bestSound: { pos: Vec2; volume: number } | null, bestVolume: number,
    playerDist: number, now: number
  ) {
    const template = ENEMY_TEMPLATES.stalker;
    const chaseSpeed = template.chaseSpeed * (this.diffConfig.entityChaseSpeed / 2.8);
    const baseSpeed = entity.speed * 0.4;

    switch (entity.state) {
      case 'patrol': {
        // Stalker investigates even faint sounds
        if (bestSound && bestVolume > 0.05) {
          entity.state = 'investigate';
          entity.lastHeardSound = bestSound.pos;
          entity.lastHeardTime = now;
          entity.stateTimer = 15; // Persistent investigation
          break;
        }

        if (entity.stateTimer <= 0) {
          entity.patrolAngle += (Math.random() - 0.5) * Math.PI * 1.5;
          entity.stateTimer = 2 + Math.random() * 4;
        }

        this.moveEntity(entity, entity.patrolAngle, baseSpeed, dt);

        const nextX = entity.pos.x + Math.cos(entity.patrolAngle) * 0.5;
        const nextY = entity.pos.y + Math.sin(entity.patrolAngle) * 0.5;
        if (!isWalkable(this.map, nextX, nextY)) {
          entity.patrolAngle += Math.PI * 0.6 + Math.random() * Math.PI * 0.8;
        }
        break;
      }

      case 'investigate': {
        // Very persistent - keeps investigating
        if (bestSound && bestVolume > 0.08) {
          entity.lastHeardSound = bestSound.pos;
          entity.lastHeardTime = now;
          entity.stateTimer = 15;
        }

        if (playerDist < 4 && this.player.noiseLevel > 0.2) {
          entity.state = 'chase';
          entity.persistenceTimer = 12; // Very long chase persistence
          entity.stateTimer = 12;
          break;
        }

        if (entity.lastHeardSound) {
          const soundDist = this.dist(entity.pos, entity.lastHeardSound);
          if (soundDist < 0.8) {
            entity.state = 'search';
            entity.stateTimer = 6 + Math.random() * 4;
            entity.patrolAngle = Math.random() * Math.PI * 2;
          } else {
            const angle = Math.atan2(
              entity.lastHeardSound.y - entity.pos.y,
              entity.lastHeardSound.x - entity.pos.x
            );
            this.moveEntity(entity, angle, entity.speed * 0.6, dt);
          }
        }

        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 3;
        }
        break;
      }

      case 'search': {
        entity.patrolAngle += dt * 1.2;
        this.moveEntity(entity, entity.patrolAngle, baseSpeed * 0.5, dt);

        if (bestSound && bestVolume > 0.1) {
          entity.state = 'investigate';
          entity.lastHeardSound = bestSound.pos;
          entity.lastHeardTime = now;
          entity.stateTimer = 15;
          break;
        }

        if (playerDist < 2.5) {
          entity.state = 'chase';
          entity.persistenceTimer = 12;
          entity.stateTimer = 12;
          break;
        }

        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 2;
        }
        break;
      }

      case 'chase': {
        const playerAngle = Math.atan2(
          this.player.pos.y - entity.pos.y,
          this.player.pos.x - entity.pos.x
        );
        this.moveEntity(entity, playerAngle, chaseSpeed, dt);

        // Stalker is very persistent
        if (playerDist < 6) {
          entity.stateTimer = Math.max(entity.stateTimer, 8);
          entity.persistenceTimer = 12;
        }

        entity.persistenceTimer -= dt;
        if (entity.stateTimer <= 0 && entity.persistenceTimer <= 0) {
          entity.state = 'investigate';
          entity.lastHeardSound = { ...this.player.pos };
          entity.stateTimer = 8;
        }
        break;
      }

      case 'idle': {
        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 3;
        }
        break;
      }
    }
  }

  // ---- Hunter AI: fast, rushes to sounds, short attention ----
  private updateHunterAI(
    entity: Entity, dt: number,
    bestSound: { pos: Vec2; volume: number } | null, bestVolume: number,
    playerDist: number, now: number
  ) {
    const template = ENEMY_TEMPLATES.hunter;
    const chaseSpeed = template.chaseSpeed * (this.diffConfig.entityChaseSpeed / 2.8);
    const baseSpeed = entity.speed * 0.7; // Fast patrol

    switch (entity.state) {
      case 'patrol': {
        // Hunter only investigates moderate-loud sounds
        if (bestSound && bestVolume > 0.15) {
          entity.state = 'investigate';
          entity.lastHeardSound = bestSound.pos;
          entity.lastHeardTime = now;
          entity.stateTimer = 5; // Short investigation
          entity.rushTimer = 3; // Rush timer
          break;
        }

        if (entity.stateTimer <= 0) {
          entity.patrolAngle += (Math.random() - 0.5) * Math.PI * 2;
          entity.stateTimer = 1.5 + Math.random() * 3;
        }

        this.moveEntity(entity, entity.patrolAngle, baseSpeed, dt);

        const nextX = entity.pos.x + Math.cos(entity.patrolAngle) * 0.5;
        const nextY = entity.pos.y + Math.sin(entity.patrolAngle) * 0.5;
        if (!isWalkable(this.map, nextX, nextY)) {
          entity.patrolAngle += Math.PI * 0.8 + Math.random() * Math.PI;
        }
        break;
      }

      case 'investigate': {
        // Rush to sound quickly
        entity.rushTimer -= dt;

        if (bestSound && bestVolume > 0.2) {
          entity.lastHeardSound = bestSound.pos;
          entity.lastHeardTime = now;
          entity.stateTimer = 5;
          entity.rushTimer = 3;
        }

        if (playerDist < 5 && this.player.noiseLevel > 0.3) {
          entity.state = 'chase';
          entity.stateTimer = 4; // Short chase
          break;
        }

        if (entity.lastHeardSound) {
          const soundDist = this.dist(entity.pos, entity.lastHeardSound);
          if (soundDist < 1.0) {
            entity.state = 'search';
            entity.stateTimer = 2 + Math.random() * 2; // Brief search
            entity.patrolAngle = Math.random() * Math.PI * 2;
          } else {
            // Rush toward sound
            const angle = Math.atan2(
              entity.lastHeardSound.y - entity.pos.y,
              entity.lastHeardSound.x - entity.pos.x
            );
            const rushSpeed = entity.rushTimer > 0 ? entity.speed * 1.2 : entity.speed * 0.8;
            this.moveEntity(entity, angle, rushSpeed, dt);
          }
        }

        // Short attention span
        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 1.5;
        }
        break;
      }

      case 'search': {
        entity.patrolAngle += dt * 2;
        this.moveEntity(entity, entity.patrolAngle, baseSpeed * 0.4, dt);

        if (bestSound && bestVolume > 0.2) {
          entity.state = 'investigate';
          entity.lastHeardSound = bestSound.pos;
          entity.stateTimer = 5;
          entity.rushTimer = 3;
          break;
        }

        if (playerDist < 2) {
          entity.state = 'chase';
          entity.stateTimer = 4;
          break;
        }

        // Quickly gives up
        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 1;
        }
        break;
      }

      case 'chase': {
        const playerAngle = Math.atan2(
          this.player.pos.y - entity.pos.y,
          this.player.pos.x - entity.pos.x
        );
        this.moveEntity(entity, playerAngle, chaseSpeed, dt);

        // Short attention - only keeps chasing if player is close or noisy
        if (playerDist < 4 && this.player.noiseLevel > 0.3) {
          entity.stateTimer = Math.max(entity.stateTimer, 3);
        }

        // Quickly loses interest
        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 1;
        }
        break;
      }

      case 'idle': {
        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 1;
        }
        break;
      }
    }
  }

  // ---- Phantom AI: teleports near loud sounds, huge hearing range ----
  private updatePhantomAI(
    entity: Entity, dt: number,
    bestSound: { pos: Vec2; volume: number } | null, bestVolume: number,
    playerDist: number, now: number
  ) {
    const template = ENEMY_TEMPLATES.phantom;
    const chaseSpeed = template.chaseSpeed * (this.diffConfig.entityChaseSpeed / 2.8);

    // Handle teleporting state
    if (entity.isTeleporting) {
      entity.teleportTimer -= dt;
      if (entity.teleportTimer <= 0) {
        entity.isTeleporting = false;
        entity.state = 'search';
        entity.stateTimer = 3 + Math.random() * 3;
      }
      return;
    }

    switch (entity.state) {
      case 'patrol': {
        // Phantom has huge hearing range - detects even quiet sounds
        if (bestSound && bestVolume > 0.08 && entity.teleportCooldown <= 0) {
          // Teleport near the sound instead of walking
          this.phantomTeleport(entity, bestSound.pos);
          return;
        }

        // Also investigate normally if teleport is on cooldown
        if (bestSound && bestVolume > 0.15) {
          entity.state = 'investigate';
          entity.lastHeardSound = bestSound.pos;
          entity.lastHeardTime = now;
          entity.stateTimer = 6;
          break;
        }

        if (entity.stateTimer <= 0) {
          entity.patrolAngle += (Math.random() - 0.5) * Math.PI;
          entity.stateTimer = 3 + Math.random() * 5;
        }

        this.moveEntity(entity, entity.patrolAngle, entity.speed * 0.3, dt);

        const nextX = entity.pos.x + Math.cos(entity.patrolAngle) * 0.5;
        const nextY = entity.pos.y + Math.sin(entity.patrolAngle) * 0.5;
        if (!isWalkable(this.map, nextX, nextY)) {
          entity.patrolAngle += Math.PI * 0.5 + Math.random() * Math.PI;
        }
        break;
      }

      case 'investigate': {
        if (bestSound && bestVolume > 0.2 && entity.teleportCooldown <= 0) {
          this.phantomTeleport(entity, bestSound.pos);
          return;
        }

        if (playerDist < 3 && this.player.noiseLevel > 0.3) {
          entity.state = 'chase';
          entity.stateTimer = 5;
          break;
        }

        if (entity.lastHeardSound) {
          const soundDist = this.dist(entity.pos, entity.lastHeardSound);
          if (soundDist < 1.0) {
            entity.state = 'search';
            entity.stateTimer = 3 + Math.random() * 2;
            entity.patrolAngle = Math.random() * Math.PI * 2;
          } else {
            const angle = Math.atan2(
              entity.lastHeardSound.y - entity.pos.y,
              entity.lastHeardSound.x - entity.pos.x
            );
            this.moveEntity(entity, angle, entity.speed * 0.5, dt);
          }
        }

        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 3;
        }
        break;
      }

      case 'search': {
        entity.patrolAngle += dt * 1.5;
        this.moveEntity(entity, entity.patrolAngle, entity.speed * 0.3, dt);

        if (bestSound && bestVolume > 0.15 && entity.teleportCooldown <= 0) {
          this.phantomTeleport(entity, bestSound.pos);
          return;
        }

        if (playerDist < 2) {
          entity.state = 'chase';
          entity.stateTimer = 5;
          break;
        }

        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 3;
        }
        break;
      }

      case 'chase': {
        const playerAngle = Math.atan2(
          this.player.pos.y - entity.pos.y,
          this.player.pos.x - entity.pos.x
        );
        this.moveEntity(entity, playerAngle, chaseSpeed, dt);

        if (playerDist < 5) {
          entity.stateTimer = Math.max(entity.stateTimer, 4);
        }

        if (entity.stateTimer <= 0) {
          // Phantom disappears - teleport away
          entity.state = 'idle';
          entity.stateTimer = 3 + Math.random() * 4;
          // Move to a random position far from player
          const farSpawns = findEntitySpawnPositions(this.map, 1, this.player.pos, 10);
          if (farSpawns.length > 0) {
            entity.pos = { ...farSpawns[0] };
          }
        }
        break;
      }

      case 'idle': {
        // Phantom is invisible and still
        if (entity.stateTimer <= 0) {
          entity.state = 'patrol';
          entity.stateTimer = 3;
        }
        break;
      }

      case 'teleport': {
        // Handled above with isTeleporting flag
        entity.teleportTimer -= dt;
        if (entity.teleportTimer <= 0) {
          entity.isTeleporting = false;
          entity.state = 'search';
          entity.stateTimer = 3;
        }
        break;
      }
    }
  }

  private phantomTeleport(entity: Entity, targetPos: Vec2) {
    // Find a walkable position near the target sound
    const offset = 3 + Math.random() * 2;
    const angle = Math.random() * Math.PI * 2;
    let newX = targetPos.x + Math.cos(angle) * offset;
    let newY = targetPos.y + Math.sin(angle) * offset;

    // Clamp to map bounds
    newX = Math.max(1, Math.min(this.map.width - 2, newX));
    newY = Math.max(1, Math.min(this.map.height - 2, newY));

    // Find nearest walkable position
    if (!isWalkable(this.map, newX, newY)) {
      let found = false;
      for (let r = 1; r <= 3 && !found; r++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            if (isWalkable(this.map, newX + dx, newY + dy)) {
              newX = newX + dx;
              newY = newY + dy;
              found = true;
            }
          }
        }
      }
      if (!found) return; // Can't teleport, skip
    }

    // Don't teleport too close to player
    const distToPlayer = Math.sqrt(
      (newX - this.player.pos.x) ** 2 + (newY - this.player.pos.y) ** 2
    );
    if (distToPlayer < 3) return;

    entity.pos = { x: newX, y: newY };
    entity.state = 'teleport';
    entity.isTeleporting = true;
    entity.teleportTimer = 1.0; // Brief stun after teleport
    entity.teleportCooldown = 8 + Math.random() * 4; // Cooldown before next teleport
    entity.stateTimer = 1.0;

    // Teleport sound
    this.addSoundEvent(entity.pos, 0.3, 5);
  }

  // ============================================================
  // Zone updates
  // ============================================================

  private updateZones(dt: number) {
    const p = this.player;

    // Check if player is in a silent zone
    const wasInSilentZone = this.isInSilentZone;
    this.isInSilentZone = isInZone(p.pos, this.map.silentZones);

    // Check if player is in a white noise zone
    const wasInWhiteNoiseZone = this.isInWhiteNoiseZone;
    this.isInWhiteNoiseZone = isInZone(p.pos, this.map.whiteNoiseZones);

    // White noise zone: constant illumination every frame
    if (this.isInWhiteNoiseZone) {
      for (const zone of this.map.whiteNoiseZones) {
        const center: Vec2 = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
        const radius = Math.max(zone.w, zone.h);
        this.illuminateArea(center, radius, 1.0, NEON_COLORS.whiteNoiseZone);
      }
    }

    // Silent zone: suppress illumination in silent zone areas
    if (this.isInSilentZone) {
      // Remove illumination for walls inside silent zones
      for (const zone of this.map.silentZones) {
        const minX = Math.max(0, Math.floor(zone.x));
        const maxX = Math.min(this.map.width - 1, Math.ceil(zone.x + zone.w));
        const minY = Math.max(0, Math.floor(zone.y));
        const maxY = Math.min(this.map.height - 1, Math.ceil(zone.y + zone.h));
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            for (let side = 0; side < 2; side++) {
              const key = wallKey(x, y, side);
              const illum = this.illumination.get(key);
              if (illum && this.getCurrentIntensity(illum) > 0) {
                // Suppress illumination in silent zone
                this.illumination.delete(key);
              }
            }
          }
        }
      }
    }

    // Lore timer update
    if (this.loreTimer > 0) {
      this.loreTimer -= dt;
      this.loreTypewriterTimer += dt;
      if (this.loreTypewriterTimer > 0.03 && this.pendingLore) {
        this.loreTypewriterTimer = 0;
        if (this.loreCharIndex < this.pendingLore.length) {
          this.loreCharIndex++;
        }
      }
      if (this.loreTimer <= 0) {
        this.pendingLore = null;
        this.loreTimer = 0;
        this.loreCharIndex = 0;
      }
    }
  }

  // ---- Show lore fragment ----
  showLoreFragment(text: string) {
    this.pendingLore = text;
    this.loreTimer = 5;
    this.loreCharIndex = 0;
    this.loreTypewriterTimer = 0;
  }

  // ---- Passive sonar pulse ----
  emitPassiveSonarPulse() {
    const now = performance.now();
    this.pulses.push({
      origin: { ...this.player.pos },
      radius: 8,
      startTime: now,
      duration: PULSE_ANIM_DURATION,
      intensity: 0.4,
    });
    // No sound event - silent
    this.illuminateArea(this.player.pos, 8, 0.4, NEON_COLORS.wall);
  }

  // ---- Active sonar pulse ----
  emitActiveSonarPulse() {
    const now = performance.now();
    this.pulses.push({
      origin: { ...this.player.pos },
      radius: 25,
      startTime: now,
      duration: PULSE_ANIM_DURATION,
      intensity: 1.2,
    });
    // VERY LOUD sound event
    this.addSoundEvent(this.player.pos, 1.5, 25);
    this.audio.playPulse(true);
    this.audio.resume();
    this.illuminateArea(this.player.pos, 25, 1.2, NEON_COLORS.wall);
    // Screen shake
    this.shakeX = (Math.random() - 0.5) * 20;
    this.shakeY = (Math.random() - 0.5) * 20;
    this.shakeDecay = 600;
  }

  private moveEntity(entity: Entity, angle: number, speed: number, dt: number) {
    const moveX = Math.cos(angle) * speed * dt;
    const moveY = Math.sin(angle) * speed * dt;
    const newX = entity.pos.x + moveX;
    const newY = entity.pos.y + moveY;
    const margin = 0.25;

    if (
      isWalkable(this.map, newX, entity.pos.y) &&
      isWalkable(this.map, newX + margin * Math.sign(moveX), entity.pos.y)
    ) {
      entity.pos.x = newX;
    }
    if (
      isWalkable(this.map, entity.pos.x, newY) &&
      isWalkable(this.map, entity.pos.x, newY + margin * Math.sign(moveY))
    ) {
      entity.pos.y = newY;
    }
  }

  // ============================================================
  // Illumination updates
  // ============================================================

  private updatePulses() {
    const now = performance.now();
    this.pulses = this.pulses.filter(p => now - p.startTime < p.duration + FADE_DURATION);

    for (const pulse of this.pulses) {
      const elapsed = now - pulse.startTime;
      if (elapsed > pulse.duration) continue;

      const progress = elapsed / pulse.duration;
      const currentRadius = pulse.radius * progress;
      const waveWidth = 3.0;

      this.illuminateRing(pulse.origin, currentRadius, waveWidth, pulse.intensity * (1 - progress * 0.3));
    }
  }

  private updateFlares() {
    const now = performance.now();
    this.flares = this.flares.filter(f => now - f.startTime < f.duration);

    for (const flare of this.flares) {
      const elapsed = now - flare.startTime;
      const remaining = 1 - elapsed / flare.duration;
      const flickerIntensity = flare.intensity * remaining * (0.8 + Math.random() * 0.2);
      this.illuminateArea(flare.pos, flare.radius, flickerIntensity, NEON_COLORS.item);
    }
  }

  private illuminateRing(origin: Vec2, radius: number, width: number, intensity: number) {
    const minDist = Math.max(0, radius - width);
    const maxDist = radius + width;

    const minX = Math.max(0, Math.floor(origin.x - maxDist - 1));
    const maxX = Math.min(this.map.width - 1, Math.ceil(origin.x + maxDist + 1));
    const minY = Math.max(0, Math.floor(origin.y - maxDist - 1));
    const maxY = Math.min(this.map.height - 1, Math.ceil(origin.y + maxDist + 1));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cell = this.map.cells[y][x];
        if (cell !== 1 && cell !== 2 && cell !== 3) continue;

        const cx = x + 0.5;
        const cy = y + 0.5;
        const dist = Math.sqrt((cx - origin.x) ** 2 + (cy - origin.y) ** 2);

        if (dist >= minDist && dist <= maxDist) {
          const waveDist = Math.abs(dist - radius);
          const waveIntensity = intensity * (1 - waveDist / width);

          for (let side = 0; side < 2; side++) {
            const key = wallKey(x, y, side);
            let color: string;
            if (cell === 2) {
              color = NEON_COLORS.exit;
            } else if (cell === 3) {
              const door = this.map.doors.find(d => d.x === x && d.y === y);
              color = door && door.isLocked ? NEON_COLORS.door : NEON_COLORS.doorOpen;
            } else {
              color = side === 0 ? NEON_COLORS.wall : NEON_COLORS.wallSide;
            }
            this.setIllumination(key, waveIntensity, color);
          }
        }
      }
    }
  }

  private illuminateArea(pos: Vec2, radius: number, intensity: number, color: string) {
    // Apply echo acoustic: illumination travels 30% further in echo zones
    let effectiveRadius = radius;
    const centerAcoustic = this.getAcousticAt(Math.floor(pos.x), Math.floor(pos.y));
    if (centerAcoustic === 'echo') {
      effectiveRadius = radius * 1.3;
    }

    const minX = Math.max(0, Math.floor(pos.x - effectiveRadius));
    const maxX = Math.min(this.map.width - 1, Math.ceil(pos.x + effectiveRadius));
    const minY = Math.max(0, Math.floor(pos.y - effectiveRadius));
    const maxY = Math.min(this.map.height - 1, Math.ceil(pos.y + effectiveRadius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cell = this.map.cells[y][x];
        if (cell !== 1 && cell !== 2 && cell !== 3) continue;
        const dist = Math.sqrt((x + 0.5 - pos.x) ** 2 + (y + 0.5 - pos.y) ** 2);
        if (dist <= effectiveRadius) {
          const distFade = 1 - dist / effectiveRadius;
          for (let side = 0; side < 2; side++) {
            const key = wallKey(x, y, side);
            this.setIllumination(key, intensity * distFade, color);
          }

          // Reflect acoustic: illumination at this wall also slightly illuminates neighboring walls
          const acoustic = this.getAcousticAt(x, y);
          if (acoustic === 'reflect' || (this.customAcousticProfile && this.customAcousticProfile.globalReflection > 0.3)) {
            const bounceIntensity = (acoustic === 'reflect' ? 0.3 : this.customAcousticProfile!.globalReflection * 0.2) * intensity * distFade;
            if (bounceIntensity > 0.01) {
              // Illuminate neighboring walls within 2 units
              for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx < 0 || nx >= this.map.width || ny < 0 || ny >= this.map.height) continue;
                  const nCell = this.map.cells[ny][nx];
                  if (nCell !== 1 && nCell !== 2 && nCell !== 3) continue;
                  const bounceFade = 1 - Math.sqrt(dx * dx + dy * dy) / 3;
                  if (bounceFade <= 0) continue;
                  for (let side = 0; side < 2; side++) {
                    const nKey = wallKey(nx, ny, side);
                    this.setIllumination(nKey, bounceIntensity * bounceFade, '#ffd600');
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // ---- Ambient light: always a faint glow around the player ----
  private updateAmbientLight() {
    const p = this.player;
    const radius = AMBIENT_LIGHT_RADIUS;
    const intensity = AMBIENT_LIGHT_INTENSITY;
    const minX = Math.max(0, Math.floor(p.pos.x - radius));
    const maxX = Math.min(this.map.width - 1, Math.ceil(p.pos.x + radius));
    const minY = Math.max(0, Math.floor(p.pos.y - radius));
    const maxY = Math.min(this.map.height - 1, Math.ceil(p.pos.y + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cell = this.map.cells[y][x];
        if (cell !== 1 && cell !== 2 && cell !== 3) continue;
        const dist = Math.sqrt((x + 0.5 - p.pos.x) ** 2 + (y + 0.5 - p.pos.y) ** 2);
        if (dist <= radius) {
          const distFade = 1 - dist / radius;
          const ambIntensity = intensity * distFade;
          for (let side = 0; side < 2; side++) {
            const key = wallKey(x, y, side);
            let color: string;
            if (cell === 2) color = NEON_COLORS.exit;
            else if (cell === 3) color = NEON_COLORS.door;
            else color = side === 0 ? NEON_COLORS.wall : NEON_COLORS.wallSide;
            this.setIllumination(key, ambIntensity, color);
          }
        }
      }
    }
  }

  private updateProximityIllumination() {
    const p = this.player;
    const proxRadius = 1.2;
    const minX = Math.max(0, Math.floor(p.pos.x - proxRadius));
    const maxX = Math.min(this.map.width - 1, Math.ceil(p.pos.x + proxRadius));
    const minY = Math.max(0, Math.floor(p.pos.y - proxRadius));
    const maxY = Math.min(this.map.height - 1, Math.ceil(p.pos.y + proxRadius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cell = this.map.cells[y][x];
        if (cell !== 1 && cell !== 2 && cell !== 3) continue;
        const dist = Math.sqrt((x + 0.5 - p.pos.x) ** 2 + (y + 0.5 - p.pos.y) ** 2);
        if (dist <= proxRadius) {
          const proxIntensity = 0.12 * (1 - dist / proxRadius);
          for (let side = 0; side < 2; side++) {
            const key = wallKey(x, y, side);
            let color: string;
            if (cell === 2) color = NEON_COLORS.exit;
            else if (cell === 3) color = NEON_COLORS.door;
            else color = side === 0 ? NEON_COLORS.wall : NEON_COLORS.wallSide;
            this.setIllumination(key, proxIntensity, color);
          }
        }
      }
    }
  }

  private cleanIllumination() {
    const fadeDuration = this.advanced.pulseFadeDuration;
    const now = performance.now();
    const keysToDelete: string[] = [];

    this.illumination.forEach((illum, key) => {
      if (now - illum.timestamp > fadeDuration) {
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      this.illumination.delete(key);
    }
  }

  // ============================================================
  // Danger and animations
  // ============================================================

  private updateDanger() {
    this.closestEntityDist = Infinity;
    for (const entity of this.entities) {
      if (entity.state === 'idle' || entity.isTeleporting) continue;
      const dist = this.dist(entity.pos, this.player.pos);
      if (dist < this.closestEntityDist) {
        this.closestEntityDist = dist;
      }
    }

    const dangerLevel = Math.max(0, 1 - this.closestEntityDist / 15);
    this.audio.updateHeartbeat(dangerLevel);
    this.audio.updateAmbient(dangerLevel);

    if (this.closestEntityDist < 5) {
      this.glitchIntensity = Math.min(1, (5 - this.closestEntityDist) / 5);
    } else {
      this.glitchIntensity *= 0.93;
    }
  }

  private updateAnimations(dt: number) {
    this.breathPhase += dt * 1.5;
    this.staticPhase += dt * 10;
  }

  // ============================================================
  // Hardcore mode effects
  // ============================================================

  private updateHardcoreEffects(dt: number) {
    // Static interference: random brief noise overlay
    this.hardcoreStaticTimer -= dt;
    if (this.hardcoreStaticTimer <= 0) {
      // Random interval between 8-25 seconds
      this.hardcoreStaticTimer = 8 + Math.random() * 17;
      // Brief glitch
      this.glitchIntensity = Math.min(1, this.glitchIntensity + 0.3);
      this.shakeX = (Math.random() - 0.5) * 3;
      this.shakeY = (Math.random() - 0.5) * 3;
      this.shakeDecay = 200;
    }
  }

  /** Play audio with binaural 3D simulation for hardcore mode */
  playAudioBinaural(frequency: number, duration: number, sourcePos?: Vec2) {
    if (!this.hardcoreAudioEnabled || !this.audio.ctx || !this.audio.masterGain) return;

    const ctx = this.audio.ctx;
    const now = ctx.currentTime;
    const p = this.player;

    // Calculate direction from player to sound source
    let pan = 0; // -1 (left) to +1 (right)
    let volumeMult = 1;
    let freqShift = 0;

    if (sourcePos) {
      const dx = sourcePos.x - p.pos.x;
      const dy = sourcePos.y - p.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleToSource = Math.atan2(dy, dx) - p.dir;

      // Normalize angle
      let normAngle = angleToSource;
      while (normAngle > Math.PI) normAngle -= 2 * Math.PI;
      while (normAngle < -Math.PI) normAngle += 2 * Math.PI;

      // Left/right panning based on angle
      pan = Math.sin(normAngle);

      // Behind the player: muffled (lower volume, lower frequency)
      const isBehind = Math.abs(normAngle) > Math.PI / 2;
      if (isBehind) {
        volumeMult = 0.5;
        freqShift = -50;
      }

      // Distance attenuation
      volumeMult *= Math.max(0.1, 1 - dist / 30);
    }

    // Create stereo panner
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    // Create oscillator with frequency shift
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency + freqShift, now);
    osc.frequency.exponentialRampToValueAtTime((frequency + freqShift) * 0.5, now + duration);
    gain.gain.setValueAtTime(0.15 * volumeMult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.audio.masterGain);
    osc.start(now);
    osc.stop(now + duration);
  }

  private checkWinCondition() {
    if (isExit(this.map, this.player.pos.x, this.player.pos.y)) {
      // Check if exit requires a key
      const chapter = CHAPTERS.find(c => c.id === this.currentChapter);
      if (chapter?.exitRequiredKey) {
        const hasKey = this.player.inventory.some(
          s => s.item.effect === chapter.exitRequiredKey
        );
        if (!hasKey) return;
      }

      // Calculate completion time
      const completionTimeMs = performance.now() - this.gameStartTime;
      const completionTimeSec = completionTimeMs / 1000;
      this.lastCompletionTimeSeconds = completionTimeSec;

      // Check speedrun challenge
      this.lastReward = null;
      const challenge = SPEEDRUN_CHALLENGES.find(c => c.chapterId === this.currentChapter);
      if (challenge) {
        for (const reward of challenge.rewards) {
          if (completionTimeSec <= reward.timeLimitSeconds) {
            this.lastReward = reward;
            this.totalPoints += reward.points;

            // Check if this character is already unlocked
            const alreadyUnlocked = this.unlockedCharacters.some(
              uc => uc.chapterId === this.currentChapter && uc.tier === reward.tier
            );
            if (!alreadyUnlocked) {
              this.unlockedCharacters.push({
                chapterId: this.currentChapter,
                tier: reward.tier,
                characterName: reward.characterName,
                characterIcon: reward.characterIcon,
              });
            }
            break; // Only award the best tier achieved
          }
        }
      }

      // Track best time
      const bestTime = this.bestChapterTimes.get(this.currentChapter) ?? Infinity;
      if (completionTimeSec < bestTime) {
        this.bestChapterTimes.set(this.currentChapter, completionTimeSec);
      }

      this.audio.playWin();
      this.audio.stopHeartbeat();

      // Unlock next chapter
      const nextChapter = this.currentChapter + 1;
      if (nextChapter <= CHAPTERS.length) {
        this.unlockedChapters.add(nextChapter);
      }

      // Play chapter transition cinematic, then set state to 'won'
      if (nextChapter <= CHAPTERS.length) {
        const transition = this.getChapterTransitionCinematic(this.currentChapter, nextChapter);
        this.playCinematic(transition, () => {
          this.state = 'won';
          this.onStateChange?.('won');
        });
      } else {
        // Last chapter - go straight to won
        this.state = 'won';
        this.onStateChange?.('won');
      }
    }
  }

  playerDeath() {
    if (this.hardcoreMode) {
      // Hardcore: permanent death, no retry
      this.state = 'permanentDeath';
      this.audio.playDeath();
      this.audio.stopHeartbeat();
      this.deathTimer = performance.now();
      this.onStateChange?.('permanentDeath');
    } else {
      this.state = 'dead';
      this.audio.playDeath();
      this.audio.stopHeartbeat();
      this.deathTimer = performance.now();
      this.onStateChange?.('dead');
    }
  }

  // ============================================================
  // Line of sight check
  // ============================================================

  private hasLineOfSight(from: Vec2, to: Vec2): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) return true;

    const steps = Math.ceil(dist * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      const mx = Math.floor(x);
      const my = Math.floor(y);

      if (mx < 0 || mx >= this.map.width || my < 0 || my >= this.map.height) return false;

      const cell = this.map.cells[my][mx];
      if (cell === 1) return false;
      if (cell === 3) {
        const door = this.map.doors.find(d => d.x === mx && d.y === my);
        if (door && !door.isOpen) return false;
      }
    }
    return true;
  }

  // ============================================================
  // Raycasting - DDA algorithm
  // ============================================================

  private castRay(posX: number, posY: number, dirX: number, dirY: number): RayHit | null {
    let mapX = Math.floor(posX);
    let mapY = Math.floor(posY);

    const deltaDistX = Math.abs(1 / (dirX || 0.00001));
    const deltaDistY = Math.abs(1 / (dirY || 0.00001));

    let stepX: number, stepY: number;
    let sideDistX: number, sideDistY: number;

    if (dirX < 0) {
      stepX = -1;
      sideDistX = (posX - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - posX) * deltaDistX;
    }

    if (dirY < 0) {
      stepY = -1;
      sideDistY = (posY - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - posY) * deltaDistY;
    }

    let side = 0;
    let hit = false;
    let hitDoor: Door | undefined;
    let maxSteps = 60;

    while (!hit && maxSteps-- > 0) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

      if (mapX < 0 || mapX >= this.map.width || mapY < 0 || mapY >= this.map.height) {
        break;
      }

      const cell = this.map.cells[mapY][mapX];
      if (cell === 1 || cell === 2) {
        hit = true;
      } else if (cell === 3) {
        // Door - check if closed
        const door = this.map.doors.find(d => d.x === mapX && d.y === mapY);
        if (door && !door.isOpen) {
          hit = true;
          hitDoor = door;
        }
      }
    }

    if (!hit) return null;

    let perpDist: number;
    let textureX: number;

    if (side === 0) {
      perpDist = sideDistX - deltaDistX;
      textureX = posY + perpDist * dirY;
    } else {
      perpDist = sideDistY - deltaDistY;
      textureX = posX + perpDist * dirX;
    }

    textureX = textureX - Math.floor(textureX);

    return {
      distance: perpDist,
      mapX,
      mapY,
      side,
      textureX,
      doorHit: hitDoor,
    };
  }

  // ============================================================
  // Rendering
  // ============================================================

  render() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Cinematic mode takes over rendering
    if (this.cinematicMode) {
      this.renderCinematic(ctx, w, h);
      return;
    }

    if (this.state === 'menu') return;

    if (this.state === 'chapterIntro') {
      this.renderChapterIntro(ctx, w, h);
      return;
    }

    if (this.state === 'dead') {
      this.renderDeathScreen(ctx, w, h);
      return;
    }

    if (this.state === 'permanentDeath') {
      this.renderPermanentDeathScreen(ctx, w, h);
      return;
    }

    if (this.state === 'won') {
      this.renderWinScreen(ctx, w, h);
      return;
    }

    if (this.state === 'paused') {
      // Render the game scene underneath
      ctx.save();
      ctx.translate(this.shakeX, this.shakeY);
      this.renderRaycast(ctx, w, h);
      this.renderEntities(ctx, w, h);
      this.renderEntityEffects(ctx, w, h);
      this.renderPulseWave(ctx, w, h);
      this.renderVignette(ctx, w, h);
      ctx.restore();
      this.renderHUD(ctx, w, h);
      this.renderPausedScreen(ctx, w, h);
      return;
    }

    // Playing state
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    // Ear role: render top-down map instead of first-person view
    if (this.coopEnabled && this.coopRole === 'ear') {
      this.renderEarView(ctx, w, h);
    } else {
      // Normal first-person raycast view
      this.renderRaycast(ctx, w, h);
      this.renderEntities(ctx, w, h);
      this.renderEntityEffects(ctx, w, h);

      // Co-op Body: render ping markers as directional arrows
      if (this.coopEnabled && this.coopRole === 'body') {
        this.renderPingArrows(ctx, w, h);
      }

      this.renderPulseWave(ctx, w, h);
      this.renderBreathEffect(ctx, w, h);

      if (this.glitchIntensity > 0.01) {
        this.renderGlitch(ctx, w, h);
      }

      this.renderVignette(ctx, w, h);

      // Hardcore mode: red pulsing vignette with heartbeat
      if (this.hardcoreMode) {
        this.renderHardcoreVignette(ctx, w, h);
      }
    }

    ctx.restore();

    // Skip HUD entirely in hardcore mode (but still render crosshair)
    if (!this.hardcoreMode) {
      this.renderHUD(ctx, w, h);
    } else {
      // Hardcore: only render crosshair and HC indicator
      this.renderCrosshair(ctx, w, h);
      this.renderHardcoreIndicator(ctx, w, h);
    }

    // Microphone indicator
    if (this.micEnabled && this.state === 'playing') {
      this.renderMicIndicator(ctx, w, h);
    }
  }

  // ---- Raycasting renderer ----

  private renderRaycast(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const p = this.player;
    const fovRad = (this.advanced.fov * Math.PI) / 180;
    const numRays = Math.min(w, 480);
    const stripWidth = w / numRays;

    const dirX = Math.cos(p.dir);
    const dirY = Math.sin(p.dir);
    const planeX = -Math.sin(p.dir) * Math.tan(fovRad / 2);
    const planeY = Math.cos(p.dir) * Math.tan(fovRad / 2);

    for (let i = 0; i < numRays; i++) {
      const cameraX = (2 * i) / numRays - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      const hit = this.castRay(p.pos.x, p.pos.y, rayDirX, rayDirY);
      if (!hit) continue;

      // Get illumination for this wall face
      const key = wallKey(hit.mapX, hit.mapY, hit.side);
      const illum = this.illumination.get(key);

      // Also check the other side as fallback
      const otherSide = hit.side === 0 ? 1 : 0;
      const otherKey = wallKey(hit.mapX, hit.mapY, otherSide);
      const otherIllum = this.illumination.get(otherKey);

      const bestIllum = illum || otherIllum;
      if (!bestIllum) continue;

      const currentIntensity = this.getCurrentIntensity(bestIllum);
      if (currentIntensity < 0.005) continue;

      const perpDist = hit.distance;
      if (perpDist < 0.1) continue;

      const lineHeight = h / perpDist;
      const drawStart = Math.max(0, Math.floor((h - lineHeight) / 2));
      const drawEnd = Math.min(h - 1, Math.floor((h + lineHeight) / 2));

      const renderDist = this.advanced.renderDistance;
      const distanceFade = Math.max(0.15, 1 - perpDist / renderDist);
      const alpha = Math.min(1, currentIntensity * distanceFade);
      if (alpha < 0.01) continue;

      // Choose color based on what was hit
      let color = bestIllum.color;
      if (hit.doorHit) {
        color = hit.doorHit.isLocked ? NEON_COLORS.door : NEON_COLORS.doorOpen;
      } else {
        const cell = this.map.cells[hit.mapY]?.[hit.mapX];
        if (cell === 2) color = NEON_COLORS.exit;
      }

      const cx = Math.floor(i * stripWidth + stripWidth / 2);

      // Wide glow for strong illumination
      if (alpha > 0.5) {
        ctx.strokeStyle = this.colorWithAlpha(color, alpha * 0.06);
        ctx.lineWidth = stripWidth + 20;
        ctx.beginPath();
        ctx.moveTo(cx, drawStart);
        ctx.lineTo(cx, drawEnd);
        ctx.stroke();
      }

      // Outer glow
      if (alpha > 0.25) {
        ctx.strokeStyle = this.colorWithAlpha(color, alpha * 0.15);
        ctx.lineWidth = stripWidth + 10;
        ctx.beginPath();
        ctx.moveTo(cx, drawStart);
        ctx.lineTo(cx, drawEnd);
        ctx.stroke();
      }

      // Inner glow
      if (alpha > 0.15) {
        ctx.strokeStyle = this.colorWithAlpha(color, alpha * 0.4);
        ctx.lineWidth = stripWidth + 4;
        ctx.beginPath();
        ctx.moveTo(cx, drawStart);
        ctx.lineTo(cx, drawEnd);
        ctx.stroke();
      }

      // Main neon line
      ctx.strokeStyle = this.colorWithAlpha(color, alpha);
      ctx.lineWidth = stripWidth + 1;
      ctx.beginPath();
      ctx.moveTo(cx, drawStart);
      ctx.lineTo(cx, drawEnd);
      ctx.stroke();

      // Floor/ceiling edge glow
      if (alpha > 0.2) {
        const edgeGlow = alpha * 0.12;
        const sw = Math.ceil(stripWidth);
        const sx = Math.floor(i * stripWidth);
        ctx.fillStyle = this.colorWithAlpha(color, edgeGlow);
        ctx.fillRect(sx, Math.max(0, drawStart - 6), sw, 6);
        ctx.fillRect(sx, drawEnd, sw, 6);
      }
    }
  }

  // ---- Entity rendering ----

  private renderEntities(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const p = this.player;
    const now = performance.now();

    const sortedEntities = [...this.entities].sort((a, b) => {
      return this.dist(b.pos, p.pos) - this.dist(a.pos, p.pos);
    });

    const fovRad = (this.advanced.fov * Math.PI) / 180;

    for (const entity of sortedEntities) {
      // Phantom idle/teleporting is invisible
      if (entity.state === 'idle' || entity.isTeleporting) continue;

      const dx = entity.pos.x - p.pos.x;
      const dy = entity.pos.y - p.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.3) continue;

      const angle = Math.atan2(dy, dx) - p.dir;
      let normAngle = angle;
      while (normAngle > Math.PI) normAngle -= 2 * Math.PI;
      while (normAngle < -Math.PI) normAngle += 2 * Math.PI;

      if (Math.abs(normAngle) > fovRad + 0.3) continue;

      // Check illumination from pulses and flashlight
      let illumination = 0;

      // Pulse illumination
      for (const pulse of this.pulses) {
        const distToOrigin = this.dist(entity.pos, pulse.origin);
        const elapsed = now - pulse.startTime;
        const progress = Math.min(1, elapsed / pulse.duration);
        const currentRadius = pulse.radius * progress;

        if (distToOrigin < currentRadius) {
          const fadeElapsed = now - (pulse.startTime + (distToOrigin / pulse.radius) * pulse.duration);
          if (fadeElapsed < FADE_DURATION) {
            const fadeIntensity = pulse.intensity * (1 - fadeElapsed / FADE_DURATION);
            const distFade = 1 - distToOrigin / (pulse.radius + 1);
            illumination = Math.max(illumination, fadeIntensity * distFade);
          }
        } else if (distToOrigin < currentRadius + 2) {
          const wavefrontIntensity = pulse.intensity * (1 - progress * 0.3);
          const distFade = 1 - distToOrigin / (pulse.radius + 1);
          illumination = Math.max(illumination, wavefrontIntensity * distFade);
        }
      }

      // Flashlight illumination
      if (p.flashlightOn && this.hasLineOfSight(p.pos, entity.pos)) {
        const entityAngle = Math.atan2(dy, dx);
        let angleDiff = entityAngle - p.dir;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        const flashHalfFov = (this.advanced.flashlightFov * Math.PI / 180) / 2;
        if (Math.abs(angleDiff) < flashHalfFov) {
          const angleFade = 1 - Math.abs(angleDiff) / flashHalfFov;
          const distFade = Math.max(0.2, 1 - dist / this.advanced.renderDistance);
          illumination = Math.max(illumination, this.advanced.flashlightIntensity * angleFade * distFade * 0.6);
        }
      }

      // Flare illumination
      for (const flare of this.flares) {
        const flareDist = this.dist(entity.pos, flare.pos);
        const flareElapsed = now - flare.startTime;
        const flareRemaining = 1 - flareElapsed / flare.duration;
        if (flareDist < flare.radius && flareRemaining > 0) {
          const flareIllum = flareRemaining * flare.intensity * (1 - flareDist / flare.radius);
          illumination = Math.max(illumination, flareIllum);
        }
      }

      // Nearby wall illumination (indirect)
      const entityMapX = Math.floor(entity.pos.x);
      const entityMapY = Math.floor(entity.pos.y);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          for (let side = 0; side < 2; side++) {
            const key = wallKey(entityMapX + ox, entityMapY + oy, side);
            const wallIllum = this.illumination.get(key);
            if (wallIllum) {
              const ci = this.getCurrentIntensity(wallIllum);
              illumination = Math.max(illumination, ci * 0.5);
            }
          }
        }
      }

      if (illumination < 0.03) continue;

      const screenX = w / 2 + (normAngle / fovRad) * (w / 2);
      const spriteHeight = h / dist;
      const spriteWidth = spriteHeight * 0.5;

      const drawY = (h - spriteHeight) / 2;

      const alpha = Math.min(1, illumination * Math.max(0.2, 1 - dist / 20));
      if (alpha < 0.03) continue;

      // Get entity type colors
      const template = ENEMY_TEMPLATES[entity.type];
      const entityColor = template.color;
      const glowColor = template.glowColor;
      const eyeColor = template.eyeColor;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Outer glow
      ctx.fillStyle = this.colorWithAlpha(glowColor, alpha * 0.12);
      ctx.fillRect(
        screenX - spriteWidth,
        drawY + spriteHeight * 0.05,
        spriteWidth * 2,
        spriteHeight * 0.9
      );

      // ---- Detailed entity rendering by type ----
      const cx = screenX;
      const anim = entity.animPhase;
      const isChase = entity.state === 'chase';
      const isInvestigate = entity.state === 'investigate';
      const isSearch = entity.state === 'search';
      const detailLevel = dist < 4 ? 3 : dist < 8 ? 2 : 1; // 1=far, 2=mid, 3=close
      const chaseFactor = isChase ? 1.0 : isInvestigate ? 0.5 : isSearch ? 0.3 : 0.0;

      if (entity.type === 'stalker') {
        // ========== STALKER: Impossibly tall horror with peeling skin and void face ==========
        const scale = 1.5; // even taller than before
        const sH = spriteHeight * scale;
        const sW = spriteWidth * 0.85;
        const baseY = drawY - spriteHeight * 0.3;

        // Jitter for organic horror feel
        const jx = () => (Math.random() - 0.5) * sW * 0.02 * (1 + chaseFactor);
        const jy = () => (Math.random() - 0.5) * sH * 0.01 * (1 + chaseFactor);

        // -- Void aura (dark crimson glow behind the figure) --
        ctx.fillStyle = this.colorWithAlpha('#8b0000', alpha * 0.08 * (1 + chaseFactor * 0.5));
        ctx.shadowColor = '#8b0000';
        ctx.shadowBlur = 60;
        ctx.beginPath();
        ctx.ellipse(cx, baseY + sH * 0.45, sW * 0.6, sH * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // -- Elongated featureless head that TILTS toward player --
        const headCX = cx + Math.sin(anim * 0.7) * sW * 0.05;
        const headCY = baseY + sH * 0.06;
        const headW = sW * 0.12;
        const headH = sW * 0.28; // much taller than wide
        // Tilt toward player - more tilt when closer
        const tiltToward = 0.25 + Math.sin(anim * 0.4) * 0.12 + (1 / (dist + 1)) * 0.15;

        ctx.strokeStyle = '#ff1744';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 30;
        ctx.lineWidth = 1.8;

        if (isChase) {
          // -- FACE SPLITS OPEN: void with scattered eyes --
          // Draw split halves
          ctx.beginPath();
          ctx.ellipse(headCX - headW * 0.15 + jx(), headCY, headW * 0.6, headH, tiltToward, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(headCX + headW * 0.15 + jx(), headCY, headW * 0.6, headH, -tiltToward, 0, Math.PI * 2);
          ctx.stroke();

          // The void between the split
          ctx.fillStyle = this.colorWithAlpha('#000000', alpha * 0.9);
          ctx.shadowColor = '#ff0000';
          ctx.shadowBlur = 5;
          ctx.beginPath();
          ctx.ellipse(headCX, headCY, headW * 0.2, headH * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();

          // Scattered eyes in the void
          if (detailLevel >= 2) {
            ctx.fillStyle = this.colorWithAlpha('#ff0000', alpha * 0.95);
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 15;
            const eyeCount = detailLevel >= 3 ? 6 : 4;
            for (let e = 0; e < eyeCount; e++) {
              const eyeAngle = anim * 0.5 + e * (Math.PI * 2 / eyeCount);
              const eyeR = headW * 0.25 + Math.sin(anim * 2 + e * 3) * headW * 0.1;
              const ex = headCX + Math.cos(eyeAngle) * eyeR;
              const ey = headCY + Math.sin(eyeAngle) * eyeR * 0.8;
              const eSize = 1.5 + Math.sin(anim * 3 + e * 2) * 0.5;
              ctx.beginPath();
              ctx.arc(ex, ey, eSize, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          // Featureless head - just an elongated oval with peeling lines
          ctx.beginPath();
          ctx.ellipse(headCX, headCY, headW, headH, tiltToward, 0, Math.PI * 2);
          ctx.stroke();

          // Peeling skin lines (gaps and jittering)
          if (detailLevel >= 2) {
            ctx.strokeStyle = this.colorWithAlpha('#8b0000', alpha * 0.5);
            ctx.lineWidth = 0.8;
            const peelCount = detailLevel >= 3 ? 5 : 3;
            for (let pe = 0; pe < peelCount; pe++) {
              const peT = (pe + 1) / (peelCount + 1);
              const peY = headCY - headH + headH * 2 * peT;
              const peW = headW * (1 - peT * 0.3);
              const gapChance = Math.sin(anim * 1.5 + pe * 4);
              if (gapChance > 0) {
                ctx.beginPath();
                ctx.moveTo(headCX - peW + jx(), peY + jy());
                ctx.lineTo(headCX - peW * 0.3 + jx(), peY + headH * 0.05 + jy());
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(headCX + peW * 0.3 + jx(), peY - headH * 0.03 + jy());
                ctx.lineTo(headCX + peW + jx(), peY + jy());
                ctx.stroke();
              }
            }
          }
        }

        // -- Crooked neck with shifting vertebrae --
        ctx.strokeStyle = '#ff1744';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 1.5;
        const neckTop = headCY + headH;
        const neckBot = baseY + sH * 0.2;
        const neckSegs = detailLevel >= 2 ? 6 : 3;
        for (let seg = 0; seg < neckSegs; seg++) {
          const t = seg / neckSegs;
          const ny = neckTop + (neckBot - neckTop) * t;
          const nx = cx + Math.sin(anim * 0.6 + seg * 0.8) * sW * 0.06;
          const vertW = sW * 0.07 + Math.sin(anim * 1.2 + seg) * sW * 0.01;
          ctx.beginPath();
          ctx.moveTo(nx - vertW + jx(), ny + jy());
          ctx.lineTo(nx + vertW + jx(), ny + jy());
          ctx.stroke();
        }
        // Neck spine
        ctx.beginPath();
        ctx.moveTo(headCX, neckTop);
        ctx.quadraticCurveTo(cx + Math.sin(anim * 0.6) * sW * 0.05, (neckTop + neckBot) / 2, cx, neckBot);
        ctx.stroke();

        // -- Torso with shifting/peeling skin over ribcage --
        const torsoTop = neckBot;
        const torsoBot = baseY + sH * 0.48;
        const torsoW = sW * 0.2;

        // Spine
        ctx.strokeStyle = '#ff1744';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, torsoTop);
        const spineSway = Math.sin(anim * 0.8) * sW * 0.03;
        ctx.quadraticCurveTo(cx + spineSway, (torsoTop + torsoBot) / 2, cx, torsoBot);
        ctx.stroke();

        // Ribcage with skin peeling away
        if (detailLevel >= 2) {
          const ribCount = detailLevel >= 3 ? 6 : 4;
          for (let r = 0; r < ribCount; r++) {
            const ribT = (r + 1) / (ribCount + 1);
            const ribY = torsoTop + (torsoBot - torsoTop) * ribT;
            const ribW = torsoW * (1.2 - ribT * 0.4);
            const ribSway = Math.sin(anim * 1.2 + r * 0.8) * sW * 0.015;
            // Skin gaps - some ribs are exposed, some covered
            const exposed = Math.sin(anim * 0.8 + r * 2.5) > -0.2;
            if (exposed) {
              ctx.strokeStyle = this.colorWithAlpha('#8b0000', alpha * 0.9);
              ctx.lineWidth = 1.2;
            } else {
              ctx.strokeStyle = this.colorWithAlpha('#ff1744', alpha * 0.4);
              ctx.lineWidth = 0.8;
            }
            ctx.beginPath();
            ctx.moveTo(cx - ribW + ribSway + jx(), ribY + jy());
            ctx.quadraticCurveTo(cx + ribSway, ribY - sW * 0.04, cx + ribW + ribSway + jx(), ribY + jy());
            ctx.stroke();
          }
        }

        // Dark void core pulsing inside torso
        const pulseIntensity = 0.3 + Math.sin(anim * 2.5) * 0.15 + chaseFactor * 0.3;
        ctx.fillStyle = this.colorWithAlpha('#8b0000', alpha * pulseIntensity * 0.3);
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.ellipse(cx, (torsoTop + torsoBot) / 2, torsoW * 0.5, (torsoBot - torsoTop) * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // -- MULTIPLE ARMS (4-6, moving independently) --
        ctx.strokeStyle = '#ff1744';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 1.5;

        const armCount = isChase ? 6 : 4;
        for (let a = 0; a < armCount; a++) {
          const side = a % 2 === 0 ? -1 : 1;
          const armIdx = Math.floor(a / 2);
          const shoulderX = cx + side * torsoW;
          const shoulderY = torsoTop + sH * 0.02 + armIdx * sH * 0.04;
          const armPhase = anim * (1.3 + a * 0.4) + a * 2.1;

          const elbowX = shoulderX + side * (sW * 0.15 + armIdx * sW * 0.05) + Math.sin(armPhase) * sW * 0.06;
          const elbowY = shoulderY + (torsoBot - torsoTop) * (0.4 + armIdx * 0.15);

          const extraX = elbowX + side * sW * 0.04 + Math.sin(armPhase * 1.4) * sW * 0.04;
          const extraY = elbowY + (torsoBot - torsoTop) * (0.2 + Math.sin(armPhase * 0.7) * 0.1);

          const wristX = extraX + Math.sin(armPhase * 1.8) * sW * 0.08;
          const wristY = isChase
            ? torsoBot + sH * 0.2 + Math.sin(armPhase * 2) * sH * 0.05
            : torsoBot + sH * 0.05 + Math.sin(armPhase * 1.2) * sH * 0.02;

          // Draw with jittering
          ctx.beginPath();
          ctx.moveTo(shoulderX, shoulderY);
          ctx.lineTo(elbowX + jx(), elbowY + jy());
          ctx.lineTo(extraX + jx(), extraY + jy());
          ctx.lineTo(wristX + jx(), wristY + jy());
          ctx.stroke();

          // Sharp jointed fingers
          if (detailLevel >= 2) {
            ctx.lineWidth = 1;
            const fingerCount = isChase ? 5 : 3;
            for (let f = 0; f < fingerCount; f++) {
              const fAngle = side * (-0.5 + f * 0.3) + Math.sin(armPhase * 2.3 + f) * 0.15;
              const fLen = sW * 0.12 + (f % 2) * sW * 0.04;
              // Two joints per finger
              const midX = wristX + Math.cos(fAngle) * fLen * 0.5;
              const midY = wristY + Math.sin(fAngle + Math.PI * 0.3) * fLen * 0.5;
              const tipX = midX + Math.cos(fAngle + 0.3) * fLen * 0.6;
              const tipY = midY + Math.sin(fAngle + 0.3) * fLen * 0.5;
              ctx.beginPath();
              ctx.moveTo(wristX, wristY);
              ctx.lineTo(midX + jx(), midY + jy());
              ctx.lineTo(tipX + jx(), tipY + jy());
              ctx.stroke();
            }
            ctx.lineWidth = 1.5;
          }
        }

        // -- Dripping/shifting mass below torso (NO LEGS - flowing shadow) --
        ctx.strokeStyle = this.colorWithAlpha('#8b0000', alpha * 0.7);
        ctx.shadowColor = '#8b0000';
        ctx.shadowBlur = 25;
        ctx.lineWidth = 1.2;

        const massTop = torsoBot;
        const massBot = baseY + sH * 0.92;
        const massW = torsoW * 1.2;

        // Flowing shadow outline with drip tendrils
        const dripCount = detailLevel >= 2 ? 8 : 5;
        for (let d = 0; d < dripCount; d++) {
          const dt = d / (dripCount - 1);
          const dX = cx - massW + massW * 2 * dt;
          const dLen = (massBot - massTop) * (0.3 + 0.5 * Math.sin(anim * 0.7 + d * 1.9));
          const dSway = Math.sin(anim * 1.3 + d * 2.2) * sW * 0.06;
          ctx.beginPath();
          ctx.moveTo(dX, massTop + sH * 0.05);
          ctx.quadraticCurveTo(dX + dSway, massTop + dLen * 0.5, dX + dSway * 0.6, massTop + dLen);
          ctx.stroke();
        }

        // Central flowing mass body
        ctx.beginPath();
        ctx.moveTo(cx - massW, massTop);
        ctx.quadraticCurveTo(cx - massW + Math.sin(anim * 0.9) * sW * 0.04, massTop + (massBot - massTop) * 0.4, cx - massW * 0.5, massBot);
        ctx.lineTo(cx + massW * 0.5, massBot);
        ctx.quadraticCurveTo(cx + massW + Math.sin(anim * 1.1) * sW * 0.04, massTop + (massBot - massTop) * 0.4, cx + massW, massTop);
        ctx.stroke();

        // -- Chase: arms flail, face split, dripping intensifies --
        if (isChase) {
          // Aggressive contortion across torso
          ctx.strokeStyle = this.colorWithAlpha('#8b0000', alpha * 0.5);
          ctx.lineWidth = 0.8;
          for (let c = 0; c < 4; c++) {
            const cy2 = torsoTop + (torsoBot - torsoTop) * (0.2 + c * 0.2);
            ctx.beginPath();
            ctx.moveTo(cx - torsoW * 1.0 + jx(), cy2 + Math.sin(anim * 3 + c) * sW * 0.04);
            ctx.quadraticCurveTo(cx + Math.sin(anim * 2.5 + c) * sW * 0.06, cy2 - sW * 0.03, cx + torsoW * 1.0 + jx(), cy2 + Math.cos(anim * 2.8 + c) * sW * 0.04);
            ctx.stroke();
          }

          // Blood drip particles from the face void
          if (detailLevel >= 2) {
            ctx.fillStyle = this.colorWithAlpha('#ff0000', alpha * 0.6);
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 8;
            for (let dp = 0; dp < 5; dp++) {
              const dpX = headCX + (Math.random() - 0.5) * headW;
              const dpY = headCY + headH * 0.5 + Math.random() * sH * 0.15;
              ctx.beginPath();
              ctx.arc(dpX, dpY, 1 + Math.random(), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

      } else if (entity.type === 'hunter') {
        // ========== HUNTER: Multi-limbed predator with exposed bones ==========
        const sH = spriteHeight * 0.75; // low and wide
        const sW = spriteWidth * 1.3;
        const baseY = drawY + spriteHeight * 0.12;

        // -- Dark core glow --
        ctx.fillStyle = this.colorWithAlpha('#3e2000', alpha * 0.1 * (1 + chaseFactor * 0.5));
        ctx.shadowColor = '#ff6d00';
        ctx.shadowBlur = 50;
        ctx.beginPath();
        ctx.ellipse(cx, baseY + sH * 0.4, sW * 0.7, sH * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // -- MASSIVE JAW HEAD (no eyes - it's blind) --
        ctx.strokeStyle = '#ff6d00';
        ctx.shadowColor = '#ff6d00';
        ctx.shadowBlur = 22;
        ctx.lineWidth = 2;

        const headX = cx - sW * 0.4;
        const headY = baseY + sH * 0.25;
        const headW = sW * 0.22;
        const headH = sW * 0.12;

        // Skull - just a hard angular shape, no eye sockets
        ctx.beginPath();
        ctx.moveTo(headX - headW, headY - headH);
        ctx.lineTo(headX + headW * 0.3, headY - headH * 0.5);
        ctx.lineTo(headX + headW * 0.4, headY + headH * 0.3);
        ctx.lineTo(headX - headW * 0.8, headY + headH * 0.5);
        ctx.closePath();
        ctx.stroke();

        // -- Jaw that UNHINGES when chasing --
        const jawOpen = isChase ? 1.2 : 0.15 + Math.sin(anim * 1.5) * 0.08;
        const jawY = headY + headH * 0.5;
        const jawDrop = headH * jawOpen * (isChase ? 2.5 : 1);
        const jawWidth = headW * (isChase ? 1.8 : 1.2);

        // Upper jaw - rows of teeth
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(headX - jawWidth, jawY);
        ctx.lineTo(headX + headW * 0.5, jawY);
        ctx.stroke();

        // Lower jaw - unhinges dramatically
        ctx.beginPath();
        ctx.moveTo(headX - jawWidth * 1.1, jawY);
        ctx.lineTo(headX - jawWidth * 1.2, jawY + jawDrop);
        ctx.lineTo(headX + headW * 0.6, jawY + jawDrop * 0.85);
        ctx.stroke();

        // Multiple rows of teeth
        if (detailLevel >= 2) {
          ctx.lineWidth = 1;
          const rows = isChase ? 3 : 2;
          for (let row = 0; row < rows; row++) {
            const rowOffset = row * sW * 0.012;
            const teethCount = isChase ? 8 : 5;
            for (let t = 0; t < teethCount; t++) {
              const tt = t / (teethCount - 1);
              const toothX = headX - jawWidth * 0.9 + jawWidth * 1.3 * tt;
              const toothH = sW * 0.035 * (isChase ? 1.5 : 1.0) * (1 - row * 0.2);
              // Upper teeth
              ctx.strokeStyle = this.colorWithAlpha('#ffab40', alpha * (0.9 - row * 0.2));
              ctx.beginPath();
              ctx.moveTo(toothX - sW * 0.006, jawY + rowOffset);
              ctx.lineTo(toothX, jawY + toothH + rowOffset);
              ctx.lineTo(toothX + sW * 0.006, jawY + rowOffset);
              ctx.stroke();
              // Lower teeth
              ctx.beginPath();
              ctx.moveTo(toothX - sW * 0.006, jawY + jawDrop - rowOffset);
              ctx.lineTo(toothX, jawY + jawDrop - toothH * 0.8 - rowOffset);
              ctx.lineTo(toothX + sW * 0.006, jawY + jawDrop - rowOffset);
              ctx.stroke();
            }
          }
          ctx.strokeStyle = '#ff6d00';
        }

        // Sound receptor - a pulsing pit on the forehead (no eyes!)
        if (detailLevel >= 2) {
          ctx.fillStyle = this.colorWithAlpha('#ff8800', alpha * 0.8);
          ctx.shadowColor = '#ff8800';
          ctx.shadowBlur = 12 + chaseFactor * 10;
          const pitX = headX - headW * 0.3;
          const pitY = headY - headH * 0.3;
          const pitR = sW * 0.03 * (1 + Math.sin(anim * 3) * 0.2 + chaseFactor * 0.4);
          ctx.beginPath();
          ctx.arc(pitX, pitY, pitR, 0, Math.PI * 2);
          ctx.fill();
          // Pulse rings
          ctx.strokeStyle = this.colorWithAlpha('#ff8800', alpha * (0.3 + Math.sin(anim * 3) * 0.15));
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(pitX, pitY, pitR * 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        // -- Hunched back with GLOWING spine ridges --
        ctx.strokeStyle = '#ff6d00';
        ctx.shadowColor = '#ff6d00';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 2;

        const backStartX = cx - sW * 0.4;
        const backEndX = cx + sW * 0.3;
        const backY = baseY + sH * 0.2;
        const humpY = baseY + sH * 0.12;

        ctx.beginPath();
        ctx.moveTo(backStartX, backY + sH * 0.1);
        ctx.quadraticCurveTo(cx - sW * 0.1, humpY, cx, humpY - sH * 0.03);
        ctx.quadraticCurveTo(cx + sW * 0.15, humpY, backEndX, backY + sH * 0.06);
        ctx.stroke();

        // Spine ridges - PULSE and GLOW when chasing
        const ridgeCount = detailLevel >= 2 ? 7 : 4;
        for (let r = 0; r < ridgeCount; r++) {
          const rt = (r + 0.5) / ridgeCount;
          const rx = backStartX + (backEndX - backStartX) * rt;
          const rBaseY2 = humpY + Math.abs(rt - 0.4) * sH * 0.15;
          const ridgeH = sW * 0.07 * (1 + chaseFactor * 0.6);

          if (isChase && detailLevel >= 2) {
            const glowPhase = Math.sin(anim * 4 + r * 0.8);
            ctx.strokeStyle = this.colorWithAlpha('#ffab40', alpha * (0.6 + glowPhase * 0.4));
            ctx.shadowColor = '#ffab40';
            ctx.shadowBlur = 15 + glowPhase * 10;
          } else {
            ctx.strokeStyle = this.colorWithAlpha('#ff6d00', alpha * 0.8);
            ctx.shadowColor = '#ff6d00';
            ctx.shadowBlur = 12;
          }

          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(rx - sW * 0.012, rBaseY2);
          ctx.lineTo(rx, rBaseY2 - ridgeH);
          ctx.lineTo(rx + sW * 0.012, rBaseY2);
          ctx.stroke();
        }

        // -- Exposed ribcage/vertebrae through translucent skin --
        if (detailLevel >= 2) {
          ctx.strokeStyle = this.colorWithAlpha('#ffab40', alpha * 0.35);
          ctx.shadowColor = '#ffab40';
          ctx.shadowBlur = 8;
          ctx.lineWidth = 0.8;
          const ribY = baseY + sH * 0.25;
          const ribCount = detailLevel >= 3 ? 5 : 3;
          for (let r = 0; r < ribCount; r++) {
            const rOff = r * sW * 0.04;
            ctx.beginPath();
            ctx.moveTo(cx - sW * 0.15 + rOff, ribY + r * sH * 0.03);
            ctx.quadraticCurveTo(cx + rOff * 0.5, ribY + r * sH * 0.03 - sW * 0.03, cx + sW * 0.2 + rOff, ribY + r * sH * 0.03);
            ctx.stroke();
          }
          // Visible vertebrae along spine
          ctx.strokeStyle = this.colorWithAlpha('#ff6d00', alpha * 0.5);
          ctx.lineWidth = 1;
          for (let v = 0; v < 6; v++) {
            const vt = v / 5;
            const vx = backStartX + (backEndX - backStartX) * vt;
            const vy = humpY + Math.abs(vt - 0.4) * sH * 0.1 + sH * 0.08;
            ctx.beginPath();
            ctx.moveTo(vx - sW * 0.02, vy);
            ctx.lineTo(vx + sW * 0.02, vy);
            ctx.stroke();
          }
        }

        // -- TOO MANY LEGS (6-8, asymmetrical) --
        ctx.strokeStyle = '#ff6d00';
        ctx.shadowColor = '#ff6d00';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 1.8;

        const legCount = isChase ? 8 : 6;
        for (let leg = 0; leg < legCount; leg++) {
          const side = leg % 2 === 0 ? -1 : 1;
          const legPair = Math.floor(leg / 2);
          const hipX = cx + side * (sW * 0.15 + legPair * sW * 0.1) * (leg % 2 === 0 ? -1 : 1);
          const hipY = backY + sH * 0.12 + legPair * sH * 0.04;

          // Disturbing non-unison movement when chasing
          const legPhase = isChase
            ? anim * (2.5 + leg * 0.7) + leg * 1.3 // desynced
            : anim * 1.2 + leg * Math.PI * 0.5;

          const kneeX = hipX + side * sW * 0.08 + Math.sin(legPhase) * sW * 0.03;
          const kneeY = hipY + sH * 0.15 + Math.sin(legPhase + 1) * sH * 0.03;

          const pawX = kneeX + Math.sin(legPhase * 0.8) * sW * 0.04;
          const pawY = baseY + sH * 0.75 + Math.sin(legPhase * 0.6) * sH * 0.03;

          ctx.beginPath();
          ctx.moveTo(hipX, hipY);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(pawX, pawY);
          ctx.stroke();

          // Claws
          if (detailLevel >= 2) {
            ctx.lineWidth = 1;
            const clawLen = sW * 0.04 * (1 + chaseFactor * 0.5);
            for (let c = 0; c < 3; c++) {
              const cAngle = side * (0.2 + c * 0.3);
              ctx.beginPath();
              ctx.moveTo(pawX, pawY);
              ctx.lineTo(pawX + Math.cos(cAngle + Math.PI * (side > 0 ? 0 : 1)) * clawLen, pawY + clawLen * 0.7);
              ctx.stroke();
            }
            ctx.lineWidth = 1.8;
          }
        }

        // -- Tail with segmented barbs --
        ctx.lineWidth = 1.5;
        const tailBase = { x: backEndX, y: backY + sH * 0.06 };
        const tailMid = {
          x: backEndX + sW * 0.2 + Math.sin(anim * 1.3) * sW * 0.06,
          y: backY + sH * 0.02
        };
        const tailTip = {
          x: backEndX + sW * 0.35 + Math.sin(anim * 1.6) * sW * 0.08,
          y: backY - sH * 0.03
        };
        ctx.beginPath();
        ctx.moveTo(tailBase.x, tailBase.y);
        ctx.quadraticCurveTo(tailMid.x, tailMid.y, tailTip.x, tailTip.y);
        ctx.stroke();

        // Segmented barbs
        if (detailLevel >= 2) {
          ctx.lineWidth = 1.2;
          for (let b = 0; b < 4; b++) {
            const bt = (b + 1) / 5;
            const bx = tailBase.x + (tailTip.x - tailBase.x) * bt;
            const by = tailBase.y + (tailTip.y - tailBase.y) * bt;
            const barbLen = sW * 0.04 * (1 - bt * 0.3);
            ctx.beginPath();
            ctx.moveTo(bx, by - barbLen);
            ctx.lineTo(bx, by);
            ctx.lineTo(bx + barbLen * 0.5, by - barbLen * 0.5);
            ctx.stroke();
          }
        }

        // -- Chase: drool, aggressive glow, jaw fully extended --
        if (isChase && detailLevel >= 2) {
          // Thick drool from jaw
          ctx.strokeStyle = this.colorWithAlpha('#ffab40', alpha * 0.4);
          ctx.lineWidth = 1;
          for (let d = 0; d < 4; d++) {
            const dx2 = headX - jawWidth * 0.7 + d * jawWidth * 0.35;
            const dLen = sH * 0.1 + Math.sin(anim * 2 + d) * sH * 0.03;
            ctx.beginPath();
            ctx.moveTo(dx2, jawY + jawDrop);
            ctx.quadraticCurveTo(
              dx2 + Math.sin(anim * 3 + d) * sW * 0.03,
              jawY + jawDrop + dLen * 0.5,
              dx2 + Math.sin(anim * 2.5 + d * 1.5) * sW * 0.02,
              jawY + jawDrop + dLen
            );
            ctx.stroke();
          }
        }

      } else if (entity.type === 'phantom') {
        // ========== PHANTOM: Floating vortex-faced horror with static ==========
        const sH = spriteHeight * 0.9;
        const sW = spriteWidth * 0.9;
        const baseY = drawY + sH * 0.05;

        // Flicker visibility - sometimes appears, sometimes just noise
        const flickerPhase = Math.sin(anim * 2.3);
        const isVisible = flickerPhase > -0.5 || isChase; // chase = always visible
        const bodyAlpha = isVisible ? alpha : alpha * 0.15;

        // -- SWIRLING static/noise particles --
        const particleCount = detailLevel >= 3 ? 30 : detailLevel >= 2 ? 15 : 8;
        for (let p = 0; p < particleCount; p++) {
          const pAngle = anim * (1.5 + chaseFactor) + p * (Math.PI * 2 / particleCount);
          const pRadius = sW * (0.4 + Math.sin(anim * 2 + p * 3.7) * 0.2);
          const px = cx + Math.cos(pAngle) * pRadius;
          const py = baseY + sH * 0.35 + Math.sin(pAngle * 0.7 + p) * sH * 0.25;
          // Mix of purple and white static
          const isStatic = Math.sin(anim * 8 + p * 11.3) > 0.6;
          if (isStatic) {
            ctx.fillStyle = this.colorWithAlpha('#ffffff', alpha * 0.2 * (1 + chaseFactor * 0.5));
          } else {
            ctx.fillStyle = this.colorWithAlpha('#7b1fa2', alpha * 0.15 * (1 + chaseFactor * 0.3));
          }
          ctx.shadowBlur = 3;
          ctx.beginPath();
          ctx.arc(px, py, 1 + Math.random() * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = bodyAlpha;

        // -- Face VORTEX (not a face, a void that stares back) --
        const floatOffset = Math.sin(anim * 0.8) * sH * 0.03;
        const vortexCX = cx + Math.sin(anim * 0.5) * sW * 0.03;
        const vortexCY = baseY + sH * 0.15 + floatOffset;

        // Spiral vortex
        const vortexRot = anim * (isChase ? 3 : 1);
        ctx.strokeStyle = '#7b1fa2';
        ctx.shadowColor = '#7b1fa2';
        ctx.shadowBlur = 30;
        ctx.lineWidth = 1.5;

        const spiralArms = 3;
        for (let arm = 0; arm < spiralArms; arm++) {
          const armOffset = (arm / spiralArms) * Math.PI * 2;
          ctx.beginPath();
          const steps = 20;
          for (let s = 0; s <= steps; s++) {
            const st = s / steps;
            const sAngle = vortexRot + armOffset + st * Math.PI * 3;
            const sRadius = st * sW * 0.18;
            const sx2 = vortexCX + Math.cos(sAngle) * sRadius;
            const sy2 = vortexCY + Math.sin(sAngle) * sRadius;
            if (s === 0) ctx.moveTo(sx2, sy2);
            else ctx.lineTo(sx2, sy2);
          }
          ctx.stroke();
        }

        // Deep void at center of vortex
        ctx.fillStyle = this.colorWithAlpha('#000000', alpha * 0.8);
        ctx.shadowColor = '#aa00ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(vortexCX, vortexCY, sW * 0.03, 0, Math.PI * 2);
        ctx.fill();

        // Chase: vortex spins faster and expands
        if (isChase && detailLevel >= 2) {
          ctx.strokeStyle = this.colorWithAlpha('#aa00ff', alpha * 0.5);
          ctx.lineWidth = 1;
          const fastSpiral = anim * 5;
          for (let arm = 0; arm < 4; arm++) {
            const armOff = (arm / 4) * Math.PI * 2;
            ctx.beginPath();
            for (let s = 0; s <= 15; s++) {
              const st = s / 15;
              const sA = fastSpiral + armOff + st * Math.PI * 4;
              const sR = st * sW * 0.25;
              const sx = vortexCX + Math.cos(sA) * sR;
              const sy = vortexCY + Math.sin(sA) * sR;
              if (s === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
          }
        }

        // -- FLOATING torso with no legs --
        ctx.strokeStyle = '#7b1fa2';
        ctx.shadowColor = '#7b1fa2';
        ctx.shadowBlur = 25;
        ctx.lineWidth = 1.8;

        const bodyTop = vortexCY + sW * 0.15 + floatOffset;
        const bodyBot = baseY + sH * 0.55;
        const bodyW = sW * 0.22;

        // Undulating torso outline that glitches
        const segments = 14;
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const by = bodyTop + (bodyBot - bodyTop) * t;
          // Glitch: some segments offset randomly
          const glitchOffset = Math.sin(anim * 5 + t * 10) > 0.8 ? (Math.random() - 0.5) * sW * 0.1 : 0;
          const wave = Math.sin(anim * 1.5 + t * 6) * sW * 0.04 * (1 + chaseFactor * 0.5);
          const bx = cx - bodyW + wave + glitchOffset;
          if (i === 0) ctx.moveTo(bx, by);
          else ctx.lineTo(bx, by);
        }
        for (let i = segments; i >= 0; i--) {
          const t = i / segments;
          const by = bodyTop + (bodyBot - bodyTop) * t;
          const glitchOffset = Math.sin(anim * 5 + t * 10 + 1) > 0.8 ? (Math.random() - 0.5) * sW * 0.1 : 0;
          const wave = Math.sin(anim * 1.5 + t * 6 + 2) * sW * 0.04 * (1 + chaseFactor * 0.5);
          const bx = cx + bodyW + wave + glitchOffset;
          ctx.lineTo(bx, by);
        }
        ctx.closePath();
        ctx.stroke();

        // Holes/voids in body
        if (detailLevel >= 2) {
          ctx.globalCompositeOperation = 'destination-out';
          const holeCount = detailLevel >= 3 ? 5 : 3;
          for (let h2 = 0; h2 < holeCount; h2++) {
            const ht = 0.15 + h2 * 0.18;
            const hy = bodyTop + (bodyBot - bodyTop) * ht;
            const hx = cx + Math.sin(anim * 1.2 + h2 * 3) * bodyW * 0.5;
            const hr = sW * 0.04 + Math.sin(anim * 2 + h2 * 2) * sW * 0.015;
            if (Math.sin(anim * 1.8 + h2 * 5) > -0.3) {
              ctx.fillStyle = 'rgba(0,0,0,1)';
              ctx.beginPath();
              ctx.arc(hx, hy, hr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        }

        // -- Multiple reaching arms that PHASE in and out --
        const armPhaseCount = detailLevel >= 3 ? 6 : 4;
        for (let a = 0; a < armPhaseCount; a++) {
          const side = a % 2 === 0 ? -1 : 1;
          const armPhase = anim * (1.2 + a * 0.3) + a * 1.7;

          // Phase in/out
          const phaseAlpha = (Math.sin(armPhase * 0.7) + 1) * 0.4 + (isChase ? 0.2 : 0);
          if (phaseAlpha < 0.1) continue; // fully phased out

          const solid = Math.sin(armPhase * 0.3) > 0;
          ctx.strokeStyle = solid
            ? this.colorWithAlpha('#7b1fa2', alpha * phaseAlpha)
            : this.colorWithAlpha('#aa00ff', alpha * phaseAlpha * 0.4);
          ctx.shadowColor = '#7b1fa2';
          ctx.shadowBlur = solid ? 15 : 5;
          ctx.lineWidth = solid ? 1.5 : 0.8;

          const shoulderX = cx + side * bodyW;
          const shoulderY = bodyTop + (bodyBot - bodyTop) * (0.1 + (a % 3) * 0.12);

          const elbowX = shoulderX + side * sW * (0.15 + Math.sin(armPhase) * 0.05);
          const elbowY = shoulderY + (bodyBot - bodyTop) * 0.3;

          // Reaching toward player when chasing
          const reachX = isChase
            ? elbowX + side * sW * 0.1 + Math.sin(armPhase * 2) * sW * 0.08
            : elbowX + Math.sin(armPhase * 1.5) * sW * 0.06;
          const reachY = isChase
            ? elbowY + sH * 0.15 + Math.sin(armPhase * 1.8) * sH * 0.05
            : elbowY + sH * 0.05;

          ctx.beginPath();
          ctx.moveTo(shoulderX, shoulderY);
          ctx.lineTo(elbowX, elbowY);
          ctx.lineTo(reachX, reachY);
          ctx.stroke();

          // Reaching fingers
          if (detailLevel >= 2 && solid) {
            ctx.lineWidth = 0.8;
            for (let f = 0; f < 4; f++) {
              const fAngle = side * (-0.3 + f * 0.2) + Math.sin(armPhase * 2 + f) * 0.1;
              const fLen = sW * 0.08;
              ctx.beginPath();
              ctx.moveTo(reachX, reachY);
              ctx.lineTo(reachX + Math.cos(fAngle + Math.PI * (side > 0 ? 0 : 1)) * fLen, reachY + Math.sin(fAngle) * fLen + fLen * 0.5);
              ctx.stroke();
            }
          }
        }

        // -- Wispy trail below (no legs) --
        ctx.strokeStyle = this.colorWithAlpha('#aa00ff', alpha * 0.3);
        ctx.shadowColor = '#aa00ff';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 1;

        const wispBotY = baseY + sH * 0.85;
        for (let w = 0; w < 3; w++) {
          const wOff = (w - 1) * bodyW * 0.4;
          ctx.beginPath();
          ctx.moveTo(cx + wOff, bodyBot);
          ctx.quadraticCurveTo(
            cx + wOff + Math.sin(anim * 1.5 + w * 2) * sW * 0.06,
            (bodyBot + wispBotY) / 2,
            cx + wOff + Math.sin(anim * 2 + w * 3) * sW * 0.08,
            wispBotY
          );
          ctx.stroke();
        }

        // -- Teleporting: body SHATTERS into particles --
        if (entity.isTeleporting) {
          const shatterAlpha = alpha * 0.6;
          for (let sp = 0; sp < 20; sp++) {
            const spAngle = sp * (Math.PI * 2 / 20) + anim * 3;
            const spRadius = sW * 0.3 + Math.sin(anim * 5 + sp * 2) * sW * 0.2;
            const spX = cx + Math.cos(spAngle) * spRadius;
            const spY = baseY + sH * 0.3 + Math.sin(spAngle * 0.5 + sp) * sH * 0.2;
            ctx.fillStyle = this.colorWithAlpha('#aa00ff', shatterAlpha * (0.3 + Math.random() * 0.7));
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(spX, spY, 1 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // -- Inner core glow --
        const corePulse = 0.2 + Math.sin(anim * 2) * 0.1 + chaseFactor * 0.25;
        ctx.fillStyle = this.colorWithAlpha('#7b1fa2', alpha * corePulse * 0.15);
        ctx.shadowColor = '#7b1fa2';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.ellipse(cx, (bodyTop + bodyBot) / 2, bodyW * 0.4, (bodyBot - bodyTop) * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Record afterimage for moving entities
      if (entity.state === 'chase' || entity.state === 'investigate') {
        this.entityAfterimages.push({
          entityId: entity.id,
          x: screenX,
          y: drawY,
          spriteHeight,
          spriteWidth,
          type: entity.type,
          color: entityColor,
          alpha: alpha * 0.4,
          time: now,
        });
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Clean old afterimages (older than 300ms)
    this.entityAfterimages = this.entityAfterimages.filter(a => now - a.time < 300);
  }

  // ---- Entity proximity effects (vignette, distortion, afterimages, death cracks) ----

  private renderEntityEffects(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const now = performance.now();
    const p = this.player;

    // Find closest entity distance
    let closestDist = Infinity;
    let closestType: EnemyType | null = null;
    let isKilling = false;

    for (const entity of this.entities) {
      const dx = entity.pos.x - p.pos.x;
      const dy = entity.pos.y - p.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closestDist = d;
        closestType = entity.type;
      }
      if (entity.killTimer > 0) isKilling = true;
    }

    // 1. Afterimage trails
    for (const after of this.entityAfterimages) {
      const age = now - after.time;
      const fadeAlpha = after.alpha * (1 - age / 300);
      if (fadeAlpha < 0.01) continue;

      ctx.save();
      ctx.globalAlpha = fadeAlpha;
      ctx.strokeStyle = after.color;
      ctx.shadowColor = after.color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1;

      // Simple ghostly silhouette
      const cx = after.x;
      const sH = after.spriteHeight;
      const sW = after.spriteWidth;
      const baseY = after.y;

      if (after.type === 'stalker') {
        // Tall thin shape
        ctx.beginPath();
        ctx.ellipse(cx, baseY + sH * 0.1, sW * 0.08, sH * 0.12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, baseY + sH * 0.22);
        ctx.lineTo(cx, baseY + sH * 0.55);
        ctx.stroke();
      } else if (after.type === 'hunter') {
        // Low wide shape
        ctx.beginPath();
        ctx.ellipse(cx, baseY + sH * 0.4, sW * 0.2, sH * 0.1, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (after.type === 'phantom') {
        // Floating shape with particles
        ctx.beginPath();
        ctx.ellipse(cx, baseY + sH * 0.3, sW * 0.1, sH * 0.15, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const px = cx + Math.sin(now * 0.01 + i * 3) * sW * 0.2;
          const py = baseY + sH * 0.3 + Math.cos(now * 0.01 + i * 2) * sH * 0.15;
          ctx.beginPath();
          ctx.arc(px, py, 1, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // 2. Vignette darkening when entity is close
    if (closestDist < 5 && closestType) {
      const vignetteIntensity = Math.max(0, 1 - closestDist / 5) * 0.5;
      const typeColor = closestType === 'stalker' ? '#8b0000' : closestType === 'hunter' ? '#3e2000' : '#2a0040';
      const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.55);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, this.colorWithAlpha(typeColor, vignetteIntensity * 0.3));
      grad.addColorStop(1, this.colorWithAlpha(typeColor, vignetteIntensity * 0.7));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // 3. Screen distortion when entity is very close
    if (closestDist < 2.5 && closestDist > 0.3) {
      const distortIntensity = Math.max(0, 1 - closestDist / 2.5);
      const now2 = performance.now();
      try {
        // Shift random scan lines
        const lineCount = Math.floor(distortIntensity * 8);
        for (let i = 0; i < lineCount; i++) {
          const y = Math.floor(Math.random() * h);
          const stripH = Math.max(1, Math.floor(Math.random() * 5 * distortIntensity));
          const offset = Math.floor((Math.random() - 0.5) * 20 * distortIntensity);
          const imgData = ctx.getImageData(0, y, w, stripH);
          ctx.putImageData(imgData, offset, y);
        }
        // Static noise burst
        if (distortIntensity > 0.3) {
          const noiseCount = Math.floor(distortIntensity * 30);
          const noiseColor = closestType === 'stalker' ? '#ff1744' : closestType === 'hunter' ? '#ff6d00' : '#aa00ff';
          ctx.fillStyle = this.colorWithAlpha(noiseColor, distortIntensity * 0.06);
          for (let n = 0; n < noiseCount; n++) {
            ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 4, 1);
          }
        }
      } catch {
        // Ignore canvas security errors
      }
    }

    // 4. Screen CRACKS when entity kills the player
    if (isKilling) {
      const crackAlpha = 0.8;
      ctx.strokeStyle = this.colorWithAlpha('#ff0000', crackAlpha);
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 15;
      ctx.lineWidth = 2;

      // Generate fracture lines from center
      const centerX = w / 2;
      const centerY = h / 2;
      const crackCount = 7;
      for (let c = 0; c < crackCount; c++) {
        const baseAngle = (c / crackCount) * Math.PI * 2 + now * 0.0001;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        let cx2 = centerX;
        let cy2 = centerY;
        const crackLen = Math.min(w, h) * (0.2 + Math.random() * 0.3);
        const segments = 4 + Math.floor(Math.random() * 3);
        for (let s = 0; s < segments; s++) {
          const segAngle = baseAngle + (Math.random() - 0.5) * 0.5;
          const segLen = crackLen / segments;
          cx2 += Math.cos(segAngle) * segLen;
          cy2 += Math.sin(segAngle) * segLen;
          ctx.lineTo(cx2, cy2);
        }
        ctx.stroke();

        // Branch cracks
        if (Math.random() > 0.4) {
          const branchAngle = baseAngle + (Math.random() - 0.5) * 1.2;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx2, cy2);
          ctx.lineTo(
            cx2 + Math.cos(branchAngle) * crackLen * 0.3,
            cy2 + Math.sin(branchAngle) * crackLen * 0.3
          );
          ctx.stroke();
          ctx.lineWidth = 2;
        }
      }

      // Red flash overlay
      ctx.fillStyle = this.colorWithAlpha('#ff0000', 0.08 + Math.sin(now * 0.01) * 0.04);
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---- Pulse wave visual ----

  private renderPulseWave(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const now = performance.now();

    for (const pulse of this.pulses) {
      const elapsed = now - pulse.startTime;
      if (elapsed > pulse.duration) continue;

      const progress = elapsed / pulse.duration;
      const radius = pulse.radius * progress;
      const fadeOut = 1 - progress;

      const screenRadius = (radius / 20) * Math.min(w, h);
      const alpha = fadeOut * pulse.intensity * 0.12;

      if (alpha > 0.005 && screenRadius < Math.max(w, h)) {
        ctx.strokeStyle = this.colorWithAlpha(NEON_COLORS.pulse, alpha);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, screenRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = this.colorWithAlpha(NEON_COLORS.pulse, alpha * 0.4);
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, screenRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // ---- Breath effect ----

  private renderBreathEffect(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.player.isMoving && this.profile.headBob) {
      const bob = Math.sin(this.breathPhase * 3) * 1.5;
      ctx.translate(0, bob);
    }

    const breathIntensity = 0.25 + Math.sin(this.breathPhase) * 0.04;
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.7);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${breathIntensity})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  // ---- Glitch effect ----

  private renderGlitch(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const intensity = this.glitchIntensity;

    if (!this.profile.screenShake && intensity < 0.5) return;

    // Scan lines
    ctx.fillStyle = `rgba(0,0,0,${intensity * 0.25})`;
    for (let y = 0; y < h; y += 3) {
      if (Math.random() < intensity * 0.4) {
        ctx.fillRect(0, y, w, 1);
      }
    }

    // Horizontal glitch strips
    if (Math.random() < intensity * 0.25) {
      const y = Math.random() * h;
      const stripH = Math.max(1, Math.random() * 20 * intensity);
      const offset = (Math.random() - 0.5) * 30 * intensity;
      try {
        const imgData = ctx.getImageData(0, Math.floor(y), w, Math.ceil(stripH));
        ctx.putImageData(imgData, Math.floor(offset), Math.floor(y));
      } catch {
        // Ignore cross-origin errors
      }
    }

    // Static noise
    if (intensity > 0.2) {
      const noiseCount = Math.floor(intensity * 40);
      ctx.fillStyle = `rgba(255,255,255,${intensity * 0.08})`;
      for (let i = 0; i < noiseCount; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 3, 1);
      }
    }

    // Red tint for high danger
    if (intensity > 0.4) {
      ctx.fillStyle = `rgba(255,0,0,${(intensity - 0.4) * 0.08})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---- Vignette ----

  private renderVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.65);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  // ============================================================
  // HUD rendering
  // ============================================================

  private renderHUD(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const p = this.player;

    // Crosshair (extracted to also work in hardcore mode)
    this.renderCrosshair(ctx, w, h);

    // Health bar (top left)
    const hbW = 120;
    const hbH = 8;
    const hbX = 16;
    const hbY = 16;
    const healthPct = p.health / p.maxHealth;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(hbX - 2, hbY - 2, hbW + 4, hbH + 4);

    const healthColor = healthPct > 0.5 ? '#00e5ff' : healthPct > 0.25 ? '#ffab00' : '#ff1744';
    ctx.fillStyle = healthColor;
    ctx.fillRect(hbX, hbY, hbW * healthPct, hbH);

    ctx.strokeStyle = this.colorWithAlpha(healthColor, 0.4);
    ctx.lineWidth = 1;
    ctx.strokeRect(hbX - 1, hbY - 1, hbW + 2, hbH + 2);

    // Health label
    ctx.fillStyle = healthColor;
    ctx.font = '10px monospace';
    ctx.fillText(`HP ${Math.ceil(p.health)}`, hbX, hbY + hbH + 14);

    // Pulse cooldown bar (bottom center)
    const pbW = 160;
    const pbH = 6;
    const pbX = (w - pbW) / 2;
    const pbY = h - 40;
    const pulsePct = 1 - Math.max(0, this.pulseCooldownTimer) / this.diffConfig.pulseCooldown;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(pbX - 2, pbY - 2, pbW + 4, pbH + 4);

    const pulseColor = pulsePct >= 1 ? NEON_COLORS.pulse : '#006064';
    ctx.fillStyle = pulseColor;
    ctx.fillRect(pbX, pbY, pbW * pulsePct, pbH);

    ctx.strokeStyle = this.colorWithAlpha(NEON_COLORS.pulse, 0.3);
    ctx.lineWidth = 1;
    ctx.strokeRect(pbX - 1, pbY - 1, pbW + 2, pbH + 2);

    ctx.fillStyle = this.colorWithAlpha(NEON_COLORS.pulse, 0.6);
    ctx.font = '10px monospace';
    ctx.fillText(pulsePct >= 1 ? 'ECO LISTO' : 'RECARGANDO...', pbX, pbY + pbH + 14);

    // Flashlight battery (top right)
    if (p.inventory.some(s => s.item.id === 'flashlight') || p.flashlightOn) {
      const fbW = 80;
      const fbH = 8;
      const fbX = w - fbW - 16;
      const fbY = 16;
      const battPct = p.flashlightBattery / p.maxFlashlightBattery;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(fbX - 2, fbY - 2, fbW + 4, fbH + 4);

      const battColor = p.flashlightOn ? NEON_COLORS.flashlight : '#5d4037';
      ctx.fillStyle = battColor;
      ctx.fillRect(fbX, fbY, fbW * battPct, fbH);

      ctx.strokeStyle = this.colorWithAlpha(NEON_COLORS.flashlight, 0.3);
      ctx.lineWidth = 1;
      ctx.strokeRect(fbX - 1, fbY - 1, fbW + 2, fbH + 2);

      ctx.fillStyle = this.colorWithAlpha(NEON_COLORS.flashlight, 0.6);
      ctx.font = '10px monospace';
      ctx.fillText(
        p.flashlightOn ? `🔦 ${Math.ceil(p.flashlightBattery)}%` : `🔋 ${Math.ceil(p.flashlightBattery)}%`,
        fbX, fbY + fbH + 14
      );
    }

    // Inventory bar (bottom)
    const invSlotSize = 36;
    const invGap = 4;
    const invTotalW = p.inventorySize * (invSlotSize + invGap) - invGap;
    const invStartX = (w - invTotalW) / 2;
    const invY = h - 90;

    for (let i = 0; i < p.inventorySize; i++) {
      const sx = invStartX + i * (invSlotSize + invGap);
      const isSelected = i === p.selectedSlot;

      ctx.fillStyle = isSelected ? 'rgba(0,229,255,0.15)' : 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx, invY, invSlotSize, invSlotSize);

      ctx.strokeStyle = isSelected ? NEON_COLORS.pulse : 'rgba(0,229,255,0.2)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(sx, invY, invSlotSize, invSlotSize);

      // Slot number
      ctx.fillStyle = 'rgba(0,229,255,0.3)';
      ctx.font = '9px monospace';
      ctx.fillText(`${i + 1}`, sx + 3, invY + 10);

      // Item icon
      if (i < p.inventory.length) {
        const slot = p.inventory[i];
        ctx.font = '18px sans-serif';
        ctx.fillText(slot.item.icon, sx + invSlotSize / 2 - 9, invY + invSlotSize / 2 + 6);

        // Stack count
        if (slot.count > 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '9px monospace';
          ctx.fillText(`x${slot.count}`, sx + invSlotSize - 18, invY + invSlotSize - 4);
        }
      }
    }

    // Selected item name
    if (p.selectedSlot < p.inventory.length) {
      const slot = p.inventory[p.selectedSlot];
      ctx.fillStyle = this.colorWithAlpha(NEON_COLORS.item, 0.8);
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(slot.item.name, w / 2, invY - 8);
      ctx.textAlign = 'left';
    }

    // Compass to exit
    if (this.advanced.showCompass && this.map) {
      const exitDir = Math.atan2(
        this.map.exitPos.y - p.pos.y,
        this.map.exitPos.x - p.pos.x
      ) - p.dir;

      let normDir = exitDir;
      while (normDir > Math.PI) normDir -= 2 * Math.PI;
      while (normDir < -Math.PI) normDir += 2 * Math.PI;

      const exitDist = this.dist(p.pos, this.map.exitPos);
      const compassX = w / 2;
      const compassY = 50;

      ctx.save();
      ctx.translate(compassX, compassY);
      ctx.rotate(normDir);

      // Arrow pointing to exit
      ctx.strokeStyle = this.colorWithAlpha(NEON_COLORS.exit, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -8);
      ctx.lineTo(-4, -3);
      ctx.moveTo(0, -8);
      ctx.lineTo(4, -3);
      ctx.stroke();

      ctx.restore();

      ctx.fillStyle = this.colorWithAlpha(NEON_COLORS.exit, 0.4);
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(exitDist)}m`, compassX, compassY + 20);
      ctx.textAlign = 'left';
    }

    // Danger indicator
    if (this.advanced.showDangerIndicator && this.closestEntityDist < 8) {
      const dangerAlpha = Math.min(0.6, (8 - this.closestEntityDist) / 8 * 0.6);
      const pulse = Math.sin(performance.now() / 200) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,23,68,${dangerAlpha * pulse * 0.15})`;
      ctx.fillRect(0, 0, w, h);

      // Warning text
      if (this.closestEntityDist < 4) {
        ctx.fillStyle = `rgba(255,23,68,${dangerAlpha * pulse})`;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚠ PELIGRO', w / 2, h - 110);
        ctx.textAlign = 'left';
      }
    }

    // FPS counter
    if (this.advanced.showFPS) {
      ctx.fillStyle = 'rgba(0,229,255,0.5)';
      ctx.font = '10px monospace';
      ctx.fillText(`${this.fps} FPS`, w - 60, h - 10);
    }

    // Sneak indicator
    if (p.isSneaking) {
      ctx.fillStyle = this.colorWithAlpha('#004d40', 0.7);
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🔇 SIGILO', w / 2, h - 55);
      ctx.textAlign = 'left';
    }
  }

  // ============================================================
  // Screen rendering
  // ============================================================

  private renderDeathScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Dark red background
    ctx.fillStyle = 'rgba(20,0,0,0.9)';
    ctx.fillRect(0, 0, w, h);

    // Static noise
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(255,0,0,${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 4, 1);
    }

    // Scan lines
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }

    // Death text
    ctx.save();
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ff1744';
    ctx.font = `bold ${Math.min(48, w / 12)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('HAS MUERTO', w / 2, h / 2 - 20);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,23,68,0.5)';
    ctx.font = `${Math.min(16, w / 40)}px monospace`;
    ctx.fillText('La oscuridad te ha consumido', w / 2, h / 2 + 20);

    ctx.fillStyle = 'rgba(255,23,68,0.4)';
    ctx.font = `${Math.min(14, w / 50)}px monospace`;
    ctx.fillText('Presiona R para reintentar', w / 2, h / 2 + 60);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  private renderWinScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = 'rgba(0,10,0,0.9)';
    ctx.fillRect(0, 0, w, h);

    // Particle effect
    const time = performance.now() / 1000;
    for (let i = 0; i < 30; i++) {
      const px = (Math.sin(time + i * 0.7) * 0.5 + 0.5) * w;
      const py = (Math.cos(time + i * 1.1) * 0.5 + 0.5) * h;
      ctx.fillStyle = `rgba(118,255,3,${0.05 + Math.sin(time + i) * 0.03})`;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const chapter = CHAPTERS.find(c => c.id === this.currentChapter);
    const fontSize = Math.min(14, w / 50);

    ctx.save();
    ctx.shadowColor = NEON_COLORS.exit;
    ctx.shadowBlur = 20;
    ctx.fillStyle = NEON_COLORS.exit;
    ctx.font = `bold ${Math.min(36, w / 14)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('SOBREVIVISTE', w / 2, h / 2 - 120);
    ctx.shadowBlur = 0;

    if (chapter) {
      ctx.fillStyle = 'rgba(118,255,3,0.6)';
      ctx.font = `${fontSize}px monospace`;
      ctx.fillText(chapter.outroText, w / 2, h / 2 - 80);
    }

    // Time display
    const timeSeconds = this.lastCompletionTimeSeconds;
    const mins = Math.floor(timeSeconds / 60);
    const secs = Math.floor(timeSeconds % 60);
    const ms = Math.floor((timeSeconds % 1) * 100);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;

    ctx.fillStyle = '#00e5ff';
    ctx.font = `bold ${Math.min(20, w / 30)}px monospace`;
    ctx.fillText(`⏱ ${timeStr}`, w / 2, h / 2 - 45);

    // Speedrun challenge results
    const challenge = SPEEDRUN_CHALLENGES.find(c => c.chapterId === this.currentChapter);
    if (challenge) {
      const tierColors: Record<string, string> = { gold: '#ffd700', silver: '#c0c0c0', bronze: '#cd7f32' };
      const tierLabels: Record<string, string> = { gold: '🥇 ORO', silver: '🥈 PLATA', bronze: '🥉 BRONCE' };

      // Show time targets
      ctx.fillStyle = 'rgba(0,229,255,0.4)';
      ctx.font = `${Math.min(10, w / 70)}px monospace`;
      ctx.fillText('─ RETOS DE VELOCIDAD ─', w / 2, h / 2 - 22);

      let yOffset = 0;
      for (const reward of challenge.rewards) {
        const achieved = this.lastReward?.tier === reward.tier;
        const targetMins = Math.floor(reward.timeLimitSeconds / 60);
        const targetSecs = reward.timeLimitSeconds % 60;
        const targetStr = `${targetMins}:${targetSecs.toString().padStart(2, '0')}`;

        if (achieved) {
          // This tier was achieved - highlight it
          ctx.fillStyle = tierColors[reward.tier];
          ctx.font = `bold ${Math.min(13, w / 55)}px monospace`;
          ctx.fillText(`${tierLabels[reward.tier]} ✓ ${targetStr} → +${reward.points} pts`, w / 2, h / 2 - 5 + yOffset);

          // Show unlocked character
          ctx.fillStyle = tierColors[reward.tier];
          ctx.font = `bold ${Math.min(15, w / 45)}px monospace`;
          ctx.fillText(`${reward.characterIcon} ${reward.characterName}`, w / 2, h / 2 + 15 + yOffset);

          ctx.fillStyle = `rgba(${reward.tier === 'gold' ? '255,215,0' : reward.tier === 'silver' ? '192,192,192' : '205,127,50'},0.6)`;
          ctx.font = `${Math.min(10, w / 70)}px monospace`;
          ctx.fillText(`"${reward.characterDescription}"`, w / 2, h / 2 + 30 + yOffset);
          yOffset += 55;
        } else {
          // Not achieved
          ctx.fillStyle = 'rgba(100,100,100,0.4)';
          ctx.font = `${Math.min(11, w / 60)}px monospace`;
          ctx.fillText(`${tierLabels[reward.tier]} ✗ ${targetStr} → ${reward.points} pts`, w / 2, h / 2 - 5 + yOffset);
          yOffset += 20;
        }
      }

      // Total points
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${Math.min(14, w / 50)}px monospace`;
      ctx.fillText(`⭐ PUNTOS TOTALES: ${this.totalPoints}`, w / 2, h / 2 + yOffset + 10);
    }

    const nextChapter = this.currentChapter + 1;
    if (nextChapter <= CHAPTERS.length) {
      ctx.fillStyle = 'rgba(118,255,3,0.4)';
      ctx.font = `${fontSize}px monospace`;
      ctx.fillText(`Capítulo ${nextChapter} desbloqueado`, w / 2, h - 80);
    }

    ctx.fillStyle = 'rgba(118,255,3,0.5)';
    ctx.font = `${fontSize}px monospace`;
    ctx.fillText('Presiona R para continuar', w / 2, h - 50);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  private renderPausedScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.shadowColor = NEON_COLORS.pulse;
    ctx.shadowBlur = 20;
    ctx.fillStyle = NEON_COLORS.pulse;
    ctx.font = `bold ${Math.min(40, w / 14)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSA', w / 2, h / 2 - 10);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(0,229,255,0.4)';
    ctx.font = `${Math.min(14, w / 50)}px monospace`;
    ctx.fillText('Presiona ESC para continuar', w / 2, h / 2 + 30);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  private renderChapterIntro(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Dark background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Scan lines
    ctx.fillStyle = 'rgba(0,229,255,0.02)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 2);
    }

    const chapter = CHAPTERS.find(c => c.id === this.currentChapter);
    if (!chapter) return;

    // Fade in effect
    const fadeAlpha = Math.min(1, this.introTimer / 2);

    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    // Chapter subtitle
    ctx.fillStyle = 'rgba(0,229,255,0.4)';
    ctx.font = `${Math.min(14, w / 50)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(chapter.subtitle, w / 2, h / 2 - 80);

    // Chapter name
    ctx.shadowColor = NEON_COLORS.pulse;
    ctx.shadowBlur = 20;
    ctx.fillStyle = NEON_COLORS.pulse;
    ctx.font = `bold ${Math.min(36, w / 14)}px monospace`;
    ctx.fillText(chapter.name, w / 2, h / 2 - 40);
    ctx.shadowBlur = 0;

    // Intro text
    ctx.fillStyle = 'rgba(0,229,255,0.6)';
    ctx.font = `${Math.min(14, w / 50)}px monospace`;
    ctx.fillText(chapter.introText, w / 2, h / 2 + 10);

    // Enemy info
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${Math.min(11, w / 60)}px monospace`;
    let enemyY = h / 2 + 50;
    for (const enemyDef of chapter.enemies) {
      const template = ENEMY_TEMPLATES[enemyDef.type];
      ctx.fillStyle = this.colorWithAlpha(template.color, 0.5);
      ctx.fillText(`${template.name} x${enemyDef.count}`, w / 2, enemyY);
      enemyY += 18;
    }

    // Difficulty
    const diffLabel = DIFFICULTY_CONFIGS[this.difficulty].label;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `${Math.min(11, w / 60)}px monospace`;
    ctx.fillText(`Dificultad: ${diffLabel}`, w / 2, enemyY + 15);

    // Start prompt
    if (this.introTimer > 1.5) {
      const promptPulse = Math.sin(performance.now() / 400) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(0,229,255,${0.5 * promptPulse})`;
      ctx.font = `${Math.min(13, w / 50)}px monospace`;
      ctx.fillText('Presiona ESPACIO para comenzar', w / 2, h / 2 + 140);
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ============================================================
  // Utility methods
  // ============================================================

  private dist(a: Vec2, b: Vec2): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  private colorWithAlpha(hex: string, alpha: number): string {
    // Handle hex colors
    if (hex.startsWith('#')) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    // Already rgba
    if (hex.startsWith('rgba')) {
      return hex.replace(/[\d.]+\)$/, `${alpha})`);
    }
    // Fallback
    return hex;
  }

  // ============================================================
  // Public API
  // ============================================================

  setControl(action: string, key: string) {
    const binding = this.controls.find(c => c.action === action);
    if (binding) {
      binding.key = key;
    }
  }

  setProfile(settings: Partial<ProfileSettings>) {
    this.profile = { ...this.profile, ...settings };
  }

  setAdvanced(settings: Partial<AdvancedSettings>) {
    this.advanced = { ...this.advanced, ...settings };
  }

  // ============================================================
  // Hardcore mode rendering
  // ============================================================

  private renderHardcoreVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Red pulsing vignette synced with heartbeat
    const heartPulse = Math.sin(performance.now() / (60000 / (60 + this.closestEntityDist < 4 ? 140 : 80))) * 0.5 + 0.5;
    const alpha = 0.08 + heartPulse * 0.12;

    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, `rgba(80,0,0,${alpha * 0.3})`);
    grad.addColorStop(1, `rgba(120,0,0,${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  private renderPermanentDeathScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Deep black with red tinge
    ctx.fillStyle = 'rgba(10,0,0,0.95)';
    ctx.fillRect(0, 0, w, h);

    // Heavy static noise
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(255,0,0,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 3, 1);
    }

    // Scan lines
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let y = 0; y < h; y += 2) {
      ctx.fillRect(0, y, w, 1);
    }

    const elapsed = (performance.now() - this.deathTimer) / 1000;
    const fadeIn = Math.min(1, elapsed / 2);

    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ff1744';
    ctx.font = `bold ${Math.min(40, w / 14)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('MUERTE PERMANENTE', w / 2, h / 2 - 40);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,23,68,0.6)';
    ctx.font = `${Math.min(18, w / 35)}px monospace`;
    ctx.fillText('EL SILENCIO ABSOLUTO TE CONSUMIÓ', w / 2, h / 2 + 10);

    ctx.fillStyle = 'rgba(255,23,68,0.3)';
    ctx.font = `${Math.min(13, w / 50)}px monospace`;
    ctx.fillText('Todo el progreso se ha perdido', w / 2, h / 2 + 50);

    ctx.fillStyle = 'rgba(100,0,0,0.5)';
    ctx.font = `${Math.min(12, w / 55)}px monospace`;
    ctx.fillText('Pulsa ESC para volver al menú', w / 2, h / 2 + 90);

    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ============================================================
  // Co-op rendering methods
  // ============================================================

  /** Ear role: top-down minimap view of entire level */
  private renderEarView(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.map) return;

    // Fill background
    ctx.fillStyle = 'rgba(0,5,10,0.95)';
    ctx.fillRect(0, 0, w, h);

    const mapW = this.map.width;
    const mapH = this.map.height;
    const padding = 40;
    const availW = w - padding * 2;
    const availH = h - padding * 2 - 60; // Leave room for title
    const cellSize = Math.min(availW / mapW, availH / mapH);
    const offsetX = (w - mapW * cellSize) / 2;
    const offsetY = (h - mapH * cellSize) / 2 + 20;

    // Title
    ctx.fillStyle = 'rgba(0,229,255,0.7)';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MAPA COMPLETO — MODO OÍDO', w / 2, offsetY - 10);
    ctx.textAlign = 'left';

    // Draw map cells
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const cell = this.map.cells[y][x];
        const cx = offsetX + x * cellSize;
        const cy = offsetY + y * cellSize;

        if (cell === 1) {
          // Wall - faint outline
          ctx.strokeStyle = 'rgba(0,229,255,0.1)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cx, cy, cellSize, cellSize);
        } else if (cell === 0) {
          // Empty - dark floor
          ctx.fillStyle = 'rgba(0,229,255,0.02)';
          ctx.fillRect(cx, cy, cellSize, cellSize);
        } else if (cell === 2) {
          // Exit - green
          ctx.fillStyle = 'rgba(118,255,3,0.6)';
          ctx.fillRect(cx, cy, cellSize, cellSize);
        } else if (cell === 3) {
          // Door
          ctx.fillStyle = 'rgba(255,171,0,0.3)';
          ctx.fillRect(cx, cy, cellSize, cellSize);
        }
      }
    }

    // Draw walls as neon outlines
    ctx.strokeStyle = 'rgba(0,229,255,0.3)';
    ctx.lineWidth = 1;
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        if (this.map.cells[y][x] === 1) {
          // Check each side for boundary with empty space
          const cx = offsetX + x * cellSize;
          const cy = offsetY + y * cellSize;
          // Top
          if (y > 0 && this.map.cells[y - 1][x] !== 1) {
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + cellSize, cy); ctx.stroke();
          }
          // Bottom
          if (y < mapH - 1 && this.map.cells[y + 1][x] !== 1) {
            ctx.beginPath(); ctx.moveTo(cx, cy + cellSize); ctx.lineTo(cx + cellSize, cy + cellSize); ctx.stroke();
          }
          // Left
          if (x > 0 && this.map.cells[y][x - 1] !== 1) {
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + cellSize); ctx.stroke();
          }
          // Right
          if (x < mapW - 1 && this.map.cells[y][x + 1] !== 1) {
            ctx.beginPath(); ctx.moveTo(cx + cellSize, cy); ctx.lineTo(cx + cellSize, cy + cellSize); ctx.stroke();
          }
        }
      }
    }

    // Draw items as yellow dots
    for (const item of this.map.items) {
      const ix = offsetX + item.pos.x * cellSize;
      const iy = offsetY + item.pos.y * cellSize;
      ctx.fillStyle = 'rgba(255,214,0,0.7)';
      ctx.beginPath();
      ctx.arc(ix, iy, cellSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw exit as green dot
    const ex = offsetX + this.map.exitPos.x * cellSize;
    const ey = offsetY + this.map.exitPos.y * cellSize;
    ctx.fillStyle = 'rgba(118,255,3,0.9)';
    ctx.beginPath();
    ctx.arc(ex, ey, cellSize * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(118,255,3,0.5)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SALIDA', ex, ey + cellSize * 0.5 + 10);
    ctx.textAlign = 'left';

    // Draw player (body) as cyan dot
    if (this.player) {
      const px = offsetX + this.player.pos.x * cellSize;
      const py = offsetY + this.player.pos.y * cellSize;
      ctx.fillStyle = 'rgba(0,229,255,0.9)';
      ctx.beginPath();
      ctx.arc(px, py, cellSize * 0.6, 0, Math.PI * 2);
      ctx.fill();
      // Direction indicator
      const dirLen = cellSize * 1.5;
      ctx.strokeStyle = 'rgba(0,229,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(this.player.dir) * dirLen, py + Math.sin(this.player.dir) * dirLen);
      ctx.stroke();
    }

    // Draw entities as colored dots (based on type)
    for (const entity of this.entities) {
      const ex2 = offsetX + entity.pos.x * cellSize;
      const ey2 = offsetY + entity.pos.y * cellSize;
      let color: string;
      switch (entity.type) {
        case 'stalker': color = 'rgba(255,23,68,0.8)'; break;
        case 'hunter': color = 'rgba(255,109,0,0.8)'; break;
        case 'phantom': color = 'rgba(170,0,255,0.8)'; break;
        default: color = 'rgba(255,0,0,0.6)';
      }
      const pulse = entity.state === 'chase' ? (Math.sin(performance.now() / 150) * 0.3 + 0.7) : 0.7;
      ctx.fillStyle = color;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(ex2, ey2, cellSize * (entity.state === 'chase' ? 0.7 : 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw ping markers
    const now = performance.now();
    for (const ping of this.pingMarkers) {
      const age = (now - ping.time) / 1000;
      if (age > 15) continue; // Pings last 15 seconds
      const alpha = Math.max(0.2, 1 - age / 15);
      const px2 = offsetX + ping.pos.x * cellSize;
      const py2 = offsetY + ping.pos.y * cellSize;
      ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
      ctx.lineWidth = 2;
      const r = cellSize * 1.5 + age * cellSize * 2;
      ctx.beginPath();
      ctx.arc(px2, py2, r, 0, Math.PI * 2);
      ctx.stroke();
      // Center dot
      ctx.fillStyle = `rgba(0,229,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(px2, py2, cellSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Legend
    ctx.fillStyle = 'rgba(0,229,255,0.4)';
    ctx.font = '9px monospace';
    const legendY = h - 15;
    ctx.fillText('● Tú (Cuerpo)', offsetX, legendY);
    ctx.fillStyle = 'rgba(255,23,68,0.5)';
    ctx.fillText('● Acechador', offsetX + 100, legendY);
    ctx.fillStyle = 'rgba(255,109,0,0.5)';
    ctx.fillText('● Cazador', offsetX + 200, legendY);
    ctx.fillStyle = 'rgba(170,0,255,0.5)';
    ctx.fillText('● Fantasma', offsetX + 290, legendY);
    ctx.fillStyle = 'rgba(118,255,3,0.5)';
    ctx.fillText('● Salida', offsetX + 380, legendY);
    ctx.fillStyle = 'rgba(255,214,0,0.5)';
    ctx.fillText('● Objeto', offsetX + 450, legendY);
  }

  /** Body role: render ping markers as directional arrows at screen edge */
  private renderPingArrows(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const now = performance.now();
    for (const ping of this.pingMarkers) {
      const age = (now - ping.time) / 1000;
      if (age > 15) continue;
      const alpha = Math.max(0.3, 1 - age / 15);

      // Calculate angle from player to ping
      const angle = Math.atan2(ping.pos.y - this.player.pos.y, ping.pos.x - this.player.pos.x) - this.player.dir;
      const dist = this.dist(this.player.pos, ping.pos);

      // Normalize angle to -PI to PI
      let normAngle = angle;
      while (normAngle > Math.PI) normAngle -= 2 * Math.PI;
      while (normAngle < -Math.PI) normAngle += 2 * Math.PI;

      // Position arrow at edge of screen
      const edgeMargin = 60;
      const arrowX = w / 2 + Math.sin(normAngle) * (w / 2 - edgeMargin);
      const arrowY = h / 2 - Math.cos(normAngle) * (h / 2 - edgeMargin);
      const clampedX = Math.max(edgeMargin, Math.min(w - edgeMargin, arrowX));
      const clampedY = Math.max(edgeMargin, Math.min(h - edgeMargin, arrowY));

      // Pulsing glow
      const pulse = Math.sin(now / 300 + ping.id) * 0.3 + 0.7;

      ctx.save();
      ctx.translate(clampedX, clampedY);
      ctx.rotate(normAngle);

      // Arrow pointing toward ping
      ctx.fillStyle = `rgba(0,229,255,${alpha * pulse})`;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -8);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();

      // Distance text
      ctx.fillStyle = `rgba(0,229,255,${alpha * 0.6})`;
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(dist)}m`, 0, 20);
      ctx.textAlign = 'left';

      ctx.restore();
    }
  }

  // ============================================================
  // Microphone indicator rendering
  // ============================================================

  // ---- Crosshair (standalone for hardcore mode) ----

  private renderCrosshair(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.profile.crosshairStyle === 'none') return;
    ctx.save();
    const cx = w / 2;
    const cy = h / 2;
    const size = this.profile.crosshairSize;
    ctx.strokeStyle = this.profile.crosshairColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    if (this.profile.crosshairStyle === 'dot') {
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.profile.crosshairStyle === 'cross') {
      ctx.beginPath();
      ctx.moveTo(cx - size, cy);
      ctx.lineTo(cx + size, cy);
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx, cy + size);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- Hardcore indicator (small skull icon) ----

  private renderHardcoreIndicator(ctx: CanvasRenderingContext2D, w: number, _h: number) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,23,68,0.5)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('☠ HC', w - 16, 20);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  private renderMicIndicator(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const x = w - 100;
    const y = this.hardcoreMode ? 16 : 40;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 4, y - 2, 90, 18);

    // Label
    ctx.fillStyle = this.micNoiseLevel > this.micNoiseThreshold ? '#ff1744' : '#00e5ff';
    ctx.font = '10px monospace';
    ctx.fillText('🎤 MIC ACTIVO', x, y + 10);

    // Noise level bar
    if (this.micNoiseLevel > 0.01) {
      const barW = 80;
      const barH = 3;
      const barX = x;
      const barY = y + 14;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      const color = this.micNoiseLevel > 0.7 ? '#ff1744' : this.micNoiseLevel > 0.3 ? '#ffab00' : '#00e5ff';
      ctx.fillStyle = color;
      ctx.fillRect(barX, barY, barW * Math.min(1, this.micNoiseLevel), barH);
    }
  }

  // ============================================================
  // Co-op ping method
  // ============================================================

  placePing(worldPos: Vec2) {
    if (this.pingMarkers.length >= 3) {
      // Remove oldest
      this.pingMarkers.shift();
    }
    this.pingMarkers.push({
      pos: { ...worldPos },
      time: performance.now(),
      id: this.nextPingId++,
    });
    // Play subtle audio cue for body player
    this.audio.playPickup();
  }

  // ============================================================
  // Microphone integration
  // ============================================================

  async enableMicrophone(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      this.micAudioCtx = new AudioContext();
      const source = this.micAudioCtx.createMediaStreamSource(stream);
      this.micAnalyser = this.micAudioCtx.createAnalyser();
      this.micAnalyser.fftSize = 256;
      source.connect(this.micAnalyser);
      this.micEnabled = true;
      return true;
    } catch {
      console.warn('Microphone access denied or unavailable');
      this.micEnabled = false;
      return false;
    }
  }

  disableMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.micAudioCtx) {
      this.micAudioCtx.close();
      this.micAudioCtx = null;
    }
    this.micAnalyser = null;
    this.micEnabled = false;
    this.micNoiseLevel = 0;
  }

  private updateMicrophone() {
    if (!this.micEnabled || !this.micAnalyser) return;

    const dataArray = new Uint8Array(this.micAnalyser.frequencyBinCount);
    this.micAnalyser.getByteFrequencyData(dataArray);

    // Calculate RMS volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = dataArray[i] / 255;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    this.micNoiseLevel = rms * this.micSensitivity;

    // Threshold-based sound event creation
    if (this.micNoiseLevel > this.micNoiseThreshold && this.player) {
      const volume = Math.min(1, this.micNoiseLevel);
      const radius = 5 + volume * 15;
      this.addSoundEvent(this.player.pos, volume, radius);

      // Scream detection (very loud) - alert all entities
      if (this.micNoiseLevel > 0.7) {
        this.addSoundEvent(this.player.pos, 1.0, 25);
        // Small illumination pulse from scream
        this.illuminateArea(this.player.pos, 4, 0.4 * volume, NEON_COLORS.pulse);
        this.pulses.push({
          origin: { ...this.player.pos },
          radius: 6,
          startTime: performance.now(),
          duration: 300,
          intensity: 0.3 * volume,
        });
      } else if (this.micNoiseLevel > 0.5) {
        // Moderate noise - small echo pulse
        this.illuminateArea(this.player.pos, 2, 0.2, '#004d40');
      }
    }
  }

  // ============================================================
  // Cinematic rendering
  // ============================================================

  private renderCinematic(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const frame = this.cinematicSequence[this.cinematicIndex];
    if (!frame) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const progress = Math.min(1, this.cinematicTimer / frame.duration);
    const intensity = frame.intensity ?? 1.0;
    const color = frame.color ?? '#00e5ff';

    // Base black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    switch (frame.type) {
      case 'blackout': {
        // Solid black - nothing to render
        break;
      }

      case 'fade_in': {
        // Fade from black: progress 0 = black, 1 = transparent
        // We just set cinematicAlpha for subsequent frames if needed
        // For fade_in, render a black overlay that becomes transparent
        ctx.fillStyle = `rgba(0,0,0,${1 - progress})`;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'fade_out': {
        // Fade to black: progress 0 = transparent, 1 = black
        ctx.fillStyle = `rgba(0,0,0,${progress})`;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'text': {
        // Centered text with glow effect and typewriter reveal
        if (frame.text) {
          const revealCount = Math.floor(frame.text.length * Math.min(1, progress * 1.5));
          const displayText = frame.text.substring(0, revealCount);

          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = 20;
          ctx.fillStyle = color;
          ctx.font = `bold ${Math.min(28, w / 25)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(displayText, w / 2, h / 2);

          // Cursor blink if still typing
          if (revealCount < frame.text.length) {
            const blinkOn = Math.floor(this.cinematicTimer * 4) % 2 === 0;
            if (blinkOn) {
              const textMetrics = ctx.measureText(displayText);
              ctx.fillRect(w / 2 + textMetrics.width / 2 + 4, h / 2 - 10, 2, 20);
            }
          }
          ctx.restore();
        }
        break;
      }

      case 'scanlines': {
        // Animated CRT scanline effect
        const scanIntensity = intensity * (1 - progress * 0.5);
        for (let y = 0; y < h; y += 2) {
          const lineAlpha = scanIntensity * 0.3 * (0.5 + 0.5 * Math.sin(y * 0.1 + this.cinematicTimer * 5));
          ctx.fillStyle = `rgba(0,229,255,${lineAlpha})`;
          ctx.fillRect(0, y, w, 1);
        }
        // Moving scan bar
        const scanBarY = (this.cinematicTimer * 100) % h;
        ctx.fillStyle = `rgba(0,229,255,${0.1 * intensity})`;
        ctx.fillRect(0, scanBarY, w, 40);
        break;
      }

      case 'pulse_wave': {
        // Expanding neon ring from center
        const cx = w / 2;
        const cy = h / 2;
        const maxRadius = Math.sqrt(cx * cx + cy * cy);
        const ringProgress = Math.min(1, progress * 1.5);
        const radius = ringProgress * maxRadius;
        const ringAlpha = (1 - ringProgress) * intensity;

        ctx.save();
        ctx.strokeStyle = this.colorWithAlpha(color, ringAlpha);
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15 * ringAlpha;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Inner glow
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.5);
        grad.addColorStop(0, this.colorWithAlpha(color, ringAlpha * 0.1));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'static': {
        // Random noise/static particles
        const numParticles = Math.floor(200 * intensity);
        for (let i = 0; i < numParticles; i++) {
          const px = Math.random() * w;
          const py = Math.random() * h;
          const size = Math.random() * 3;
          const alpha = Math.random() * 0.3 * intensity;
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fillRect(px, py, size, 1);
        }
        // Scanline overlay
        for (let y = 0; y < h; y += 4) {
          ctx.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.2})`;
          ctx.fillRect(0, y, w, 2);
        }
        break;
      }

      case 'entity_reveal': {
        // Flash of entity-like silhouette with red glow
        const revealAlpha = intensity * Math.sin(progress * Math.PI);
        ctx.save();

        // Red ambient glow
        const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.4);
        grad.addColorStop(0, this.colorWithAlpha('#ff1744', revealAlpha * 0.3));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Entity silhouette (abstract humanoid shape)
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 30 * revealAlpha;
        ctx.strokeStyle = this.colorWithAlpha('#ff1744', revealAlpha * 0.8);
        ctx.lineWidth = 2;

        const cx = w / 2;
        const cy = h / 2 - 20;
        // Head
        ctx.beginPath();
        ctx.arc(cx, cy - 60, 15, 0, Math.PI * 2);
        ctx.stroke();
        // Body
        ctx.beginPath();
        ctx.moveTo(cx, cy - 45);
        ctx.lineTo(cx, cy + 30);
        ctx.stroke();
        // Arms
        ctx.beginPath();
        ctx.moveTo(cx - 30, cy - 20);
        ctx.lineTo(cx, cy - 30);
        ctx.lineTo(cx + 30, cy - 20);
        ctx.stroke();
        // Legs
        ctx.beginPath();
        ctx.moveTo(cx, cy + 30);
        ctx.lineTo(cx - 20, cy + 70);
        ctx.moveTo(cx, cy + 30);
        ctx.lineTo(cx + 20, cy + 70);
        ctx.stroke();

        // Glitch lines
        for (let i = 0; i < 10; i++) {
          const gx = cx + (Math.random() - 0.5) * 80;
          const gy = cy + (Math.random() - 0.5) * 120;
          ctx.fillStyle = this.colorWithAlpha('#ff1744', revealAlpha * Math.random() * 0.5);
          ctx.fillRect(gx, gy, Math.random() * 20, 2);
        }

        ctx.restore();
        break;
      }

      case 'logo': {
        // Large title text with glow
        if (frame.text) {
          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = 30;
          ctx.fillStyle = color;
          ctx.font = `bold ${Math.min(40, w / 18)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(frame.text, w / 2, h / 2 - 15);

          // Subtext
          if (frame.subtext) {
            ctx.shadowBlur = 15;
            ctx.fillStyle = this.colorWithAlpha(color, 0.6);
            ctx.font = `${Math.min(16, w / 45)}px monospace`;
            ctx.fillText(frame.subtext, w / 2, h / 2 + 25);
          }
          ctx.restore();

          // Decorative lines
          const lineW = Math.min(300, w * 0.6);
          ctx.strokeStyle = this.colorWithAlpha(color, 0.3);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(w / 2 - lineW / 2, h / 2 + 45);
          ctx.lineTo(w / 2 + lineW / 2, h / 2 + 45);
          ctx.stroke();
        }
        break;
      }

      case 'warning': {
        // Flashing text with glitch effect
        if (frame.text) {
          const flash = Math.sin(this.cinematicTimer * 8) * 0.5 + 0.5;
          ctx.save();

          // Glitch offset
          const glitchX = (Math.random() - 0.5) * 4 * intensity;
          const glitchY = (Math.random() - 0.5) * 2 * intensity;

          ctx.shadowColor = color;
          ctx.shadowBlur = 25 * flash;
          ctx.fillStyle = this.colorWithAlpha(color, 0.5 + flash * 0.5);
          ctx.font = `bold ${Math.min(32, w / 22)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(frame.text, w / 2 + glitchX, h / 2 + glitchY);

          // Chromatic aberration effect
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = this.colorWithAlpha('#ff0000', 0.15 * flash * intensity);
          ctx.fillText(frame.text, w / 2 + glitchX + 3, h / 2 + glitchY);
          ctx.fillStyle = this.colorWithAlpha('#00ffff', 0.15 * flash * intensity);
          ctx.fillText(frame.text, w / 2 + glitchX - 3, h / 2 + glitchY);
          ctx.globalCompositeOperation = 'source-over';

          ctx.restore();
        }
        break;
      }
    }

    // Skip hint at bottom
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.sin(performance.now() / 500) * 0.1})`;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Pulsa ESPACIO para saltar', w / 2, h - 30);
    ctx.restore();
  }

  // ============================================================
  // Cinematic system
  // ============================================================

  playCinematic(sequence: CinematicFrame[], callback?: () => void) {
    this.cinematicMode = true;
    this.cinematicSequence = sequence;
    this.cinematicIndex = 0;
    this.cinematicTimer = 0;
    this.cinematicCallback = callback ?? null;
    this.cinematicAlpha = 0;
  }

  skipCinematic() {
    if (!this.cinematicMode) return;
    this.cinematicMode = false;
    this.cinematicSequence = [];
    this.cinematicIndex = 0;
    this.cinematicTimer = 0;
    this.cinematicAlpha = 0;
    if (this.cinematicCallback) {
      this.cinematicCallback();
      this.cinematicCallback = null;
    }
  }

  getChapterTransitionCinematic(fromChapter: number, toChapter: number): CinematicFrame[] {
    const fromCh = CHAPTERS.find(c => c.id === fromChapter);
    const toCh = CHAPTERS.find(c => c.id === toChapter);
    return [
      { duration: 2, type: 'blackout' },
      { duration: 3, type: 'fade_in' },
      { duration: 4, type: 'text', text: fromCh?.outroText ?? 'Capítulo completado.', color: '#76ff03' },
      { duration: 2, type: 'fade_out' },
      { duration: 3, type: 'scanlines', intensity: 0.4 },
      { duration: 4, type: 'text', text: toCh?.introText ?? 'Un nuevo capítulo comienza...', color: '#00e5ff' },
      { duration: 2, type: 'fade_out' },
      { duration: 5, type: 'logo', text: toCh?.name ?? `Capítulo ${toChapter}`, subtext: toCh?.subtitle ?? '', color: '#00e5ff' },
      { duration: 2, type: 'fade_out' },
    ];
  }

  static readonly TRAILER_CINEMATIC: CinematicFrame[] = [
    { duration: 3, type: 'blackout' },
    { duration: 2, type: 'fade_in' },
    { duration: 4, type: 'logo', text: 'ECOS DE LA ESTÁTICA', color: '#00e5ff' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'scanlines', intensity: 0.3 },
    { duration: 5, type: 'text', text: 'Estás ciego.', color: '#ffffff' },
    { duration: 2, type: 'fade_out' },
    { duration: 4, type: 'text', text: 'Solo puedes ver a través del sonido.', color: '#00e5ff' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'pulse_wave', intensity: 1.0 },
    { duration: 2, type: 'blackout' },
    { duration: 5, type: 'text', text: 'Pero ellas también te escuchan.', color: '#ff1744' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'entity_reveal', intensity: 0.8 },
    { duration: 2, type: 'blackout' },
    { duration: 4, type: 'text', text: 'Cada paso que das...', color: '#ffd600' },
    { duration: 3, type: 'text', text: 'es una señal.', color: '#ffd600' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'static', intensity: 0.5 },
    { duration: 5, type: 'text', text: 'El Proyecto Eco era un experimento.', color: '#0097a7' },
    { duration: 4, type: 'text', text: 'Los sujetos perdieron la vista.', color: '#0097a7' },
    { duration: 4, type: 'text', text: 'Pero su audición se amplificó cien veces.', color: '#0097a7' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'scanlines', intensity: 0.6 },
    { duration: 5, type: 'text', text: 'Ahora son ecos atrapados entre frecuencias.', color: '#ff6d00' },
    { duration: 4, type: 'text', text: 'Y están furiosos.', color: '#ff1744' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'entity_reveal', intensity: 1.0 },
    { duration: 2, type: 'blackout' },
    { duration: 4, type: 'text', text: 'Zonas de silencio absoluto.', color: '#1a0033' },
    { duration: 4, type: 'text', text: 'Donde ni siquiera puedes ver.', color: '#1a0033' },
    { duration: 2, type: 'fade_out' },
    { duration: 4, type: 'text', text: 'Zonas de ruido blanco.', color: '#ffffff' },
    { duration: 4, type: 'text', text: 'Donde ves demasiado, pero estás aturdido.', color: '#ffffff' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'pulse_wave', intensity: 0.5 },
    { duration: 5, type: 'text', text: '6 capítulos.', color: '#00e5ff' },
    { duration: 4, type: 'text', text: '3 tipos de entidades.', color: '#ff1744' },
    { duration: 4, type: 'text', text: '1 vida.', color: '#ffffff' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'static', intensity: 0.8 },
    { duration: 5, type: 'warning', text: '¿SOBREVIVIRÁS A LA ESTÁTICA?', color: '#ff1744' },
    { duration: 2, type: 'fade_out' },
    { duration: 4, type: 'logo', text: 'ECOS DE LA ESTÁTICA', subtext: 'v3.5 — Silencio Absoluto', color: '#00e5ff' },
    { duration: 3, type: 'fade_out' },
  ];

  static readonly INTRO_CINEMATIC: CinematicFrame[] = [
    { duration: 2, type: 'blackout' },
    { duration: 3, type: 'fade_in' },
    { duration: 5, type: 'text', text: 'No recuerdas cómo llegaste aquí.', color: '#ffffff' },
    { duration: 2, type: 'fade_out' },
    { duration: 4, type: 'text', text: 'Solo silencio...', color: '#0097a7' },
    { duration: 3, type: 'text', text: 'y algo que se mueve en la oscuridad.', color: '#ff1744' },
    { duration: 2, type: 'fade_out' },
    { duration: 3, type: 'scanlines', intensity: 0.3 },
    { duration: 5, type: 'text', text: 'Capítulo 1: El Despertar', color: '#00e5ff' },
    { duration: 2, type: 'fade_out' },
  ];

  // ============================================================
  // Game loop
  // ============================================================

  startLoop() {
    this.lastTime = performance.now();
    const loop = (timestamp: number) => {
      this.update(timestamp);
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  resize(w: number, h: number) {
    if (this.canvas) {
      this.canvas.width = Math.floor(w);
      this.canvas.height = Math.floor(h);
      this.width = Math.floor(w);
      this.height = Math.floor(h);
    }
  }

  destroy() {
    this.stopLoop();
    this._cleanup?.();
    this.audio.destroy();
    if (this.canvas && document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }
}
