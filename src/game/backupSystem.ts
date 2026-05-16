// ============================================================
// Echoes of the Static - Full Backup System v3.0
// ============================================================
// Saves COMPLETE game state including player position, health,
// inventory, entities, explored map, combat stats, and more.
// Multiple backup slots + export/import + crash recovery.

export interface FullBackupData {
  version: string;
  timestamp: number;
  slotName: string;

  // ---- Player State ----
  playerPos: { x: number; y: number };
  playerDir: number;
  playerHealth: number;
  playerMaxHealth: number;
  playerStamina: number;
  playerMaxStamina: number;
  playerFlashlightOn: boolean;
  playerFlashlightBattery: number;
  playerMaxFlashlightBattery: number;
  playerNoiseLevel: number;
  playerIsSneaking: boolean;
  playerEquippedWeapon: string | null;
  playerAttackCooldown: number;
  playerWebbed: boolean;
  playerWebTimer: number;
  playerParalyzed: boolean;
  playerParalyzeTimer: number;
  playerSelectedSlot: number;

  // ---- Inventory ----
  inventory: { itemId: string; count: number; uses: number }[];

  // ---- Entities ----
  entities: {
    id: number;
    type: string;
    pos: { x: number; y: number };
    state: string;
    health: number;
    maxHealth: number;
    speed: number;
    hearingRange: number;
    stateTimer: number;
    patrolAngle: number;
    stunTimer: number;
    hitFlashTimer: number;
    deathTimer: number;
    damage: number;
  }[];

  // ---- Explored Map ----
  exploredCells: string[];

  // ---- Combat Stats ----
  killCount: number;
  totalDamageDealt: number;
  totalDamageTaken: number;

  // ---- Game Progress ----
  currentChapter: number;
  difficulty: string;
  hardcoreMode: boolean;
  coopRole: string;
  sonarMode: string;
  playTime: number;

  // ---- Settings ----
  playerName: string;
  unlockedChapters: number;
  profile: Record<string, unknown>;
  advanced: Record<string, unknown>;
  controls: { action: string; label: string; key: string }[];
  unlockedCharacters: { chapterId: number; tier: string; characterName: string; characterIcon: string }[];
  bestTimes: { chapterId: number; timeSeconds: number; difficulty: string }[];
  totalPoints: number;
  achievements: string[];

  // ---- Hazards ----
  hazards: { x: number; y: number; type: string; radius: number; timer: number; damagePerSec: number }[];
}

const BACKUP_PREFIX = 'echoes_backup_';
const CRASH_RECOVERY_KEY = 'echoes_crash_recovery';
const MAX_SLOTS = 3;
const BACKUP_VERSION = '3.0';

// ---- Slot Management ----

export function getBackupSlots(): { slot: number; exists: boolean; data: FullBackupData | null; agoStr: string }[] {
  const slots = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const key = `${BACKUP_PREFIX}${i}`;
    try {
      const json = localStorage.getItem(key);
      if (json) {
        const data = JSON.parse(json) as FullBackupData;
        const ago = Math.floor((Date.now() - data.timestamp) / 60000);
        const agoStr = ago < 1 ? 'Ahora' : ago < 60 ? `Hace ${ago}m` : `Hace ${Math.floor(ago / 60)}h`;
        slots.push({ slot: i, exists: true, data, agoStr });
      } else {
        slots.push({ slot: i, exists: false, data: null, agoStr: '' });
      }
    } catch {
      slots.push({ slot: i, exists: false, data: null, agoStr: '' });
    }
  }
  return slots;
}

export function saveToSlot(slot: number, data: FullBackupData): boolean {
  if (slot < 1 || slot > MAX_SLOTS) return false;
  try {
    data.version = BACKUP_VERSION;
    data.timestamp = Date.now();
    data.slotName = `Slot ${slot}`;
    localStorage.setItem(`${BACKUP_PREFIX}${slot}`, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`Failed to save backup to slot ${slot}:`, e);
    return false;
  }
}

