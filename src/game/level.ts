// ============================================================
// Echoes of the Static - Level Generator
// ============================================================

import { CellType, GameMap, Vec2 } from './types';

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  centerX: number;
  centerY: number;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function generateLevel(
  width: number,
  height: number,
  roomCount: number,
  seed?: number
): GameMap {
  // Simple seeded random for reproducibility (optional)
  if (seed !== undefined) {
    let s = seed;
    const origRandom = Math.random;
    // Override Math.random with seeded version
    (Math as unknown as Record<string, () => number>).random = () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const map = generateLevelInner(width, height, roomCount);
    (Math as unknown as Record<string, () => number>).random = origRandom;
    return map;
  }
  return generateLevelInner(width, height, roomCount);
}

function generateLevelInner(
  width: number,
  height: number,
  roomCount: number
): GameMap {
  // Initialize with all walls
  const cells: CellType[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = 1;
    }
  }

  // Generate rooms
  const rooms: Room[] = [];
  const maxAttempts = roomCount * 20;

  for (let i = 0; i < maxAttempts && rooms.length < roomCount; i++) {
    const w = randInt(4, 8);
    const h = randInt(4, 8);
    const x = randInt(2, width - w - 2);
    const y = randInt(2, height - h - 2);

    // Check for overlap with existing rooms (with padding)
    let overlaps = false;
    for (const room of rooms) {
      if (
        x - 1 < room.x + room.w + 1 &&
        x + w + 1 > room.x - 1 &&
        y - 1 < room.y + room.h + 1 &&
        y + h + 1 > room.y - 1
      ) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      rooms.push({
        x,
        y,
        w,
        h,
        centerX: Math.floor(x + w / 2),
        centerY: Math.floor(y + h / 2),
      });

      // Carve room
      for (let ry = y; ry < y + h; ry++) {
        for (let rx = x; rx < x + w; rx++) {
          cells[ry][rx] = 0;
        }
      }
    }
  }

  // Connect rooms with corridors (L-shaped corridors)
  for (let i = 1; i < rooms.length; i++) {
    const roomA = rooms[i - 1];
    const roomB = rooms[i];

    // Randomly go horizontal then vertical or vice versa
    if (Math.random() < 0.5) {
      carveHCorridor(cells, roomA.centerX, roomB.centerX, roomA.centerY);
      carveVCorridor(cells, roomA.centerY, roomB.centerY, roomB.centerX);
    } else {
      carveVCorridor(cells, roomA.centerY, roomB.centerY, roomA.centerX);
      carveHCorridor(cells, roomA.centerX, roomB.centerX, roomB.centerY);
    }
  }

  // Add some extra corridors for loops
  for (let i = 0; i < Math.floor(roomCount / 2); i++) {
    const roomA = rooms[randInt(0, rooms.length - 1)];
    const roomB = rooms[randInt(0, rooms.length - 1)];
    if (roomA !== roomB) {
      if (Math.random() < 0.5) {
        carveHCorridor(cells, roomA.centerX, roomB.centerX, roomA.centerY);
        carveVCorridor(cells, roomA.centerY, roomB.centerY, roomB.centerX);
      } else {
        carveVCorridor(cells, roomA.centerY, roomB.centerY, roomA.centerX);
        carveHCorridor(cells, roomA.centerX, roomB.centerX, roomB.centerY);
      }
    }
  }

  // Place exit in the last room
  const lastRoom = rooms[rooms.length - 1];
  const exitPos: Vec2 = {
    x: lastRoom.centerX + 0.5,
    y: lastRoom.centerY + 0.5,
  };
  cells[lastRoom.centerY][lastRoom.centerX] = 2; // Exit marker

  // Create wall illumination map
  const wallIllumination = new Map<string, {
    intensity: number;
    timestamp: number;
    color: string;
  }>();

  return {
    width,
    height,
    cells,
    wallIllumination,
    startRoom: rooms[0]
      ? { x: rooms[0].x, y: rooms[0].y, w: rooms[0].w, h: rooms[0].h }
      : { x: 5, y: 5, w: 5, h: 5 },
    exitPos,
  };
}

function carveHCorridor(
  cells: CellType[][],
  x1: number,
  x2: number,
  y: number
) {
  const startX = Math.min(x1, x2);
  const endX = Math.max(x1, x2);
  for (let x = startX; x <= endX; x++) {
    if (y >= 0 && y < cells.length && x >= 0 && x < cells[0].length) {
      if (cells[y][x] === 1) cells[y][x] = 0;
    }
  }
}

function carveVCorridor(
  cells: CellType[][],
  y1: number,
  y2: number,
  x: number
) {
  const startY = Math.min(y1, y2);
  const endY = Math.max(y1, y2);
  for (let y = startY; y <= endY; y++) {
    if (y >= 0 && y < cells.length && x >= 0 && x < cells[0].length) {
      if (cells[y][x] === 1) cells[y][x] = 0;
    }
  }
}

// Find a valid spawn position for entities (must be in open space, far from player)
export function findEntitySpawnPositions(
  map: GameMap,
  count: number,
  playerPos: Vec2,
  minDist: number = 10
): Vec2[] {
  const openSpaces: Vec2[] = [];

  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      if (map.cells[y][x] === 0) {
        const dist = Math.sqrt(
          (x + 0.5 - playerPos.x) ** 2 + (y + 0.5 - playerPos.y) ** 2
        );
        if (dist >= minDist) {
          openSpaces.push({ x: x + 0.5, y: y + 0.5 });
        }
      }
    }
  }

  // Shuffle and pick
  for (let i = openSpaces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [openSpaces[i], openSpaces[j]] = [openSpaces[j], openSpaces[i]];
  }

  return openSpaces.slice(0, count);
}

// Check if a position is walkable
export function isWalkable(map: GameMap, x: number, y: number): boolean {
  const mapX = Math.floor(x);
  const mapY = Math.floor(y);
  if (mapX < 0 || mapX >= map.width || mapY < 0 || mapY >= map.height) {
    return false;
  }
  return map.cells[mapY][mapX] !== 1;
}

// Check if a position is the exit
export function isExit(map: GameMap, x: number, y: number): boolean {
  const mapX = Math.floor(x);
  const mapY = Math.floor(y);
  if (mapX < 0 || mapX >= map.width || mapY < 0 || mapY >= map.height) {
    return false;
  }
  return map.cells[mapY][mapX] === 2;
}

// Get wall illumination key
export function wallKey(x: number, y: number, side: number): string {
  return `${x},${y},${side}`;
}
