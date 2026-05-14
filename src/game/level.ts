// ============================================================
// Echoes of the Static - Level Generator v2.5
// ============================================================

import { GameMap, Door, Vec2, Chapter, CHAPTERS, Difficulty, DIFFICULTY_CONFIGS } from './types';
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
    if (isWalkable({ width, height, cells, startRoom: { x: 0, y: 0, w: 0, h: 0 }, exitPos: { x: 0, y: 0 }, doors, items: [], isOutdoor: false }, pos.x, pos.y)) {
      items.push({ itemId, pos });
    }
  }

  const isOutdoor = chapter.hasOutdoor;

  return {
    width, height, cells,
    startRoom: rooms[0] ? { x: rooms[0].x, y: rooms[0].y, w: rooms[0].w, h: rooms[0].h } : { x: 5, y: 5, w: 5, h: 5 },
    exitPos, doors, items, isOutdoor,
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
