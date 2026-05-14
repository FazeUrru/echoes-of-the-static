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
  SPEEDRUN_CHALLENGES,
  SpeedrunReward,
  UnlockedCharacter,
  AMBIENT_LIGHT_RADIUS,
  AMBIENT_LIGHT_INTENSITY,
} from './types';
import {
  generateLevel,
  findEntitySpawnPositions,
  isWalkable,
  isExit,
  isDoor,
  wallKey,
  findItemNearby,
} from './level';
import { AudioSystem } from './audio';
import { ITEM_BY_ID } from './items';

// ---- Internal interfaces ----

interface WallIllum {
  initialIntensity: number;
  timestamp: number;
  color: string;
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

  // ---- Timing ----
  lastTime = 0;
  pulseCooldownTimer = 0;
  gameStartTime = 0;
  animFrameId = 0;

  // ---- Audio ----
  audio: AudioSystem;

  // ---- Danger tracking ----
  closestEntityDist = Infinity;

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

  // ---- FPS tracking ----
  frameCount = 0;
  fpsTime = 0;
  fps = 60;

  // ---- Callback ----
  onStateChange?: (state: GameState) => void;

  // ---- Entity ID counter ----
  private nextEntityId = 0;

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

  async startGame(chapterId: number = 1, difficulty: Difficulty = 'medium') {
    await this.audio.init();
    this.audio.resume();

    this.currentChapter = chapterId;
    this.difficulty = difficulty;
    this.initLevel();

    this.state = 'chapterIntro';
    this.introTimer = 0;
    this.onStateChange?.('chapterIntro');
  }

  private initLevel() {
    this.map = generateLevel(this.currentChapter, this.difficulty);
    this.illumination = new Map();
    this.flares = [];
    this.nextEntityId = 0;

    const sr = this.map.startRoom;
    const invSize = this.diffConfig.inventorySize;

    // Give player starting flashlight
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
      flashlightOn: true, // Start with flashlight ON
      flashlightBattery: 100,
      maxFlashlightBattery: 100,
      inventory: startingInventory,
      inventorySize: invSize,
      selectedSlot: 0,
      interactCooldown: 0,
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
          this.toggleFlashlight();
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
    const fadeDuration = this.advanced.pulseFadeDuration;
    const elapsed = performance.now() - illum.timestamp;
    if (elapsed >= fadeDuration) return 0;
    return illum.initialIntensity * (1 - elapsed / fadeDuration);
  }

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

  // ============================================================
  // Echolocation pulses
  // ============================================================

  emitPulse() {
    if (this.pulseCooldownTimer > 0) return;

    const now = performance.now();
    this.pulses.push({
      origin: { ...this.player.pos },
      radius: this.diffConfig.pulseRadius,
      startTime: now,
      duration: PULSE_ANIM_DURATION,
      intensity: 1.0,
    });

    this.pulseCooldownTimer = this.diffConfig.pulseCooldown;
    this.addSoundEvent(this.player.pos, 1.0, this.diffConfig.pulseRadius);
    this.audio.playPulse(true);
    this.audio.resume();

    // Immediate strong illumination near player
    this.illuminateArea(this.player.pos, 3, 1.0, NEON_COLORS.wall);

    this.shakeX = (Math.random() - 0.5) * 6;
    this.shakeY = (Math.random() - 0.5) * 6;
    this.shakeDecay = 300;
  }

