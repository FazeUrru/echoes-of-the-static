// ============================================================
// Echoes of the Static - Game Engine
// ============================================================

import {
  Player,
  Entity,
  EntityState,
  EcholocationPulse,
  GameState,
  GameConfig,
  DEFAULT_CONFIG,
  RayHit,
  NEON_COLORS,
  FADE_DURATION,
  PULSE_ANIM_DURATION,
  Vec2,
} from './types';
import { GameMap, generateLevel, findEntitySpawnPositions, isWalkable, isExit, wallKey } from './level';
import { AudioSystem } from './audio';

// Extended illumination with initial intensity for proper fading
interface WallIllum {
  initialIntensity: number;
  timestamp: number;
  color: string;
}

export class EchoGameEngine {
  // Canvas
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  width = 0;
  height = 0;

  // Game state
  state: GameState = 'menu';
  map!: GameMap;
  player!: Player;
  entities: Entity[] = [];
  pulses: EcholocationPulse[] = [];
  soundEvents: { pos: Vec2; volume: number; radius: number; time: number }[] = [];

  // Custom illumination map (overrides map's)
  illumination: Map<string, WallIllum> = new Map();

  // Config
  config: GameConfig;

  // Input
  keys: Set<string> = new Set();
  mouseX = 0;
  mouseLocked = false;

  // Timing
  lastTime = 0;
  pulseCooldownTimer = 0;
  gameStartTime = 0;

  // Audio
  audio: AudioSystem;

  // Danger tracking
  closestEntityDist = Infinity;

  // Animation
  breathPhase = 0;
  glitchIntensity = 0;
  staticPhase = 0;
  deathTimer = 0;

  // Level tracking
  currentLevel = 1;

  // Screen shake
  shakeX = 0;
  shakeY = 0;
  shakeDecay = 0;

  // FPS tracking
  frameCount = 0;
  fpsTime = 0;
  fps = 60;

