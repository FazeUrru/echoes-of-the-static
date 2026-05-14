// ============================================================
// Echoes of the Static - Level Generator v2.5
// ============================================================

import { GameMap, Door, Vec2, Chapter, CHAPTERS, Difficulty, DIFFICULTY_CONFIGS, CustomLevel, EditorCell } from './types';
import { ITEM_SPAWN_TABLES, ITEM_BY_ID } from './items';

interface Room {
  x: number; y: number; w: number; h: number;
  centerX: number; centerY: number;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateLevel(chapterId: number, difficulty: Difficulty): GameMap {
  const chapter = CHAPTERS.find(c => c.id === chapterId) || CHAPTERS[0];
  const diffConfig = DIFFICULTY_CONFIGS[difficulty];
  const width = chapter.mapWidth;
  const height = chapter.mapHeight;

  // Initialize with all walls
  const cells: number[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = 1;
    }
  }

  // Generate rooms
  const rooms: Room[] = [];
  const roomCount = Math.max(3, Math.floor(chapter.roomCount * diffConfig.itemSpawnRate));
  const maxAttempts = roomCount * 30;

  for (let i = 0; i < maxAttempts && rooms.length < roomCount; i++) {
    let w: number, h: number;
    if (chapter.hasOutdoor && Math.random() < 0.3) {
      // Outdoor areas are bigger
      w = randInt(6, 14);
      h = randInt(6, 14);
    } else {
      w = randInt(4, 8);
      h = randInt(4, 8);
    }
    const x = randInt(2, width - w - 2);
    const y = randInt(2, height - h - 2);

    let overlaps = false;
    for (const room of rooms) {
      if (x - 1 < room.x + room.w + 1 && x + w + 1 > room.x - 1 &&
          y - 1 < room.y + room.h + 1 && y + h + 1 > room.y - 1) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      rooms.push({ x, y, w, h, centerX: Math.floor(x + w / 2), centerY: Math.floor(y + h / 2) });
      for (let ry = y; ry < y + h; ry++) {
        for (let rx = x; rx < x + w; rx++) {
          cells[ry][rx] = 0;
        }
      }
    }
  }

  // Connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    if (Math.random() < 0.5) {
      carveH(cells, a.centerX, b.centerX, a.centerY);
      carveV(cells, a.centerY, b.centerY, b.centerX);
    } else {
      carveV(cells, a.centerY, b.centerY, a.centerX);
      carveH(cells, a.centerX, b.centerX, b.centerY);
    }
  }

  // Extra corridors
  for (let i = 0; i < Math.floor(roomCount / 3); i++) {
    const a = rooms[randInt(0, rooms.length - 1)];
    const b = rooms[randInt(0, rooms.length - 1)];
    if (a !== b) {
      if (Math.random() < 0.5) {
        carveH(cells, a.centerX, b.centerX, a.centerY);
        carveV(cells, a.centerY, b.centerY, b.centerX);
      } else {
        carveV(cells, a.centerY, b.centerY, a.centerX);
        carveH(cells, a.centerX, b.centerX, b.centerY);
      }
    }
  }

  // Place doors between corridors and rooms
  const doors: Door[] = [];
  if (chapter.hasDoors) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (cells[y][x] !== 0) continue;
        // Check for doorway patterns (narrow passage)
        const isHorzPassage = cells[y][x - 1] === 0 && cells[y][x + 1] === 0 &&
                               cells[y - 1][x] === 1 && cells[y + 1][x] === 1;
        const isVertPassage = cells[y - 1][x] === 0 && cells[y + 1][x] === 0 &&
                               cells[y][x - 1] === 1 && cells[y][x + 1] === 1;

        if ((isHorzPassage || isVertPassage) && Math.random() < 0.15) {
          cells[y][x] = 3; // Door cell
          const isLocked = Math.random() < 0.2;
          doors.push({
            x, y,
            isOpen: false,
            isLocked,
            keyId: isLocked ? ['key_rusty', 'key_sewer', 'key_hospital', 'keycard_blue'][randInt(0, 3)] : undefined,
            health: 3,
            side: isHorzPassage ? 0 : 1,
          });
        }
      }
    }
  }

  // Place exit
  const lastRoom = rooms[rooms.length - 1];
  const exitPos: Vec2 = { x: lastRoom.centerX + 0.5, y: lastRoom.centerY + 0.5 };
  cells[lastRoom.centerY][lastRoom.centerX] = 2;

  // Place items
  const items: { itemId: string; pos: Vec2 }[] = [];
  const spawnTable = ITEM_SPAWN_TABLES[chapter.mapType] || ITEM_SPAWN_TABLES.building;
  const numItems = Math.floor(rooms.length * 1.5 * diffConfig.itemSpawnRate);

  for (let i = 0; i < numItems; i++) {
    const itemId = spawnTable[randInt(0, spawnTable.length - 1)];
    const room = rooms[randInt(0, rooms.length - 1)];
    const pos: Vec2 = {
      x: room.x + 1 + Math.random() * (room.w - 2),
      y: room.y + 1 + Math.random() * (room.h - 2),
    };
    // Verify walkable
    if (isWalkable({ width, height, cells, startRoom: { x: 0, y: 0, w: 0, h: 0 }, exitPos: { x: 0, y: 0 }, doors, items: [], isOutdoor: false, silentZones: [], whiteNoiseZones: [] }, pos.x, pos.y)) {
      items.push({ itemId, pos });
    }
  }

  const isOutdoor = chapter.hasOutdoor;

  // Designate silent zones and white noise zones from rooms
  const silentZones: { x: number; y: number; w: number; h: number }[] = [];
  const whiteNoiseZones: { x: number; y: number; w: number; h: number }[] = [];

  // Skip first room (start room) and last room (exit room)
  const candidateRooms = rooms.slice(1, -1);
  // Shuffle candidate rooms
  for (let i = candidateRooms.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidateRooms[i], candidateRooms[j]] = [candidateRooms[j], candidateRooms[i]];
  }

  // Silent zones: ~15% of rooms, 1-2 per level
  const silentCount = Math.min(candidateRooms.length, Math.max(1, Math.round(rooms.length * 0.15)));
  for (let i = 0; i < silentCount && i < candidateRooms.length; i++) {
    const room = candidateRooms[i];
    silentZones.push({ x: room.x, y: room.y, w: room.w, h: room.h });
  }

  // White noise zones: ~10% of rooms, 1 per level
  const wnStart = silentCount;
  if (wnStart < candidateRooms.length) {
    const room = candidateRooms[wnStart];
    whiteNoiseZones.push({ x: room.x, y: room.y, w: room.w, h: room.h });
  }

  return {
    width, height, cells,
    startRoom: rooms[0] ? { x: rooms[0].x, y: rooms[0].y, w: rooms[0].w, h: rooms[0].h } : { x: 5, y: 5, w: 5, h: 5 },
    exitPos, doors, items, isOutdoor, silentZones, whiteNoiseZones,
  };
}

