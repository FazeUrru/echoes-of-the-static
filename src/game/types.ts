// ============================================================
// Echoes of the Static - Type Definitions v2.5
// ============================================================

export interface Vec2 { x: number; y: number; }

// ---- Difficulty ----
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'impossible';

export interface DifficultyConfig {
  label: string;
  description: string;
  playerSpeed: number;
  sneakSpeed: number;
  entityBaseSpeed: number;
  entityChaseSpeed: number;
  entityHearingRange: number;
  pulseRadius: number;
  pulseCooldown: number;
  footstepRadius: number;
  flashlightDrain: number;
  entityCount: number;
  killDistance: number;
  inventorySize: number;
  itemSpawnRate: number;
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: 'Fácil',
    description: 'Entidades lentas, eco amplio, linterna duradera',
    playerSpeed: 3.0, sneakSpeed: 1.5, entityBaseSpeed: 0.7, entityChaseSpeed: 2.2,
    entityHearingRange: 8, pulseRadius: 18, pulseCooldown: 2000, footstepRadius: 4,
    flashlightDrain: 0.3, entityCount: 2, killDistance: 0.7, inventorySize: 6, itemSpawnRate: 1.2,
  },
  medium: {
    label: 'Medio',
    description: 'Equilibrio entre supervivencia y terror',
    playerSpeed: 2.5, sneakSpeed: 1.2, entityBaseSpeed: 1.0, entityChaseSpeed: 2.8,
    entityHearingRange: 12, pulseRadius: 15, pulseCooldown: 3000, footstepRadius: 5,
    flashlightDrain: 0.5, entityCount: 3, killDistance: 0.8, inventorySize: 4, itemSpawnRate: 1.0,
  },
  hard: {
    label: 'Difícil',
    description: 'Entidades agresivas, eco limitado, oscuridad implacable',
    playerSpeed: 2.3, sneakSpeed: 1.0, entityBaseSpeed: 1.3, entityChaseSpeed: 3.2,
    entityHearingRange: 15, pulseRadius: 12, pulseCooldown: 4000, footstepRadius: 6,
    flashlightDrain: 0.8, entityCount: 4, killDistance: 0.9, inventorySize: 4, itemSpawnRate: 0.8,
  },
  extreme: {
    label: 'Extremo',
    description: 'Solo para los valientes. Un error es fatal',
    playerSpeed: 2.2, sneakSpeed: 0.9, entityBaseSpeed: 1.6, entityChaseSpeed: 3.5,
    entityHearingRange: 18, pulseRadius: 10, pulseCooldown: 5000, footstepRadius: 7,
    flashlightDrain: 1.2, entityCount: 5, killDistance: 1.0, inventorySize: 3, itemSpawnRate: 0.6,
  },
  impossible: {
    label: 'Imposible',
    description: 'No deberías estar aquí. No hay esperanza',
    playerSpeed: 2.0, sneakSpeed: 0.8, entityBaseSpeed: 1.8, entityChaseSpeed: 4.0,
    entityHearingRange: 22, pulseRadius: 8, pulseCooldown: 7000, footstepRadius: 8,
    flashlightDrain: 2.0, entityCount: 7, killDistance: 1.2, inventorySize: 2, itemSpawnRate: 0.4,
  },
};

// ---- Enemy Types ----
export type EnemyType = 'stalker' | 'hunter' | 'phantom';

export interface EnemyTemplate {
  type: EnemyType;
  name: string;
  description: string;
  baseSpeed: number;
  chaseSpeed: number;
  hearingRange: number;
  color: string;
  glowColor: string;
  eyeColor: string;
  behavior: string;
}

