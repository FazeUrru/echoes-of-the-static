'use client';

export interface SaveData {
  version: string;
  timestamp: number;
  playerName: string;
  unlockedChapters: number;
  currentChapter: number;
  difficulty: string;
  hardcoreMode: boolean;
  coopRole: string;
  profile: Record<string, unknown>;
  advanced: Record<string, unknown>;
  controls: { action: string; label: string; key: string }[];
  unlockedCharacters: { chapterId: number; tier: string; characterName: string; characterIcon: string }[];
  bestTimes: { chapterId: number; timeSeconds: number; difficulty: string }[];
  totalPoints: number;
  playTime: number; // total seconds played
  customLevels: unknown[]; // saved custom levels
  achievements: string[];
}

const SAVE_KEY = 'echoes_save';
const SAVE_VERSION = '2.5';

function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    playerName: 'Jugador',
    unlockedChapters: 1,
    currentChapter: 1,
    difficulty: 'medium',
    hardcoreMode: false,
    coopRole: 'none',
    profile: {},
    advanced: {},
    controls: [],
    unlockedCharacters: [],
    bestTimes: [],
    totalPoints: 0,
    playTime: 0,
    customLevels: [],
    achievements: [],
  };
}

export function saveGame(data: SaveData): void {
  try {
    data.version = SAVE_VERSION;
    data.timestamp = Date.now();
    const json = JSON.stringify(data);
    localStorage.setItem(SAVE_KEY, json);
  } catch (e) {
    console.error('Failed to save game:', e);
  }
}

export function loadGame(): SaveData | null {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return null;
    const data = JSON.parse(json) as SaveData;
    // Basic validation
    if (!data.version || !data.timestamp) return null;
    return data;
  } catch (e) {
    console.error('Failed to load game:', e);
    return null;
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    console.error('Failed to delete save:', e);
  }
}

export function autoSave(data: SaveData): void {
  saveGame(data);
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function exportSave(): string {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return '';
    return btoa(unescape(encodeURIComponent(json)));
  } catch (e) {
    console.error('Failed to export save:', e);
    return '';
  }
}

export function importSave(data: string): boolean {
  try {
    const json = decodeURIComponent(escape(atob(data)));
    const parsed = JSON.parse(json);
    if (!parsed.version || !parsed.timestamp) return false;
    localStorage.setItem(SAVE_KEY, json);
    return true;
  } catch (e) {
    console.error('Failed to import save:', e);
    return false;
  }
}

export function buildSaveData(params: {
  playerName: string;
  unlockedChapters: number;
  currentChapter: number;
  difficulty: string;
  hardcoreMode: boolean;
  coopRole: string;
  profile: Record<string, unknown>;
  advanced: Record<string, unknown>;
  controls: { action: string; label: string; key: string }[];
  unlockedCharacters: { chapterId: number; tier: string; characterName: string; characterIcon: string }[];
  bestTimes: { chapterId: number; timeSeconds: number; difficulty: string }[];
  totalPoints: number;
  playTime: number;
  customLevels: unknown[];
  achievements: string[];
}): SaveData {
  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    ...params,
  };
}

export { createDefaultSave, SAVE_VERSION };