  emitSoftPulse() {
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

  private addSoundEvent(pos: Vec2, volume: number, radius: number) {
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

  private toggleFlashlight() {
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

  private useSelectedItem() {
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

  private dropSelectedItem() {
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

  private handleInteract() {
    const p = this.player;
    if (p.interactCooldown > 0) return;
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

    if (this.state === 'chapterIntro') {
      this.introTimer += dt;
      return;
    }

    if (this.state !== 'playing') return;

    this.updatePlayer(dt);
    this.updateFlashlight(dt);
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
    p.isSneaking = this.isActionDown('sneak');
    const speed = p.isSneaking ? this.diffConfig.sneakSpeed : this.diffConfig.playerSpeed;

    let moveX = 0;
    let moveY = 0;

    if (this.isActionDown('moveForward')) {
      moveX += Math.cos(p.dir) * speed * dt;
      moveY += Math.sin(p.dir) * speed * dt;
      p.isMoving = true;
    }
    if (this.isActionDown('moveBack')) {
      moveX -= Math.cos(p.dir) * speed * dt;
      moveY -= Math.sin(p.dir) * speed * dt;
      p.isMoving = true;
    }
    if (this.isActionDown('moveLeft')) {
      moveX += Math.cos(p.dir - Math.PI / 2) * speed * dt;
      moveY += Math.sin(p.dir - Math.PI / 2) * speed * dt;
      p.isMoving = true;
    }
    if (this.isActionDown('moveRight')) {
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
      this.addSoundEvent(p.pos, 0.15, 2);
      this.illuminateArea(p.pos, 2, 0.3, NEON_COLORS.wallSide);
    }

    // Footsteps
    if (p.isMoving) {
      const now = performance.now();
      const footstepInterval = p.isSneaking ? 700 : 400;
      if (now - p.lastFootstepTime > footstepInterval) {
        p.lastFootstepTime = now;
        this.audio.playFootstep(p.isSneaking);

        const radius = p.isSneaking ? this.diffConfig.footstepRadius * 0.4 : this.diffConfig.footstepRadius;
        const volume = p.isSneaking ? 0.2 : 0.5;
        this.addSoundEvent(p.pos, volume, radius);

        // Footstep echolocation
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
    const minX = Math.max(0, Math.floor(pos.x - radius));
    const maxX = Math.min(this.map.width - 1, Math.ceil(pos.x + radius));
    const minY = Math.max(0, Math.floor(pos.y - radius));
    const maxY = Math.min(this.map.height - 1, Math.ceil(pos.y + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cell = this.map.cells[y][x];
        if (cell !== 1 && cell !== 2 && cell !== 3) continue;
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

      this.state = 'won';
      this.audio.playWin();
      this.audio.stopHeartbeat();

      // Unlock next chapter
      const nextChapter = this.currentChapter + 1;
      if (nextChapter <= CHAPTERS.length) {
        this.unlockedChapters.add(nextChapter);
      }

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

    if (this.state === 'menu') return;

    if (this.state === 'chapterIntro') {
      this.renderChapterIntro(ctx, w, h);
      return;
    }

    if (this.state === 'dead') {
      this.renderDeathScreen(ctx, w, h);
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

    this.renderRaycast(ctx, w, h);
    this.renderEntities(ctx, w, h);
    this.renderPulseWave(ctx, w, h);
    this.renderBreathEffect(ctx, w, h);

    if (this.glitchIntensity > 0.01) {
      this.renderGlitch(ctx, w, h);
    }

    this.renderVignette(ctx, w, h);

    ctx.restore();

    this.renderHUD(ctx, w, h);
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

      // Body outline with neon
      ctx.strokeStyle = entityColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = entityColor;
      ctx.shadowBlur = 20;

      const cx = screenX;
      const bodyW = spriteWidth * 0.35;
      const headR = spriteWidth * 0.22;

      // Head
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

      // Eyes - menacing colored dots
      if (dist < 10 && alpha > 0.1) {
        const eyeAlpha = Math.min(1, alpha * 2);
        const eyeSize = dist < 5 ? 3 : 2;
        ctx.fillStyle = this.colorWithAlpha(eyeColor, eyeAlpha);
        ctx.shadowColor = eyeColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cx - headR * 0.35, drawY + spriteHeight * 0.15 + headR * 0.85, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + headR * 0.35, drawY + spriteHeight * 0.15 + headR * 0.85, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Eye glow when close
        if (dist < 3) {
          ctx.fillStyle = this.colorWithAlpha(eyeColor, eyeAlpha * 0.15);
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

    // Crosshair
    if (this.profile.crosshairStyle !== 'none') {
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