export const ENEMY_TEMPLATES: Record<EnemyType, EnemyTemplate> = {
  stalker: {
    type: 'stalker', name: 'Acechador', description: 'Lento pero implacable. Oye todo y nunca olvida.',
    baseSpeed: 0.8, chaseSpeed: 2.5, hearingRange: 14, color: '#ff1744', glowColor: '#ff5252', eyeColor: '#ff0000',
    behavior: 'patrols slowly, investigates all sounds, chases persistently',
  },
  hunter: {
    type: 'hunter', name: 'Cazador', description: 'Rápido y agresivo. Se acerca corriendo al mínimo sonido.',
    baseSpeed: 1.4, chaseSpeed: 3.8, hearingRange: 10, color: '#ff6d00', glowColor: '#ffab40', eyeColor: '#ff8800',
    behavior: 'fast patrol, rushes to sounds, short attention span',
  },
  phantom: {
    type: 'phantom', name: 'Fantasma', description: 'Silencioso e impredecible. Aparece donde menos lo esperas.',
    baseSpeed: 0.6, chaseSpeed: 2.0, hearingRange: 20, color: '#aa00ff', glowColor: '#d500f9', eyeColor: '#e040fb',
    behavior: 'teleports near loud sounds, whisper detection, disappears',
  },
};

// ---- Items ----
export type ItemCategory = 'tool' | 'consumable' | 'key' | 'weapon' | 'armor' | 'document' | 'misc';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  stackable: boolean;
  maxStack: number;
  icon: string; // emoji
  effect?: string;
  value?: number;
  noiseOnUse?: number;
  rangeOnUse?: number;
  uses?: number;
}

// ---- Inventory ----
export interface InventorySlot {
  item: ItemDef;
  count: number;
  uses?: number;
}

// ---- Doors ----
export interface Door {
  x: number;
  y: number;
  isOpen: boolean;
  isLocked: boolean;
  keyId?: string;
  health: number;
  side: number; // 0=N/S, 1=E/W
}

// ---- Player ----
export interface Player {
  pos: Vec2;
  dir: number;
  speed: number;
  isMoving: boolean;
  isSneaking: boolean;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  noiseLevel: number;
  lastFootstepTime: number;
  flashlightOn: boolean;
  flashlightBattery: number;
  maxFlashlightBattery: number;
  inventory: InventorySlot[];
  inventorySize: number;
  selectedSlot: number;
  interactCooldown: number;
}

// ---- Entity ----
export type EntityState = 'patrol' | 'investigate' | 'chase' | 'search' | 'idle' | 'teleport';

export interface Entity {
  id: number;
  type: EnemyType;
  pos: Vec2;
  targetPos: Vec2 | null;
  state: EntityState;
  speed: number;
  hearingRange: number;
  lastHeardSound: Vec2 | null;
  lastHeardTime: number;
  stateTimer: number;
  patrolAngle: number;
  animPhase: number;
  killTimer: number;
  health: number;
  // Phantom-specific
  teleportCooldown: number;
  isTeleporting: boolean;
  teleportTimer: number;
  // Hunter-specific
  rushTimer: number;
  // Stalker-specific
  persistenceTimer: number;
}