export function loadFromSlot(slot: number): FullBackupData | null {
  if (slot < 1 || slot > MAX_SLOTS) return null;
  try {
    const json = localStorage.getItem(`${BACKUP_PREFIX}${slot}`);
    if (!json) return null;
    const data = JSON.parse(json) as FullBackupData;
    if (!data.version) return null;
    return data;
  } catch (e) {
    console.error(`Failed to load backup from slot ${slot}:`, e);
    return null;
  }
}

export function deleteSlot(slot: number): boolean {
  if (slot < 1 || slot > MAX_SLOTS) return false;
  try {
    localStorage.removeItem(`${BACKUP_PREFIX}${slot}`);
    return true;
  } catch (e) {
    console.error(`Failed to delete slot ${slot}:`, e);
    return false;
  }
}

// ---- Crash Recovery (auto-saved every 30 seconds) ----

export function saveCrashRecovery(data: FullBackupData): void {
  try {
    data.version = BACKUP_VERSION;
    data.timestamp = Date.now();
    data.slotName = 'Recuperación';
    localStorage.setItem(CRASH_RECOVERY_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save crash recovery:', e);
  }
}

export function loadCrashRecovery(): FullBackupData | null {
  try {
    const json = localStorage.getItem(CRASH_RECOVERY_KEY);
    if (!json) return null;
    const data = JSON.parse(json) as FullBackupData;
    if (!data.version) return null;
    return data;
  } catch (e) {
    console.error('Failed to load crash recovery:', e);
    return null;
  }
}

export function hasCrashRecovery(): boolean {
  try {
    return localStorage.getItem(CRASH_RECOVERY_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearCrashRecovery(): void {
  try {
    localStorage.removeItem(CRASH_RECOVERY_KEY);
  } catch {
    // ignore
  }
}

// ---- Export/Import as downloadable file ----

export function exportBackupAsFile(data: FullBackupData): void {
  try {
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echoes_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Failed to export backup:', e);
  }
}

export function importBackupFromFile(): Promise<FullBackupData | null> {
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const json = ev.target?.result as string;
            const data = JSON.parse(json) as FullBackupData;
            if (!data.version || !data.timestamp) { resolve(null); return; }
            resolve(data);
          } catch {
            resolve(null);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    } catch (e) {
      console.error('Failed to import backup:', e);
      resolve(null);
    }
  });
}

// ---- Build backup from engine state ----

export function buildFullBackup(params: {
  // Player
  playerPos: { x: number; y: number };
  playerDir: number;
  playerHealth: number;
  playerMaxHealth: number;
  playerStamina: number;
  playerMaxStamina: number;
  playerFlashlightOn: boolean;
  playerFlashlightBattery: number;
  playerMaxFlashlightBattery: number;
  playerNoiseLevel: number;
  playerIsSneaking: boolean;
  playerEquippedWeapon: string | null;
  playerAttackCooldown: number;
  playerWebbed: boolean;
  playerWebTimer: number;
  playerParalyzed: boolean;
  playerParalyzeTimer: number;
  playerSelectedSlot: number;
  inventory: { itemId: string; count: number; uses: number }[];
  // Entities
  entities: FullBackupData['entities'];
  // Map
  exploredCells: string[];
  // Combat
  killCount: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  // Progress
  currentChapter: number;
  difficulty: string;
  hardcoreMode: boolean;
  coopRole: string;
  sonarMode: string;
  playTime: number;
  // Settings
  playerName: string;
  unlockedChapters: number;
  profile: Record<string, unknown>;
  advanced: Record<string, unknown>;
  controls: { action: string; label: string; key: string }[];
  unlockedCharacters: { chapterId: number; tier: string; characterName: string; characterIcon: string }[];
  bestTimes: { chapterId: number; timeSeconds: number; difficulty: string }[];
  totalPoints: number;
  achievements: string[];
  // Hazards
  hazards: FullBackupData['hazards'];
}): FullBackupData {
  return {
    version: BACKUP_VERSION,
    timestamp: Date.now(),
    slotName: '',
    ...params,
  };
}