  // Callbacks
  onStateChange?: (state: GameState) => void;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.audio = new AudioSystem();
  }

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.setupInput();
  }

  async startGame() {
    await this.audio.init();
    this.audio.resume();

    this.currentLevel = 1;
    this.initLevel();
    this.state = 'playing';
    this.gameStartTime = performance.now();
    this.audio.startAmbient();
    this.audio.startHeartbeat();
    this.onStateChange?.('playing');
  }

  initLevel() {
    this.map = generateLevel(this.config.mapWidth, this.config.mapHeight, this.config.roomCount);
    this.illumination = new Map();

    const sr = this.map.startRoom;
    this.player = {
      pos: { x: sr.x + sr.w / 2 + 0.5, y: sr.y + sr.h / 2 + 0.5 },
      dir: 0,
      speed: this.config.playerSpeed,
      isMoving: false,
      isSneaking: false,
      health: 100,
      stamina: 100,
      noiseLevel: 0,
      lastFootstepTime: 0,
    };

    const entitySpawns = findEntitySpawnPositions(
      this.map,
      this.config.entityCount + this.currentLevel - 1,
      this.player.pos,
      10
    );

    this.entities = entitySpawns.map((pos, i) => ({
      id: i,
      pos: { ...pos },
      targetPos: null,
      state: 'patrol' as EntityState,
      speed: this.config.entityBaseSpeed + (this.currentLevel - 1) * 0.2,
      hearingRange: this.config.entityHearingRange + (this.currentLevel - 1) * 1,
      lastHeardSound: null,
      lastHeardTime: 0,
      stateTimer: Math.random() * 3,
      patrolAngle: Math.random() * Math.PI * 2,
      animPhase: Math.random() * Math.PI * 2,
      killTimer: 0,
    }));

    this.pulses = [];
    this.soundEvents = [];
    this.pulseCooldownTimer = 0;
    this.closestEntityDist = Infinity;
    this.deathTimer = 0;
    this.glitchIntensity = 0;
  }

  private setupInput() {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.code);

      if (e.code === 'Space' && this.state === 'playing') {
        e.preventDefault();
        this.emitPulse();
      }
      if (e.code === 'KeyE' && this.state === 'playing') {
        e.preventDefault();
        this.emitSoftPulse();
      }
      if (e.code === 'Escape') {
        if (this.state === 'playing') {
          this.state = 'paused';
          this.onStateChange?.('paused');
        } else if (this.state === 'paused') {
          this.state = 'playing';
          this.onStateChange?.('playing');
        }
      }
      // Restart with R
      if (e.code === 'KeyR' && (this.state === 'dead' || this.state === 'won')) {
        this.startGame();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (this.mouseLocked && this.state === 'playing') {
        this.player.dir += e.movementX * 0.002;
      }
      this.mouseX = e.clientX;
    };

    const onClick = () => {
      if (this.canvas && this.state === 'playing') {
        this.canvas.requestPointerLock();
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

  private _cleanup?: () => void;

  // Get current intensity for an illumination entry (linear fade based on time)
  private getCurrentIntensity(illum: WallIllum): number {
    const elapsed = performance.now() - illum.timestamp;
    if (elapsed >= FADE_DURATION) return 0;
    return illum.initialIntensity * (1 - elapsed / FADE_DURATION);
  }

  // Set illumination for a wall face (keeps the strongest)
  private setIllumination(key: string, intensity: number, color: string) {
    const existing = this.illumination.get(key);
    const currentIntensity = existing ? this.getCurrentIntensity(existing) : 0;

    if (intensity > currentIntensity) {
      this.illumination.set(key, {
        initialIntensity: intensity,
        timestamp: performance.now(),
        color,
      });
    }
  }

  // Emit a loud echolocation pulse
  emitPulse() {
    if (this.pulseCooldownTimer > 0) return;

    const now = performance.now();
    this.pulses.push({
      origin: { ...this.player.pos },
      radius: this.config.pulseRadius,
      startTime: now,
      duration: PULSE_ANIM_DURATION,
      intensity: 1.0,
    });

    this.pulseCooldownTimer = this.config.pulseCooldown;
    this.addSoundEvent(this.player.pos, 1.0, this.config.pulseRadius, 'pulse');
    this.audio.playPulse(true);
    this.audio.resume();

    // Immediate strong illumination near player
    this.illuminateArea(this.player.pos, 3, 1.0, NEON_COLORS.wall);

    this.shakeX = (Math.random() - 0.5) * 6;
    this.shakeY = (Math.random() - 0.5) * 6;
    this.shakeDecay = 300;
  }

  // Emit a soft pulse (wall tap)
  emitSoftPulse() {
    const now = performance.now();
    this.pulses.push({
      origin: { ...this.player.pos },
      radius: this.config.sneakFootstepRadius * 3,
      startTime: now,
      duration: 500,
      intensity: 0.6,
    });

    this.addSoundEvent(this.player.pos, 0.4, this.config.sneakFootstepRadius * 3, 'bump');
    this.audio.playPulse(false);
    this.audio.resume();

    // Immediate moderate illumination
    this.illuminateArea(this.player.pos, 2, 0.6, NEON_COLORS.wallSide);
  }

  addSoundEvent(pos: Vec2, volume: number, radius: number, _type: string) {
    this.soundEvents.push({
      pos: { ...pos },
      volume,
      radius,
      time: performance.now(),
    });
  }

  // ============================================================
  // MAIN GAME LOOP
  // ============================================================

  update(timestamp: number) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    this.frameCount++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = 0;
    }

    if (this.state !== 'playing') return;

    this.updatePlayer(dt);
    this.updateEntities(dt);
    this.updatePulses();
    this.updateProximityIllumination();
    this.cleanIllumination();
    this.updateDanger();
    this.updateAnimations(dt);
    this.checkWinCondition();

    if (this.pulseCooldownTimer > 0) {
      this.pulseCooldownTimer -= dt * 1000;
    }

    if (this.shakeDecay > 0) {
      this.shakeDecay -= dt * 1000;
      this.shakeX *= 0.9;
      this.shakeY *= 0.9;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    const now = performance.now();
    this.soundEvents = this.soundEvents.filter((s) => now - s.time < 5000);
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.isMoving = false;
    p.isSneaking = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = p.isSneaking ? this.config.sneakSpeed : this.config.playerSpeed;

    let moveX = 0;
    let moveY = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      moveX += Math.cos(p.dir) * speed * dt;
      moveY += Math.sin(p.dir) * speed * dt;
      p.isMoving = true;
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      moveX -= Math.cos(p.dir) * speed * dt;
      moveY -= Math.sin(p.dir) * speed * dt;
      p.isMoving = true;
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      moveX += Math.cos(p.dir - Math.PI / 2) * speed * dt;
      moveY += Math.sin(p.dir - Math.PI / 2) * speed * dt;
      p.isMoving = true;
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      moveX -= Math.cos(p.dir - Math.PI / 2) * speed * dt;
      moveY -= Math.sin(p.dir - Math.PI / 2) * speed * dt;
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
      this.addSoundEvent(p.pos, 0.15, 2, 'bump');
      this.illuminateArea(p.pos, 2, 0.3, NEON_COLORS.wallSide);
    }

    // Footsteps
    if (p.isMoving) {
      const now = performance.now();
      const interval = p.isSneaking ? this.config.footstepInterval * 2 : this.config.footstepInterval;
      if (now - p.lastFootstepTime > interval) {
        p.lastFootstepTime = now;
        this.audio.playFootstep(p.isSneaking);

        const radius = p.isSneaking ? this.config.sneakFootstepRadius : this.config.footstepRadius;
        const volume = p.isSneaking ? 0.2 : 0.5;
        this.addSoundEvent(p.pos, volume, radius, 'footstep');

        // Footstep echolocation
        const footIllum = p.isSneaking ? 0.15 : 0.3;
        const footRadius = p.isSneaking ? 1.5 : 3;
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

    p.noiseLevel = p.isMoving ? (p.isSneaking ? 0.2 : 0.5) : 0;
  }

  private updateEntities(dt: number) {
    const now = performance.now();

    for (const entity of this.entities) {
      entity.animPhase += dt * 3;
      entity.stateTimer -= dt;

      // Check if entity can hear any sounds
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

      // State machine
      switch (entity.state) {
        case 'patrol': {
          if (bestSound && bestVolume > 0.1) {
            entity.state = 'investigate';
            entity.lastHeardSound = bestSound.pos;
            entity.lastHeardTime = now;
            entity.stateTimer = 10;
            break;
          }

          if (entity.stateTimer <= 0) {
            entity.patrolAngle += (Math.random() - 0.5) * Math.PI * 1.5;
            entity.stateTimer = 2 + Math.random() * 4;
          }

          this.moveEntity(entity, entity.patrolAngle, entity.speed * 0.4, dt);

          const nextX = entity.pos.x + Math.cos(entity.patrolAngle) * 0.4;
          const nextY = entity.pos.y + Math.sin(entity.patrolAngle) * 0.4;
          if (!isWalkable(this.map, nextX, nextY)) {
            entity.patrolAngle += Math.PI * 0.6 + Math.random() * Math.PI * 0.8;
          }
          break;
        }

        case 'investigate': {
          if (bestSound && bestVolume > 0.15) {
            entity.lastHeardSound = bestSound.pos;
            entity.lastHeardTime = now;
            entity.stateTimer = 10;
          }

          // If very close and player is making noise, switch to chase
          if (playerDist < 4 && this.player.noiseLevel > 0.3) {
            entity.state = 'chase';
            entity.stateTimer = 6;
            break;
          }

          if (entity.lastHeardSound) {
            const soundDist = this.dist(entity.pos, entity.lastHeardSound);
            if (soundDist < 0.8) {
              entity.state = 'search';
              entity.stateTimer = 4 + Math.random() * 3;
              entity.patrolAngle = Math.random() * Math.PI * 2;
            } else {
              const angle = Math.atan2(
                entity.lastHeardSound.y - entity.pos.y,
                entity.lastHeardSound.x - entity.pos.x
              );
              this.moveEntity(entity, angle, entity.speed * 0.7, dt);
            }
          }

          if (entity.stateTimer <= 0) {
            entity.state = 'patrol';
            entity.stateTimer = 2 + Math.random() * 2;
          }
          break;
        }

        case 'search': {
          entity.patrolAngle += dt * 1.5;
          this.moveEntity(entity, entity.patrolAngle, entity.speed * 0.3, dt);

          if (bestSound && bestVolume > 0.2) {
            entity.state = 'investigate';
            entity.lastHeardSound = bestSound.pos;
            entity.lastHeardTime = now;
            entity.stateTimer = 10;
            break;
          }

          // Close player detection
          if (playerDist < 2) {
            entity.state = 'chase';
            entity.stateTimer = 6;
            break;
          }

          if (entity.stateTimer <= 0) {
            entity.state = 'patrol';
            entity.stateTimer = 2;
          }
          break;
        }

        case 'chase': {
          // Chase player directly
          const playerAngle = Math.atan2(
            this.player.pos.y - entity.pos.y,
            this.player.pos.x - entity.pos.x
          );
          this.moveEntity(entity, playerAngle, this.config.entityChaseSpeed, dt);

          // Continue chase if player is making noise or is close
          if (playerDist < 5) {
            entity.stateTimer = 4; // Keep chasing while close
          }

          if (entity.stateTimer <= 0) {
            entity.state = 'investigate';
            entity.lastHeardSound = { ...this.player.pos };
            entity.stateTimer = 5;
          }
          break;
        }
      }

      // Proximity detection - entity "feels" player
      if (playerDist < 1.5 && entity.state !== 'chase') {
        entity.state = 'chase';
        entity.stateTimer = 6;
      }

      // Kill check
      if (playerDist < this.config.killDistance) {
        entity.killTimer += dt;
        if (entity.killTimer > 0.4) {
          this.playerDeath();
        }
      } else {
        entity.killTimer = Math.max(0, entity.killTimer - dt * 2);
      }

      // Entity sounds
      if (playerDist < 8 && Math.random() < 0.004) {
        this.audio.playEntityGrowl(playerDist);
      }

      // Entity movement sound
      if (entity.state === 'chase' && Math.random() < 0.01) {
        this.addSoundEvent(entity.pos, 0.2, 3, 'entity');
      }
    }
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

  private updatePulses() {
    const now = performance.now();
    // Remove expired pulses
    this.pulses = this.pulses.filter((p) => now - p.startTime < p.duration + FADE_DURATION);

    for (const pulse of this.pulses) {
      const elapsed = now - pulse.startTime;
      if (elapsed > pulse.duration) continue;

      const progress = elapsed / pulse.duration;
      const currentRadius = pulse.radius * progress;
      const waveWidth = 3.0; // Width of the wavefront

      // Illuminate walls in the wavefront ring
      this.illuminateRing(pulse.origin, currentRadius, waveWidth, pulse.intensity * (1 - progress * 0.3));
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
        if (this.map.cells[y][x] !== 1 && this.map.cells[y][x] !== 2) continue;

        const cx = x + 0.5;
        const cy = y + 0.5;
        const dist = Math.sqrt((cx - origin.x) ** 2 + (cy - origin.y) ** 2);

        if (dist >= minDist && dist <= maxDist) {
          // Intensity based on distance from wavefront center
          const waveDist = Math.abs(dist - radius);
          const waveIntensity = intensity * (1 - waveDist / width);

          for (let side = 0; side < 2; side++) {
            const key = wallKey(x, y, side);
            const color =
              this.map.cells[y][x] === 2
                ? NEON_COLORS.exit
                : side === 0
                ? NEON_COLORS.wall
                : NEON_COLORS.wallSide;
            this.setIllumination(key, waveIntensity, color);
          }
        }
      }
    }
  }

  private illuminateArea(pos: Vec2, radius: number, intensity: number, color: string) {
    const minX = Math.max(0, Math.floor(pos.x - radius));
    const maxX = Math.min(this.map.width - 1, Math.ceil(pos.x + radius));
    const minY = Math.max(0, Math.floor(pos.y - radius));
    const maxY = Math.min(this.map.height - 1, Math.ceil(pos.y + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.map.cells[y][x] !== 1 && this.map.cells[y][x] !== 2) continue;
        const dist = Math.sqrt((x + 0.5 - pos.x) ** 2 + (y + 0.5 - pos.y) ** 2);
        if (dist <= radius) {
          const distFade = 1 - dist / radius;
          for (let side = 0; side < 2; side++) {
            const key = wallKey(x, y, side);
            this.setIllumination(key, intensity * distFade, color);
          }
        }
      }
    }
  }

  // Always show walls very close to the player (touching distance)
  private updateProximityIllumination() {
    const p = this.player;
    const proxRadius = 1.2;
    const minX = Math.max(0, Math.floor(p.pos.x - proxRadius));
    const maxX = Math.min(this.map.width - 1, Math.ceil(p.pos.x + proxRadius));
    const minY = Math.max(0, Math.floor(p.pos.y - proxRadius));
    const maxY = Math.min(this.map.height - 1, Math.ceil(p.pos.y + proxRadius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.map.cells[y][x] !== 1 && this.map.cells[y][x] !== 2) continue;
        const dist = Math.sqrt((x + 0.5 - p.pos.x) ** 2 + (y + 0.5 - p.pos.y) ** 2);
        if (dist <= proxRadius) {
          const proxIntensity = 0.12 * (1 - dist / proxRadius);
          for (let side = 0; side < 2; side++) {
            const key = wallKey(x, y, side);
            const color = this.map.cells[y][x] === 2 ? NEON_COLORS.exit :
                          side === 0 ? NEON_COLORS.wall : NEON_COLORS.wallSide;
            this.setIllumination(key, proxIntensity, color);
          }
        }
      }
    }
  }

  private cleanIllumination() {
    const now = performance.now();
    const keysToDelete: string[] = [];

    for (const [key, illum] of this.illumination) {
      if (now - illum.timestamp > FADE_DURATION) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.illumination.delete(key);
    }
  }

  private updateDanger() {
    this.closestEntityDist = Infinity;
    for (const entity of this.entities) {
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

  private checkWinCondition() {
    if (isExit(this.map, this.player.pos.x, this.player.pos.y)) {
      this.state = 'won';
      this.audio.playWin();
      this.audio.stopHeartbeat();
      this.onStateChange?.('won');
    }
  }

  private playerDeath() {
    this.state = 'dead';
    this.audio.playDeath();
    this.audio.stopHeartbeat();
    this.deathTimer = performance.now();
    this.onStateChange?.('dead');
  }

  // ============================================================
  // RAYCASTING RENDERER
  // ============================================================

  render() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    if (this.state === 'menu') return;
    if (this.state === 'dead') {
      this.renderDeathScreen(ctx, w, h);
      return;
    }
    if (this.state === 'won') {
      this.renderWinScreen(ctx, w, h);
      return;
    }
    if (this.state === 'paused') {
      this.renderPausedScreen(ctx, w, h);
      return;
    }

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    // Raycasting
    this.renderRaycast(ctx, w, h);

    // Entities
    this.renderEntities(ctx, w, h);

    // Echolocation pulse wave
    this.renderPulseWave(ctx, w, h);

    // Breath effect
    this.renderBreathEffect(ctx, w, h);

    // Glitch
    if (this.glitchIntensity > 0.01) {
      this.renderGlitch(ctx, w, h);
    }

    // Vignette
    this.renderVignette(ctx, w, h);

    ctx.restore();

    // HUD
    this.renderHUD(ctx, w, h);
  }

  private renderRaycast(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const p = this.player;
    const fov = Math.PI / 3;
    const numRays = Math.min(w, 480);
    const stripWidth = w / numRays;

    const dirX = Math.cos(p.dir);
    const dirY = Math.sin(p.dir);
    const planeX = -Math.sin(p.dir) * Math.tan(fov / 2);
    const planeY = Math.cos(p.dir) * Math.tan(fov / 2);

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
      const otherKey = wallKey(hit.mapX, hit.mapY, hit.side === 0 ? 1 : 0);
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

      const distanceFade = Math.max(0.15, 1 - perpDist / 25);
      const alpha = Math.min(1, currentIntensity * distanceFade);
      if (alpha < 0.01) continue;

      const color = bestIllum.color;
      const cx = Math.floor(i * stripWidth + stripWidth / 2);

      // Main neon line
      ctx.strokeStyle = this.colorWithAlpha(color, alpha);
      ctx.lineWidth = stripWidth + 1;
      ctx.beginPath();
      ctx.moveTo(cx, drawStart);
      ctx.lineTo(cx, drawEnd);
      ctx.stroke();

      // Inner glow
      if (alpha > 0.15) {
        ctx.strokeStyle = this.colorWithAlpha(color, alpha * 0.4);
        ctx.lineWidth = stripWidth + 4;
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

      // Wide glow for strong illumination
      if (alpha > 0.5) {
        ctx.strokeStyle = this.colorWithAlpha(color, alpha * 0.06);
        ctx.lineWidth = stripWidth + 20;
        ctx.beginPath();
        ctx.moveTo(cx, drawStart);
        ctx.lineTo(cx, drawEnd);
        ctx.stroke();
      }

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

  private castRay(posX: number, posY: number, dirX: number, dirY: number): RayHit | null {
    const mapX = Math.floor(posX);
    const mapY = Math.floor(posY);

    let currentMapX = mapX;
    let currentMapY = mapY;

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
    let maxSteps = 60;

    while (!hit && maxSteps-- > 0) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        currentMapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        currentMapY += stepY;
        side = 1;
      }

      if (
        currentMapX < 0 || currentMapX >= this.map.width ||
        currentMapY < 0 || currentMapY >= this.map.height
      ) {
        break;
      }

      if (this.map.cells[currentMapY][currentMapX] === 1 || this.map.cells[currentMapY][currentMapX] === 2) {
        hit = true;
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
      wallX: currentMapX,
      wallY: currentMapY,
      side,
      textureX,
      mapX: currentMapX,
      mapY: currentMapY,
    };
  }

  private renderEntities(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const p = this.player;
    const now = performance.now();

    const sortedEntities = [...this.entities].sort((a, b) => {
      return this.dist(b.pos, p.pos) - this.dist(a.pos, p.pos);
    });

    for (const entity of sortedEntities) {
      const dx = entity.pos.x - p.pos.x;
      const dy = entity.pos.y - p.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.3) continue;

      const angle = Math.atan2(dy, dx) - p.dir;
      let normAngle = angle;
      while (normAngle > Math.PI) normAngle -= 2 * Math.PI;
      while (normAngle < -Math.PI) normAngle += 2 * Math.PI;

      const fov = Math.PI / 3;
      if (Math.abs(normAngle) > fov + 0.3) continue;

      // Check illumination from pulses
      let illumination = 0;
      for (const pulse of this.pulses) {
        const distToOrigin = this.dist(entity.pos, pulse.origin);
        const elapsed = now - pulse.startTime;
        const progress = Math.min(1, elapsed / pulse.duration);
        const currentRadius = pulse.radius * progress;

        // Entity is behind the wavefront (illuminated and fading)
        if (distToOrigin < currentRadius) {
          const fadeElapsed = now - (pulse.startTime + (distToOrigin / pulse.radius) * pulse.duration);
          if (fadeElapsed < FADE_DURATION) {
            const fadeIntensity = pulse.intensity * (1 - fadeElapsed / FADE_DURATION);
            const distFade = 1 - distToOrigin / (pulse.radius + 1);
            illumination = Math.max(illumination, fadeIntensity * distFade);
          }
        }
        // Entity is at the wavefront (brightest)
        else if (distToOrigin < currentRadius + 2) {
          const wavefrontIntensity = pulse.intensity * (1 - progress * 0.3);
          const distFade = 1 - distToOrigin / (pulse.radius + 1);
          illumination = Math.max(illumination, wavefrontIntensity * distFade);
        }
      }

      // Also illuminate entities based on wall illumination near them
      const entityMapX = Math.floor(entity.pos.x);
      const entityMapY = Math.floor(entity.pos.y);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const key = wallKey(entityMapX + ox, entityMapY + oy, 0);
          const wallIllum = this.illumination.get(key);
          if (wallIllum) {
            const ci = this.getCurrentIntensity(wallIllum);
            illumination = Math.max(illumination, ci * 0.5);
          }
        }
      }

      if (illumination < 0.03) continue;

      const screenX = w / 2 + (normAngle / fov) * (w / 2);
      const spriteHeight = h / dist;
      const spriteWidth = spriteHeight * 0.5;

      const drawY = (h - spriteHeight) / 2;

      const alpha = Math.min(1, illumination * Math.max(0.2, 1 - dist / 20));
      if (alpha < 0.03) continue;

      const entityColor = NEON_COLORS.entity;
      const glowColor = NEON_COLORS.entityGlow;

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

      // Body outline with neon
      ctx.strokeStyle = entityColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = entityColor;
      ctx.shadowBlur = 20;

      const cx = screenX;
      const bodyW = spriteWidth * 0.35;
      const headR = spriteWidth * 0.22;

      // Head - distorted circle
      ctx.beginPath();
      ctx.ellipse(cx, drawY + spriteHeight * 0.15 + headR, headR, headR * 1.2, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Body
      ctx.beginPath();
      ctx.moveTo(cx, drawY + spriteHeight * 0.15 + headR * 2);
      ctx.lineTo(cx, drawY + spriteHeight * 0.55);
      ctx.stroke();

      // Arms - twitching
      const armWave = Math.sin(entity.animPhase) * spriteWidth * 0.2;
      const armDroop = entity.state === 'chase' ? 0.3 : 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - bodyW * 1.2, drawY + spriteHeight * armDroop + armWave);
      ctx.lineTo(cx, drawY + spriteHeight * 0.25);
      ctx.lineTo(cx + bodyW * 1.2, drawY + spriteHeight * armDroop - armWave);
      ctx.stroke();

      // Legs
      const legWave = Math.sin(entity.animPhase * 1.3) * spriteWidth * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx - bodyW * 0.8, drawY + spriteHeight * 0.9 + legWave);
      ctx.lineTo(cx, drawY + spriteHeight * 0.55);
      ctx.lineTo(cx + bodyW * 0.8, drawY + spriteHeight * 0.9 - legWave);
      ctx.stroke();

      // Eyes - menacing red dots
      if (dist < 10 && alpha > 0.1) {
        const eyeAlpha = Math.min(1, alpha * 2);
        const eyeSize = dist < 5 ? 3 : 2;
        ctx.fillStyle = this.colorWithAlpha('#ff0000', eyeAlpha);
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cx - headR * 0.35, drawY + spriteHeight * 0.15 + headR * 0.85, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + headR * 0.35, drawY + spriteHeight * 0.15 + headR * 0.85, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Eye glow
        if (dist < 3) {
          ctx.fillStyle = this.colorWithAlpha('#ff0000', eyeAlpha * 0.15);
          ctx.beginPath();
          ctx.arc(cx - headR * 0.35, drawY + spriteHeight * 0.15 + headR * 0.85, eyeSize * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + headR * 0.35, drawY + spriteHeight * 0.15 + headR * 0.85, eyeSize * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

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

  private renderBreathEffect(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.player.isMoving) {
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

  private renderGlitch(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const intensity = this.glitchIntensity;

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

    // Red tint
    if (intensity > 0.4) {
      ctx.fillStyle = `rgba(255,0,0,${(intensity - 0.4) * 0.08})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private renderVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.65);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  private renderHUD(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const p = this.player;

    // Pulse cooldown bar
    const cooldownProgress = Math.max(0, 1 - this.pulseCooldownTimer / this.config.pulseCooldown);
    const barWidth = 140;
    const barHeight = 4;
    const barX = 20;
    const barY = h - 45;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const barColor = cooldownProgress >= 1 ? NEON_COLORS.wall : '#444444';
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barWidth * cooldownProgress, barHeight);

    if (cooldownProgress >= 1) {
      ctx.shadowColor = NEON_COLORS.wall;
      ctx.shadowBlur = 8;
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = cooldownProgress >= 1 ? NEON_COLORS.wall : '#555555';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('[SPACE] ECOLOCACIÓN', barX, barY - 8);

    ctx.fillStyle = '#444444';
    ctx.fillText('[E] GOLPE SUAVE', barX, barY + 20);

    // Sneak indicator
    if (p.isSneaking) {
      ctx.fillStyle = 'rgba(100,100,100,0.7)';
      ctx.fillText('MODO SIGILO', barX, barY + 36);
    }

    // Danger indicator
    if (this.closestEntityDist < 10) {
      const dangerAlpha = Math.min(1, (10 - this.closestEntityDist) / 10);
      const dangerPulse = Math.sin(performance.now() * 0.006) * 0.5 + 0.5;

      ctx.fillStyle = this.colorWithAlpha(NEON_COLORS.entity, dangerAlpha * (0.4 + dangerPulse * 0.6));
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';

      if (this.closestEntityDist < 3) {
        ctx.fillText('⚠ PELIGRO ⚠', w / 2, 45);
      } else if (this.closestEntityDist < 6) {
        ctx.fillText('ALGO SE ACERCA...', w / 2, 45);
      } else {
        ctx.fillText('Presencia detectada', w / 2, 45);
      }
      ctx.textAlign = 'left';
    }

    // Compass pointing to exit
    const compassX = w - 50;
    const compassY = 40;
    const compassR = 18;

    ctx.strokeStyle = 'rgba(0,229,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(compassX, compassY, compassR, 0, Math.PI * 2);
    ctx.stroke();

    const exitDx = this.map.exitPos.x - p.pos.x;
    const exitDy = this.map.exitPos.y - p.pos.y;
    const exitAngle = Math.atan2(exitDy, exitDx) - p.dir;
    const exitDist = Math.sqrt(exitDx * exitDx + exitDy * exitDy);

    ctx.strokeStyle = this.colorWithAlpha(NEON_COLORS.exit, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(compassX, compassY);
    ctx.lineTo(
      compassX + Math.cos(exitAngle) * compassR * 0.7,
      compassY + Math.sin(exitAngle) * compassR * 0.7
    );
    ctx.stroke();

    ctx.fillStyle = this.colorWithAlpha(NEON_COLORS.exit, 0.4);
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SALIDA', compassX, compassY + compassR + 12);
    ctx.fillText(`${Math.round(exitDist)}m`, compassX, compassY + compassR + 24);
    ctx.textAlign = 'left';

    // Controls hint (fades out)
    const gameTime = (performance.now() - this.gameStartTime) / 1000;
    if (gameTime < 12) {
      const hintAlpha = Math.max(0, 1 - gameTime / 12);
      ctx.fillStyle = `rgba(120,120,120,${hintAlpha})`;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WASD: Mover | Ratón: Mirar | SHIFT: Sigilo | Click para capturar ratón', w / 2, h - 12);
      ctx.textAlign = 'left';
    }
  }

  private renderDeathScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const elapsed = performance.now() - this.deathTimer;
    const fadeIn = Math.min(1, elapsed / 2000);

    ctx.fillStyle = `rgba(60,0,0,${fadeIn * 0.8})`;
    ctx.fillRect(0, 0, w, h);

    // Static noise
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = `rgba(255,0,0,${Math.random() * fadeIn * 0.25})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 5, 1);
    }

    // Scan lines
    ctx.fillStyle = `rgba(0,0,0,${fadeIn * 0.15})`;
    for (let y = 0; y < h; y += 2) {
      ctx.fillRect(0, y, w, 1);
    }

    if (fadeIn > 0.3) {
      const textAlpha = (fadeIn - 0.3) / 0.7;
      ctx.fillStyle = `rgba(255,20,20,${textAlpha})`;
      ctx.font = 'bold 44px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 25;
      ctx.fillText('TE ENCONTRARON', w / 2, h / 2 - 30);
      ctx.shadowBlur = 0;

      ctx.fillStyle = `rgba(180,180,180,${textAlpha * 0.6})`;
      ctx.font = '16px monospace';
      ctx.fillText('Las sombras te consumieron...', w / 2, h / 2 + 15);

      ctx.fillStyle = `rgba(0,229,255,${textAlpha * 0.7})`;
      ctx.font = '13px monospace';
      ctx.fillText('Pulsa R para reintentar', w / 2, h / 2 + 50);

      ctx.textAlign = 'left';
    }
  }

  private renderWinScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = 'rgba(0,20,0,0.85)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = NEON_COLORS.exit;
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = NEON_COLORS.exit;
    ctx.shadowBlur = 25;
    ctx.fillText('SOBREVIVISTE', w / 2, h / 2 - 30);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(180,255,180,0.6)';
    ctx.font = '16px monospace';
    ctx.fillText('Encontraste la salida entre la oscuridad', w / 2, h / 2 + 15);

    ctx.fillStyle = this.colorWithAlpha(NEON_COLORS.wall, 0.7);
    ctx.font = '13px monospace';
    ctx.fillText('Pulsa R para jugar de nuevo', w / 2, h / 2 + 50);

    ctx.textAlign = 'left';
  }

  private renderPausedScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = NEON_COLORS.wall;
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSADO', w / 2, h / 2 - 15);

    ctx.fillStyle = 'rgba(180,180,180,0.5)';
    ctx.font = '13px monospace';
    ctx.fillText('Pulsa ESC para continuar', w / 2, h / 2 + 20);
    ctx.textAlign = 'left';
  }

  // Utility
  private dist(a: Vec2, b: Vec2): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  private colorWithAlpha(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
  }

  // Game loop
  private _animFrame: number = 0;

  startLoop() {
    this.lastTime = performance.now();

    const loop = (timestamp: number) => {
      this.update(timestamp);
      this.render();
      this._animFrame = requestAnimationFrame(loop);
    };

    this._animFrame = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
    }
    this.audio.stopAll();
  }

  destroy() {
    this.stopLoop();
    this._cleanup?.();
    this.audio.destroy();
  }

  resize(w: number, h: number) {
    if (this.canvas) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.width = w;
      this.height = h;
    }
  }
}