function carveH(cells: number[][], x1: number, x2: number, y: number) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    if (y >= 0 && y < cells.length && x >= 0 && x < cells[0].length) {
      if (cells[y][x] === 1) cells[y][x] = 0;
    }
  }
}

function carveV(cells: number[][], y1: number, y2: number, x: number) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
    if (y >= 0 && y < cells.length && x >= 0 && x < cells[0].length) {
      if (cells[y][x] === 1) cells[y][x] = 0;
    }
  }
}

export function findEntitySpawnPositions(
  map: GameMap, count: number, playerPos: Vec2, minDist: number = 8
): Vec2[] {
  const open: Vec2[] = [];
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      if (map.cells[y][x] === 0) {
        const dist = Math.sqrt((x + 0.5 - playerPos.x) ** 2 + (y + 0.5 - playerPos.y) ** 2);
        if (dist >= minDist) open.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
  }
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  return open.slice(0, count);
}

export function isWalkable(map: GameMap, x: number, y: number): boolean {
  const mx = Math.floor(x), my = Math.floor(y);
  if (mx < 0 || mx >= map.width || my < 0 || my >= map.height) return false;
  const cell = map.cells[my][mx];
  if (cell === 1) return false;
  if (cell === 3) {
    // Door - check if open
    const door = map.doors.find(d => d.x === mx && d.y === my);
    return door ? door.isOpen : false;
  }
  return true;
}

export function isExit(map: GameMap, x: number, y: number): boolean {
  const mx = Math.floor(x), my = Math.floor(y);
  if (mx < 0 || mx >= map.width || my < 0 || my >= map.height) return false;
  return map.cells[my][mx] === 2;
}

export function isDoor(map: GameMap, x: number, y: number): Door | null {
  return map.doors.find(d => d.x === Math.floor(x) && d.y === Math.floor(y)) || null;
}

export function wallKey(x: number, y: number, side: number): string {
  return `${x},${y},${side}`;
}

export function findItemNearby(map: GameMap, x: number, y: number, radius: number = 1.5): { itemId: string; pos: Vec2; index: number } | null {
  let closest: { itemId: string; pos: Vec2; index: number } | null = null;
  let closestDist = radius;
  map.items.forEach((item, index) => {
    const dist = Math.sqrt((item.pos.x - x) ** 2 + (item.pos.y - y) ** 2);
    if (dist < closestDist) {
      closestDist = dist;
      closest = { ...item, index };
    }
  });
  return closest;
}

export function isInZone(pos: Vec2, zones: { x: number; y: number; w: number; h: number }[]): boolean {
  for (const zone of zones) {
    if (pos.x >= zone.x && pos.x <= zone.x + zone.w &&
        pos.y >= zone.y && pos.y <= zone.y + zone.h) {
      return true;
    }
  }
  return false;
}

// ============================================================
// Custom Level Conversion
// ============================================================