// ---- Chapters ----
export interface Chapter {
  id: number;
  name: string;
  subtitle: string;
  description: string;
  mapType: 'building' | 'sewers' | 'street' | 'hospital' | 'underground' | 'tower';
  mapWidth: number;
  mapHeight: number;
  roomCount: number;
  enemies: { type: EnemyType; count: number }[];
  itemDensity: number;
  hasDoors: boolean;
  hasOutdoor: boolean;
  exitRequiredKey?: string;
  introText: string;
  outroText: string;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 1, name: 'El Despertar', subtitle: 'Capítulo 1',
    description: 'Despiertas en la oscuridad de un edificio abandonado.',
    mapType: 'building', mapWidth: 36, mapHeight: 36, roomCount: 7,
    enemies: [{ type: 'stalker', count: 2 }],
    itemDensity: 1.0, hasDoors: true, hasOutdoor: false,
    introText: 'No recuerdas cómo llegaste aquí. Solo silencio... y algo que se mueve en la oscuridad.',
    outroText: 'Encontraste la salida del edificio, pero la pesadilla apenas comienza.',
  },
  {
    id: 2, name: 'Las Cloacas', subtitle: 'Capítulo 2',
    description: 'El camino te lleva a las alcantarillas bajo la ciudad.',
    mapType: 'sewers', mapWidth: 42, mapHeight: 42, roomCount: 9,
    enemies: [{ type: 'stalker', count: 2 }, { type: 'hunter', count: 1 }],
    itemDensity: 0.8, hasDoors: true, hasOutdoor: false,
    introText: 'El agua gotea constantemente. Cada gota es un sonido que te delata.',
    outroText: 'Las cloacas terminan en una salida a la superficie.',
  },
  {
    id: 3, name: 'Calles Vacías', subtitle: 'Capítulo 3',
    description: 'Emerges a las calles desiertas de la ciudad.',
    mapType: 'street', mapWidth: 50, mapHeight: 50, roomCount: 10,
    enemies: [{ type: 'stalker', count: 1 }, { type: 'hunter', count: 2 }],
    itemDensity: 0.7, hasDoors: false, hasOutdoor: true,
    introText: 'La ciudad está vacía. Los edificios son sombras contra el cielo negro.',
    outroText: 'Encontraste refugio en un hospital abandonado.',
  },
  {
    id: 4, name: 'El Hospital', subtitle: 'Capítulo 4',
    description: 'Un hospital abandonado lleno de ecos del pasado.',
    mapType: 'hospital', mapWidth: 44, mapHeight: 44, roomCount: 12,
    enemies: [{ type: 'stalker', count: 2 }, { type: 'phantom', count: 1 }],
    itemDensity: 0.9, hasDoors: true, hasOutdoor: false,
    introText: 'Los pasillos del hospital son un laberinto de ecos y susurros.',
    outroText: 'En el sótano del hospital descubres un pasaje subterráneo.',
  },
  {
    id: 5, name: 'Bajo Tierra', subtitle: 'Capítulo 5',
    description: 'Un laberinto subterráneo de túneles y cavernas.',
    mapType: 'underground', mapWidth: 48, mapHeight: 48, roomCount: 11,
    enemies: [{ type: 'hunter', count: 2 }, { type: 'phantom', count: 2 }],
    itemDensity: 0.6, hasDoors: true, hasOutdoor: false,
    exitRequiredKey: 'ancient_key',
    introText: 'Los túneles son profundos y antiguos. Algo te observa desde las sombras.',
    outroText: 'Una escalera sube hacia lo que parece ser una torre.',
  },
  {
    id: 6, name: 'La Torre del Silencio', subtitle: 'Capítulo 6',
    description: 'La fuente de la estática. El final del camino.',
    mapType: 'tower', mapWidth: 30, mapHeight: 40, roomCount: 8,
    enemies: [{ type: 'stalker', count: 2 }, { type: 'hunter', count: 2 }, { type: 'phantom', count: 2 }],
    itemDensity: 0.5, hasDoors: true, hasOutdoor: true,
    introText: 'La torre se alza ante ti. La estática resuena en cada piedra.',
    outroText: 'El silencio regresa. La estática se desvanece. Sobreviviste.',
  },
];

// ---- Echolocation ----
export interface EcholocationPulse {
  origin: Vec2;
  radius: number;
  startTime: number;
  duration: number;
  intensity: number;
}

// ---- Settings ----
export interface ProfileSettings {
  playerName: string;
  language: 'es' | 'en';
  subtitles: boolean;
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  screenShake: boolean;
  headBob: boolean;
  crosshairStyle: 'dot' | 'cross' | 'none';
  crosshairColor: string;
  crosshairSize: number;
  volumeMaster: number;
  volumeMusic: number;
  volumeSFX: number;
  volumeAmbient: number;
  volumeVoice: number;
  brightness: number;
}

export interface AdvancedSettings {
  fov: number;
  mouseSensitivity: number;
  mouseInvertY: boolean;
  mouseSmoothing: boolean;
  renderDistance: number;
  neonGlowIntensity: number;
  pulseFadeDuration: number;
  footstepVisualRange: number;
  flashlightFov: number;
  flashlightIntensity: number;
  showFPS: boolean;
  showMinimap: boolean;
  showCompass: boolean;
  showDangerIndicator: boolean;
  vsync: boolean;
}

