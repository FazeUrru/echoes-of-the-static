// ============================================================
// Echoes of the Static - Level Editor Utilities
// ============================================================

import { CustomLevel, EditorCell, GameMap } from './types';
import { customLevelToGameMap } from './level';

export { customLevelToGameMap };

const STORAGE_KEY = 'echoes_custom_levels';

/** Create a new empty level filled with walls, with a small cleared start area */
export function createEmptyLevel(width: number, height: number): CustomLevel {
  const cells: EditorCell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = {
        type: 'wall',
        acousticProperty: 'normal',
      };
    }
  }

  // Clear a small 3x3 area in the center for the player start
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        cells[ny][nx] = {
          type: 'empty',
          acousticProperty: 'normal',
        };
      }
    }
  }

  return {
    name: 'Nivel sin nombre',
    width,
    height,
    cells,
    playerStart: { x: cx, y: cy },
    acousticProfile: {
      globalEcho: 0,
      globalAbsorption: 0,
      globalReflection: 0,
    },
  };
}

/** Validate a custom level for playability */
export function validateLevel(level: CustomLevel): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for exit
  let hasExit = false;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.cells[y][x].type === 'exit') {
        hasExit = true;
      }
    }
  }
  if (!hasExit) {
    errors.push('El nivel necesita al menos una salida (EXIT)');
  }

  // Check player start is valid (not on a wall)
  const ps = level.playerStart;
  if (ps.x < 0 || ps.x >= level.width || ps.y < 0 || ps.y >= level.height) {
    errors.push('La posición de inicio del jugador está fuera del mapa');
  } else if (level.cells[ps.y][ps.x].type === 'wall') {
    errors.push('La posición de inicio del jugador está sobre una pared');
  }

  // Check player start exists on walkable terrain
  let hasPlayerStart = false;
  if (ps.x >= 0 && ps.x < level.width && ps.y >= 0 && ps.y < level.height) {
    const cellType = level.cells[ps.y][ps.x].type;
    hasPlayerStart = cellType !== 'wall';
  }
  if (!hasPlayerStart) {
    errors.push('El jugador no tiene una posición de inicio válida');
  }

  // Check reachability: player start must be able to reach an exit
  if (hasExit && hasPlayerStart) {
    const reachable = checkReachability(level);
    if (!reachable) {
      errors.push('La salida no es alcanzable desde la posición de inicio');
    }
  }

  // Check entity count (max 10)
  let entityCount = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.cells[y][x].entitySpawn) {
        entityCount++;
      }
    }
  }
  if (entityCount > 10) {
    errors.push(`Demasiadas entidades (${entityCount}/10). Reduce el número de spawns.`);
  }

  // Check level size
  if (level.width < 5 || level.height < 5) {
    errors.push('El nivel es demasiado pequeño (mínimo 5x5)');
  }

  return { valid: errors.length === 0, errors };
}

/** BFS reachability check from player start to exit */
function checkReachability(level: CustomLevel): boolean {
  const { width, height, cells, playerStart } = level;
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [{ x: playerStart.x, y: playerStart.y }];
  visited.add(`${playerStart.x},${playerStart.y}`);

  const walkableTypes = new Set(['empty', 'exit', 'door', 'silentZone', 'whiteNoiseZone']);

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;

    // Check if this is the exit
    if (cells[y][x].type === 'exit') {
      return true;
    }

    // Check neighbors
    const neighbors = [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ];

    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      if (visited.has(key)) continue;
      if (!walkableTypes.has(cells[n.y][n.x].type)) continue;
      visited.add(key);
      queue.push(n);
    }
  }

  return false;
}

/** Serialize a level to JSON string */
export function serializeLevel(level: CustomLevel): string {
  return JSON.stringify(level);
}

/** Deserialize a JSON string to a CustomLevel, or null if invalid */
export function deserializeLevel(json: string): CustomLevel | null {
  try {
    const parsed = JSON.parse(json);
    // Basic validation
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.name !== 'string') return null;
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null;
    if (!Array.isArray(parsed.cells)) return null;
    if (!parsed.playerStart || typeof parsed.playerStart.x !== 'number') return null;
    if (!parsed.acousticProfile) return null;

    // Validate cells array dimensions
    if (parsed.cells.length !== parsed.height) return null;
    for (let y = 0; y < parsed.height; y++) {
      if (!Array.isArray(parsed.cells[y]) || parsed.cells[y].length !== parsed.width) return null;
    }

    return parsed as CustomLevel;
  } catch {
    return null;
  }
}

/** Get all saved custom levels from localStorage */
export function getSavedLevels(): CustomLevel[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l: CustomLevel) => l && l.name && l.cells);
  } catch {
    return [];
  }
}

/** Save a custom level to localStorage (overwrites if same name) */
export function saveLevel(level: CustomLevel): void {
  if (typeof window === 'undefined') return;
  const levels = getSavedLevels();
  const existingIdx = levels.findIndex(l => l.name === level.name);
  if (existingIdx >= 0) {
    levels[existingIdx] = level;
  } else {
    levels.push(level);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}

/** Delete a saved level by name */
export function deleteLevel(name: string): void {
  if (typeof window === 'undefined') return;
  const levels = getSavedLevels();
  const filtered = levels.filter(l => l.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
