import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3003;

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ---- Types ----
interface PlayerState {
  id: string;
  name: string;
  pos: { x: number; y: number };
  dir: number;
  health: number;
  maxHealth: number;
  isReady: boolean;
  isAlive: boolean;
  equippedWeapon: string | null;
  isMoving: boolean;
  isSneaking: boolean;
  noiseLevel: number;
  voiceEnabled: boolean;
  videoEnabled: boolean;
  ping: number;
  color: string;
}

interface Room {
  code: string;
  hostId: string;
  players: Map<string, PlayerState>;
  difficulty: string;
  chapter: number;
  maxPlayers: number;
  gameStarted: boolean;
  createdAt: number;
}

const rooms = new Map<string, Room>();
const PLAYER_COLORS = ["#00e5ff", "#76ff03", "#ff6d00", "#e040fb", "#ffd600"];

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function playerToList(p: PlayerState) {
  return { id: p.id, name: p.name, pos: p.pos, dir: p.dir, health: p.health, maxHealth: p.maxHealth, isReady: p.isReady, isAlive: p.isAlive, equippedWeapon: p.equippedWeapon, isMoving: p.isMoving, isSneaking: p.isSneaking, noiseLevel: p.noiseLevel, voiceEnabled: p.voiceEnabled, videoEnabled: p.videoEnabled, ping: p.ping, color: p.color };
}

function roomToJSON(room: Room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: Array.from(room.players.values()).map(playerToList),
    difficulty: room.difficulty,
    chapter: room.chapter,
    maxPlayers: room.maxPlayers,
    gameStarted: room.gameStarted,
    createdAt: room.createdAt,
  };
}

// ---- Ping measurement ----
const pingStarts = new Map<string, number>();

