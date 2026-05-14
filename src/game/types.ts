// ============================================================
// Echoes of the Static - Type Definitions
// ============================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface Player {
  pos: Vec2;
  dir: number; // angle in radians
  speed: number;
  isMoving: boolean;
  isSneaking: boolean;
  health: number;
  stamina: number;
  noiseLevel: number; // current noise being made
  lastFootstepTime: number;
}

export type EntityState = 'patrol' | 'investigate' | 'chase' | 'search';

export interface Entity {
  id: number;
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
  killTimer: number; // when close enough to player, counts up to kill
}

export interface SoundEvent {
  pos: Vec2;
  volume: number; // 0-1
  time: number;
  radius: number; // how far the sound travels
  type: 'footstep' | 'pulse' | 'throw' | 'bump';
}

export interface WallIllumination {
  intensity: number; // 0-1, fades over time
  timestamp: number; // when it was last illuminated
  color: string; // neon color
}

export type CellType = 0 | 1 | 2; // 0=empty, 1=wall, 2=exit

export interface GameMap {
  width: number;
  height: number;
  cells: CellType[][];
  wallIllumination: Map<string, WallIllumination>; // key: "x,y,side"
  startRoom: { x: number; y: number; w: number; h: number };
  exitPos: Vec2;
}

export interface RayHit {
  distance: number;
  wallX: number; // grid x of wall hit
  wallY: number; // grid y of wall hit
  side: number; // 0=x-side, 1=y-side
  textureX: number; // where on the wall was hit (0-1)
  mapX: number;
  mapY: number;
}

export interface EcholocationPulse {
  origin: Vec2;
  radius: number;
  startTime: number;
  duration: number;
  intensity: number;
}

export type GameState = 'menu' | 'playing' | 'dead' | 'won' | 'paused';

export interface GameConfig {
  mapWidth: number;
  mapHeight: number;
  roomCount: number;
  entityCount: number;
  playerSpeed: number;
  sneakSpeed: number;
  pulseCooldown: number;
  footstepInterval: number;
  entityBaseSpeed: number;
  entityChaseSpeed: number;
  entityHearingRange: number;
  killDistance: number;
  footstepRadius: number;
  sneakFootstepRadius: number;
  pulseRadius: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  mapWidth: 40,
  mapHeight: 40,
  roomCount: 8,
  entityCount: 3,
  playerSpeed: 2.5,
  sneakSpeed: 1.2,
  pulseCooldown: 3000,
  footstepInterval: 350,
  entityBaseSpeed: 1.0,
  entityChaseSpeed: 2.8,
  entityHearingRange: 12,
  killDistance: 0.8,
  footstepRadius: 5,
  sneakFootstepRadius: 2,
  pulseRadius: 15,
};

export const NEON_COLORS = {
  wall: '#00e5ff',
  wallSide: '#0097a7',
  exit: '#76ff03',
  entity: '#ff1744',
  entityGlow: '#ff5252',
  pulse: '#00e5ff',
  playerPulse: '#e0f7fa',
} as const;

export const FADE_DURATION = 2500; // ms for wall illumination to fade
export const PULSE_ANIM_DURATION = 800; // ms for pulse wave animation