export interface ControlBinding {
  action: string;
  label: string;
  key: string;
}

export const DEFAULT_CONTROLS: ControlBinding[] = [
  { action: 'moveForward', label: 'Mover Adelante', key: 'KeyW' },
  { action: 'moveBack', label: 'Mover Atrás', key: 'KeyS' },
  { action: 'moveLeft', label: 'Mover Izquierda', key: 'KeyA' },
  { action: 'moveRight', label: 'Mover Derecha', key: 'KeyD' },
  { action: 'sneak', label: 'Sigilo', key: 'ShiftLeft' },
  { action: 'pulse', label: 'Ecolocación', key: 'Space' },
  { action: 'softPulse', label: 'Golpe Suave', key: 'KeyE' },
  { action: 'flashlight', label: 'Linterna', key: 'KeyF' },
  { action: 'interact', label: 'Interactuar', key: 'KeyE' },
  { action: 'inventory1', label: 'Inventario 1', key: 'Digit1' },
  { action: 'inventory2', label: 'Inventario 2', key: 'Digit2' },
  { action: 'inventory3', label: 'Inventario 3', key: 'Digit3' },
  { action: 'inventory4', label: 'Inventario 4', key: 'Digit4' },
  { action: 'useItem', label: 'Usar Objeto', key: 'KeyQ' },
  { action: 'dropItem', label: 'Soltar Objeto', key: 'KeyG' },
  { action: 'pause', label: 'Pausa', key: 'Escape' },
];

export const DEFAULT_PROFILE: ProfileSettings = {
  playerName: 'Jugador', language: 'es', subtitles: true,
  colorblindMode: 'none', screenShake: true, headBob: true,
  crosshairStyle: 'dot', crosshairColor: '#00e5ff', crosshairSize: 4,
  volumeMaster: 0.7, volumeMusic: 0.5, volumeSFX: 0.7, volumeAmbient: 0.6, volumeVoice: 0.8,
  brightness: 1.0,
};

export const DEFAULT_ADVANCED: AdvancedSettings = {
  fov: 60, mouseSensitivity: 2.0, mouseInvertY: false, mouseSmoothing: true,
  renderDistance: 25, neonGlowIntensity: 1.0, pulseFadeDuration: 2500,
  footstepVisualRange: 2.5, flashlightFov: 45, flashlightIntensity: 0.8,
  showFPS: false, showMinimap: false, showCompass: true, showDangerIndicator: true,
  vsync: true,
};

// ---- Game State ----
export type GameState = 'menu' | 'difficulty' | 'chapterSelect' | 'playing' | 'dead' | 'won' | 'paused' | 'settings' | 'inventory' | 'chapterIntro';

export interface GameMap {
  width: number;
  height: number;
  cells: number[][]; // 0=empty, 1=wall, 2=exit, 3=door
  startRoom: { x: number; y: number; w: number; h: number };
  exitPos: Vec2;
  doors: Door[];
  items: { itemId: string; pos: Vec2; }[];
  isOutdoor: boolean;
}

// ---- Ray Hit ----
export interface RayHit {
  distance: number;
  mapX: number;
  mapY: number;
  side: number;
  textureX: number;
  doorHit?: Door;
}

// ---- Neon Colors ----
export const NEON_COLORS = {
  wall: '#00e5ff',
  wallSide: '#0097a7',
  exit: '#76ff03',
  door: '#ffab00',
  doorOpen: '#ff6d00',
  stalker: '#ff1744',
  stalkerGlow: '#ff5252',
  hunter: '#ff6d00',
  hunterGlow: '#ffab40',
  phantom: '#aa00ff',
  phantomGlow: '#d500f9',
  pulse: '#00e5ff',
  flashlight: '#ffe082',
  item: '#ffd600',
} as const;

export const FADE_DURATION = 2500;
export const PULSE_ANIM_DURATION = 800;