const CELL_TYPE_TO_NUM: Record<EditorCell['type'], number> = {
  empty: 0,
  wall: 1,
  exit: 2,
  door: 3,
  silentZone: 0,  // silent zones are walkable empty cells marked as zones
  whiteNoiseZone: 0, // white noise zones are walkable empty cells marked as zones
};

export function customLevelToGameMap(level: CustomLevel): GameMap {
  const { width, height, cells, playerStart } = level;

  // Convert cell types to numeric grid
  const numericCells: number[][] = [];
  const doors: Door[] = [];
  const items: { itemId: string; pos: Vec2 }[] = [];
  const silentZones: { x: number; y: number; w: number; h: number }[] = [];
  const whiteNoiseZones: { x: number; y: number; w: number; h: number }[] = [];
  let exitPos: Vec2 = { x: 0, y: 0 };

  for (let y = 0; y < height; y++) {
    numericCells[y] = [];
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      numericCells[y][x] = CELL_TYPE_TO_NUM[cell.type];

      // Track exit
      if (cell.type === 'exit') {
        exitPos = { x: x + 0.5, y: y + 0.5 };
      }

      // Create doors
      if (cell.type === 'door') {
        numericCells[y][x] = 3;
        // Determine door side based on neighbors
        const leftWall = x > 0 && cells[y][x - 1].type === 'wall';
        const rightWall = x < width - 1 && cells[y][x + 1].type === 'wall';
        const side = (leftWall || rightWall) ? 1 : 0;
        doors.push({
          x, y,
          isOpen: false,
          isLocked: false,
          health: 3,
          side,
        });
      }

      // Track item spawns
      if (cell.itemSpawn) {
        items.push({
          itemId: cell.itemSpawn,
          pos: { x: x + 0.5, y: y + 0.5 },
        });
      }

      // Silent and white noise zones are single cells - group adjacent ones
      if (cell.type === 'silentZone') {
        silentZones.push({ x, y, w: 1, h: 1 });
      }
      if (cell.type === 'whiteNoiseZone') {
        whiteNoiseZones.push({ x, y, w: 1, h: 1 });
      }
    }
  }

  // Merge adjacent silent/whiteNoise zones into larger rectangles
  const mergedSilentZones = mergeZones(silentZones);
  const mergedWhiteNoiseZones = mergeZones(whiteNoiseZones);

  // Start room around player start position
  const startRoom = {
    x: Math.max(0, playerStart.x - 2),
    y: Math.max(0, playerStart.y - 2),
    w: 5,
    h: 5,
  };

  return {
    width,
    height,
    cells: numericCells,
    startRoom,
    exitPos,
    doors,
    items,
    isOutdoor: false,
    silentZones: mergedSilentZones,
    whiteNoiseZones: mergedWhiteNoiseZones,
  };
}

/**
 * Merge adjacent 1x1 zones into larger rectangular zones.
 * Simple greedy approach: scan rows and merge horizontally adjacent cells,
 * then try to merge vertically adjacent rectangles.
 */
function mergeZones(zones: { x: number; y: number; w: number; h: number }[]): { x: number; y: number; w: number; h: number }[] {
  if (zones.length === 0) return [];

  // Build a set for quick lookup
  const zoneSet = new Set(zones.map(z => `${z.x},${z.y}`));

  const visited = new Set<string>();
  const merged: { x: number; y: number; w: number; h: number }[] = [];

  for (const zone of zones) {
    const key = `${zone.x},${zone.y}`;
    if (visited.has(key)) continue;

    // BFS/expand from this cell
    let minX = zone.x, minY = zone.y, maxX = zone.x, maxY = zone.y;

    // Try expanding right and down
    let expanded = true;
    while (expanded) {
      expanded = false;

      // Try expanding right
      let canExpandRight = true;
      for (let y = minY; y <= maxY; y++) {
        if (!zoneSet.has(`${maxX + 1},${y}`)) { canExpandRight = false; break; }
      }
      if (canExpandRight) { maxX++; expanded = true; }

      // Try expanding down
      let canExpandDown = true;
      for (let x = minX; x <= maxX; x++) {
        if (!zoneSet.has(`${x},${maxY + 1}`)) { canExpandDown = false; break; }
      }
      if (canExpandDown) { maxY++; expanded = true; }

      // Try expanding left
      let canExpandLeft = true;
      for (let y = minY; y <= maxY; y++) {
        if (!zoneSet.has(`${minX - 1},${y}`)) { canExpandLeft = false; break; }
      }
      if (canExpandLeft) { minX--; expanded = true; }

      // Try expanding up
      let canExpandUp = true;
      for (let x = minX; x <= maxX; x++) {
        if (!zoneSet.has(`${x},${minY - 1}`)) { canExpandUp = false; break; }
      }
      if (canExpandUp) { minY--; expanded = true; }
    }

    // Mark all cells in the merged rectangle as visited
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        visited.add(`${x},${y}`);
      }
    }

    merged.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }

  return merged;
}