io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Ping
  socket.on("ping", () => {
    pingStarts.set(socket.id, Date.now());
    socket.emit("pong");
  });

  socket.on("pong:reply", () => {
    const start = pingStarts.get(socket.id);
    if (start) {
      const ping = Date.now() - start;
      pingStarts.delete(socket.id);
      // Find player and update ping
      for (const room of rooms.values()) {
        const p = room.players.get(socket.id);
        if (p) { p.ping = ping; break; }
      }
    }
  });

  // ---- Room Management ----
  socket.on("room:create", (data: { name: string; difficulty: string; chapter: number; maxPlayers?: number }) => {
    const code = generateCode();
    const colorIdx = 0;
    const player: PlayerState = {
      id: socket.id, name: data.name || "Jugador",
      pos: { x: 0, y: 0 }, dir: 0, health: 100, maxHealth: 100,
      isReady: false, isAlive: true, equippedWeapon: null,
      isMoving: false, isSneaking: false, noiseLevel: 0,
      voiceEnabled: false, videoEnabled: false, ping: 0,
      color: PLAYER_COLORS[colorIdx],
    };
    const room: Room = {
      code, hostId: socket.id, players: new Map([[socket.id, player]]),
      difficulty: data.difficulty || "medium", chapter: data.chapter || 7,
      maxPlayers: Math.min(5, data.maxPlayers || 5), gameStarted: false,
      createdAt: Date.now(),
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit("room:created", roomToJSON(room));
    console.log(`[ROOM] Created: ${code} by ${data.name}`);
  });

  socket.on("room:join", (data: { code: string; name: string }) => {
    const room = rooms.get(data.code.toUpperCase());
    if (!room) { socket.emit("room:error", "Sala no encontrada"); return; }
    if (room.players.size >= room.maxPlayers) { socket.emit("room:error", "Sala llena"); return; }
    if (room.gameStarted) { socket.emit("room:error", "Partida en curso"); return; }
    const colorIdx = room.players.size % PLAYER_COLORS.length;
    const player: PlayerState = {
      id: socket.id, name: data.name || "Jugador",
      pos: { x: 0, y: 0 }, dir: 0, health: 100, maxHealth: 100,
      isReady: false, isAlive: true, equippedWeapon: null,
      isMoving: false, isSneaking: false, noiseLevel: 0,
      voiceEnabled: false, videoEnabled: false, ping: 0,
      color: PLAYER_COLORS[colorIdx],
    };
    room.players.set(socket.id, player);
    socket.join(data.code.toUpperCase());
    socket.emit("room:joined", roomToJSON(room));
    io.to(room.code).emit("room:updated", roomToJSON(room));
    console.log(`[ROOM] ${data.name} joined ${room.code} (${room.players.size}/${room.maxPlayers})`);
  });

  socket.on("room:leave", () => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        socket.leave(code);
        if (room.players.size === 0) {
          rooms.delete(code);
          console.log(`[ROOM] Deleted empty room: ${code}`);
        } else {
          // Host migration
          if (room.hostId === socket.id) {
            const newHost = room.players.keys().next().value!;
            room.hostId = newHost;
            console.log(`[ROOM] Host migrated to ${newHost} in ${code}`);
          }
          io.to(code).emit("room:updated", roomToJSON(room));
        }
        break;
      }
    }
  });

  socket.on("room:list", () => {
    const list = Array.from(rooms.values())
      .filter(r => !r.gameStarted && r.players.size < r.maxPlayers)
      .map(roomToJSON);
    socket.emit("room:list", list);
  });

  // ---- Player State Sync ----
  socket.on("player:update", (data: Partial<PlayerState>) => {
    for (const room of rooms.values()) {
      const p = room.players.get(socket.id);
      if (p) {
        if (data.pos !== undefined) p.pos = data.pos;
        if (data.dir !== undefined) p.dir = data.dir;
        if (data.health !== undefined) p.health = data.health;
        if (data.isMoving !== undefined) p.isMoving = data.isMoving;
        if (data.isSneaking !== undefined) p.isSneaking = data.isSneaking;
        if (data.noiseLevel !== undefined) p.noiseLevel = data.noiseLevel;
        if (data.equippedWeapon !== undefined) p.equippedWeapon = data.equippedWeapon;
        if (data.isAlive !== undefined) p.isAlive = data.isAlive;
        // Broadcast to others
        socket.to(room.code).emit("player:updated", playerToList(p));
        break;
      }
    }
  });

  socket.on("player:ready", () => {
    for (const room of rooms.values()) {
      const p = room.players.get(socket.id);
      if (p) {
        p.isReady = !p.isReady;
        io.to(room.code).emit("room:updated", roomToJSON(room));
        break;
      }
    }
  });

  socket.on("player:voice", (data: { enabled: boolean }) => {
    for (const room of rooms.values()) {
      const p = room.players.get(socket.id);
      if (p) { p.voiceEnabled = data.enabled; io.to(room.code).emit("room:updated", roomToJSON(room)); break; }
    }
  });

  socket.on("player:video", (data: { enabled: boolean }) => {
    for (const room of rooms.values()) {
      const p = room.players.get(socket.id);
      if (p) { p.videoEnabled = data.enabled; io.to(room.code).emit("room:updated", roomToJSON(room)); break; }
    }
  });

  // ---- Game Events ----
  socket.on("game:start", () => {
    for (const room of rooms.values()) {
      if (room.hostId === socket.id && !room.gameStarted) {
        const allReady = Array.from(room.players.values()).every(p => p.isReady);
        if (!allReady && room.players.size > 1) { socket.emit("room:error", "No todos están listos"); return; }
        room.gameStarted = true;
        io.to(room.code).emit("game:started", roomToJSON(room));
        console.log(`[GAME] Started in room ${room.code}`);
      }
      break;
    }
  });

  socket.on("game:stop", () => {
    for (const room of rooms.values()) {
      if (room.hostId === socket.id) {
        room.gameStarted = false;
        io.to(room.code).emit("game:stopped");
        console.log(`[GAME] Stopped in room ${room.code}`);
      }
      break;
    }
  });

  socket.on("player:attack", (data: { targetId?: string; damage?: number; pos?: { x: number; y: number } }) => {
    for (const room of rooms.values()) {
      if (room.players.has(socket.id)) {
        socket.to(room.code).emit("player:attacked", { ...data, fromId: socket.id });
        break;
      }
    }
  });

  socket.on("player:damage", (data: { damage: number; fromEntityId?: number }) => {
    for (const room of rooms.values()) {
      const p = room.players.get(socket.id);
      if (p) {
        p.health = Math.max(0, p.health - data.damage);
        io.to(room.code).emit("player:damaged", { id: socket.id, health: p.health, damage: data.damage, fromEntityId: data.fromEntityId });
        if (p.health <= 0) { p.isAlive = false; io.to(room.code).emit("player:died", { id: socket.id, name: p.name }); }
        break;
      }
    }
  });

  socket.on("player:revive", (data: { targetId: string }) => {
    for (const room of rooms.values()) {
      const target = room.players.get(data.targetId);
      if (target && !target.isAlive) {
        target.isAlive = true;
        target.health = 50;
        io.to(room.code).emit("player:revived", { id: data.targetId, health: 50 });
      }
      break;
    }
  });

  // ---- Enemy Sync (host authoritative) ----
  socket.on("enemy:update", (data: { enemies: any[] }) => {
    for (const room of rooms.values()) {
      if (room.hostId === socket.id) {
        socket.to(room.code).emit("enemy:updated", data);
        break;
      }
    }
  });

  // ---- Chat ----
  socket.on("chat:message", (data: { text: string }) => {
    for (const room of rooms.values()) {
      const p = room.players.get(socket.id);
      if (p) {
        io.to(room.code).emit("chat:message", { from: p.name, text: data.text, color: p.color, time: Date.now() });
        break;
      }
    }
  });

  // ---- WebRTC Signaling ----
  socket.on("webrtc:offer", (data: { targetId: string; offer: any }) => {
    io.to(data.targetId).emit("webrtc:offer", { fromId: socket.id, offer: data.offer });
  });

  socket.on("webrtc:answer", (data: { targetId: string; answer: any }) => {
    io.to(data.targetId).emit("webrtc:answer", { fromId: socket.id, answer: data.answer });
  });

  socket.on("webrtc:ice", (data: { targetId: string; candidate: any }) => {
    io.to(data.targetId).emit("webrtc:ice", { fromId: socket.id, candidate: data.candidate });
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        const playerName = room.players.get(socket.id)?.name;
        room.players.delete(socket.id);
        if (room.players.size === 0) {
          rooms.delete(code);
          console.log(`[ROOM] Deleted empty room: ${code}`);
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players.keys().next().value!;
          }
          io.to(code).emit("player:left", { id: socket.id, name: playerName });
          io.to(code).emit("room:updated", roomToJSON(room));
        }
        break;
      }
    }
    pingStarts.delete(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🎮 Echoes Multiplayer Service running on port ${PORT}`);
});
