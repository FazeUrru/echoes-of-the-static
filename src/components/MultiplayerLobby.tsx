'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { MultiplayerRoom, MultiplayerPlayer, PLAYER_COLORS } from '@/game/types';

// ============================================================
// Multiplayer Lobby with WebRTC Voice/Video
// ============================================================

interface Props {
  onClose: () => void;
  onStartGame: (room: MultiplayerRoom) => void;
  playerName: string;
}

type LobbyStep = 'menu' | 'create' | 'join' | 'lobby';

export default function MultiplayerLobby({ onClose, onStartGame, playerName }: Props) {
  const [step, setStep] = useState<LobbyStep>('menu');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [chapter, setChapter] = useState(7);
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [error, setError] = useState('');
  const [chatMessages, setChatMessages] = useState<{ from: string; text: string; color: string; time: number }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [availableRooms, setAvailableRooms] = useState<MultiplayerRoom[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // WebRTC refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

  // ---- Socket connection ----
  useEffect(() => {
    const s = io('/?XTransformPort=3003', { transports: ['websocket'], timeout: 5000 });
    s.on('connect', () => console.log('[MP] Connected:', s.id));
    s.on('disconnect', () => console.log('[MP] Disconnected'));
    s.on('room:error', (msg: string) => { setError(msg); setConnecting(false); });
    s.on('room:created', (r: MultiplayerRoom) => { setRoom(r); setStep('lobby'); setConnecting(false); });
    s.on('room:joined', (r: MultiplayerRoom) => { setRoom(r); setStep('lobby'); setConnecting(false); });
    s.on('room:updated', (r: MultiplayerRoom) => setRoom(r));
    s.on('room:list', (rooms: MultiplayerRoom[]) => setAvailableRooms(rooms));
    s.on('chat:message', (msg: { from: string; text: string; color: string; time: number }) => {
      setChatMessages(prev => [...prev.slice(-50), msg]);
    });
    s.on('game:started', (r: MultiplayerRoom) => {
      setRoom(r);
      onStartGame(r);
    });
    s.on('player:left', (data: { id: string; name: string }) => {
      // Clean up peer connection
      const pc = peerConnectionsRef.current.get(data.id);
      if (pc) { pc.close(); peerConnectionsRef.current.delete(data.id); }
    });
    // WebRTC signaling - inline to avoid forward reference
    s.on('webrtc:offer', async (data: { fromId: string; offer: RTCSessionDescriptionInit }) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.onicecandidate = (event) => {
        if (event.candidate) s.emit('webrtc:ice', { targetId: data.fromId, candidate: event.candidate.toJSON() });
      };
      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          let audioEl = remoteAudioRefs.current.get(data.fromId);
          if (!audioEl) { audioEl = new Audio(); audioEl.autoplay = true; remoteAudioRefs.current.set(data.fromId, audioEl); }
          audioEl.srcObject = stream;
        }
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          const videoEl = remoteVideoRefs.current.get(data.fromId);
          if (videoEl) videoEl.srcObject = stream;
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') { pc.close(); peerConnectionsRef.current.delete(data.fromId); }
      };
      peerConnectionsRef.current.set(data.fromId, pc);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit('webrtc:answer', { targetId: data.fromId, answer });
    });
    s.on('webrtc:answer', async (data: { fromId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnectionsRef.current.get(data.fromId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });
    s.on('webrtc:ice', async (data: { fromId: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnectionsRef.current.get(data.fromId);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    });
    // Store socket in ref to avoid setState in effect
    socketRef.current = s;
    return () => { s.disconnect(); };
  }, []);

  // Sync socket state from ref
  useEffect(() => { if (socketRef.current) setSocket(socketRef.current); }, []);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ---- WebRTC Functions ----
  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc:ice', { targetId: peerId, candidate: event.candidate.toJSON() });
      }
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        let audioEl = remoteAudioRefs.current.get(peerId);
        if (!audioEl) { audioEl = new Audio(); audioEl.autoplay = true; remoteAudioRefs.current.set(peerId, audioEl); }
        audioEl.srcObject = stream;
      }
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoEl = remoteVideoRefs.current.get(peerId);
        if (videoEl) videoEl.srcObject = stream;
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        pc.close();
        peerConnectionsRef.current.delete(peerId);
      }
    };
    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  }, [socket]);

  const startMedia = useCallback(async (enableVideo: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: enableVideo ? { width: 320, height: 240, facingMode: 'user' } : false,
      });
      localStreamRef.current = stream;
      if (enableVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      // Create offers to all other players
      if (room && socket) {
        for (const p of room.players) {
          if (p.id !== socket.id) {
            const pc = createPeerConnection(p.id);
            stream.getTracks().forEach(t => pc.addTrack(t, stream));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc:offer', { targetId: p.id, offer });
          }
        }
      }
      return true;
    } catch (e) {
      console.error('[WebRTC] Media error:', e);
      setError('No se pudo acceder a micrófono/cámara');
      return false;
    }
  }, [room, socket, createPeerConnection]);

  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    remoteAudioRefs.current.forEach(el => { el.srcObject = null; });
    remoteAudioRefs.current.clear();
    setVoiceEnabled(false);
    setVideoEnabled(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stopMedia(); }, [stopMedia]);

  // ---- Actions ----
  const handleCreate = () => {
    if (!socket || !playerName.trim()) return;
    setError(''); setConnecting(true);
    socket.emit('room:create', { name: playerName.trim(), difficulty, chapter, maxPlayers });
  };

  const handleJoin = () => {
    if (!socket || !roomCode.trim()) return;
    setError(''); setConnecting(true);
    socket.emit('room:join', { code: roomCode.trim().toUpperCase(), name: playerName.trim() });
  };

  const handleQuickJoin = (code: string) => {
    if (!socket) return;
    setError(''); setConnecting(true);
    socket.emit('room:join', { code, name: playerName.trim() });
  };

  const handleLeave = () => {
    if (socket) { socket.emit('room:leave'); }
    stopMedia();
    setRoom(null); setStep('menu'); setChatMessages([]);
  };

  const handleReady = () => { socket?.emit('player:ready'); };
  const handleStart = () => { socket?.emit('game:start'); };

  const handleToggleVoice = async () => {
    if (voiceEnabled) {
      socket?.emit('player:voice', { enabled: false });
      stopMedia();
    } else {
      const ok = await startMedia(false);
      if (ok) {
        socket?.emit('player:voice', { enabled: true });
        setVoiceEnabled(true);
      }
    }
  };

  const handleToggleVideo = async () => {
    if (videoEnabled) {
      socket?.emit('player:video', { enabled: false });
      stopMedia();
    } else {
      const ok = await startMedia(true);
      if (ok) {
        socket?.emit('player:video', { enabled: true });
        setVideoEnabled(true);
        setVoiceEnabled(true);
      }
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat:message', { text: chatInput.trim() });
    setChatInput('');
  };

  const handleRefreshRooms = () => { socket?.emit('room:list'); };

  // ---- Difficulty labels ----
  const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
    tourist: { label: 'Turista', color: '#4caf50' },
    easy: { label: 'Fácil', color: '#8bc34a' },
    medium: { label: 'Medio', color: '#ffd600' },
    hard: { label: 'Difícil', color: '#ff9800' },
    extreme: { label: 'Extremo', color: '#ff5722' },
    nightmare: { label: 'Pesadilla', color: '#e91e63' },
    impossible: { label: 'Imposible', color: '#ff1744' },
    void: { label: 'Vacío', color: '#9c27b0' },
  };

  const isHost = room?.hostId === socket?.id;
  const allReady = room ? room.players.every(p => p.isReady) || room.players.length === 1 : false;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/95" style={{ backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg mx-4 flex flex-col max-h-[95dvh] overflow-hidden border rounded" style={{ borderColor: 'rgba(0,229,255,0.3)', backgroundColor: 'rgba(0,5,10,0.95)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'rgba(0,229,255,0.2)' }}>
          <h2 className="font-mono text-sm sm:text-base tracking-widest" style={{ color: '#00e5ff', textShadow: '0 0 10px rgba(0,229,255,0.3)' }}>
            👥 MULTIJUGADOR — v4.0
          </h2>
          <button onClick={onClose} className="font-mono text-xs px-2 py-1 border rounded" style={{ color: '#666', borderColor: '#333' }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">

          {/* ========== MENU STEP ========== */}
          {step === 'menu' && (
            <>
              <div className="text-center mb-4">
                <p className="font-mono text-xs mb-2" style={{ color: 'rgba(0,229,255,0.5)' }}>
                  Juega con hasta 5 personas. Voz y vídeo en tiempo real.
                </p>
                <p className="font-mono text-[10px]" style={{ color: 'rgba(255,23,68,0.4)' }}>
                  ⚠️ 4 monstruos nuevos te esperan en la Frecuencia Compartida
                </p>
              </div>

              <div className="space-y-2">
                <button onClick={() => { setStep('create'); setError(''); }} className="w-full py-3 font-mono text-sm border rounded transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.05)' }}>
                  🎮 CREAR SALA
                </button>
                <button onClick={() => { setStep('join'); setError(''); handleRefreshRooms(); }} className="w-full py-3 font-mono text-sm border rounded transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ color: '#76ff03', borderColor: 'rgba(118,255,3,0.4)', background: 'rgba(118,255,3,0.05)' }}>
                  🔗 UNIRSE A SALA
                </button>
              </div>

              {/* New multiplayer monsters preview */}
              <div className="mt-4 p-3 border rounded" style={{ borderColor: 'rgba(255,23,68,0.2)', background: 'rgba(255,23,68,0.03)' }}>
                <h3 className="font-mono text-[10px] tracking-widest mb-2" style={{ color: '#ff1744' }}>👹 MONSTRUOS MULTIJUGADOR</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: 'El Eco', desc: 'Copia de jugadores muertos', color: '#00bcd4', icon: '👤' },
                    { name: 'El Espejismo', desc: 'Crea ilusiones de sí mismo', color: '#e91e63', icon: '🌀' },
                    { name: 'El Conductor', desc: 'Manipula los sonidos', color: '#ff5722', icon: '🔊' },
                    { name: 'La Colmena', desc: 'Se divide al ser herido', color: '#795548', icon: '🦠' },
                  ].map((m, i) => (
                    <div key={i} className="p-2 border rounded-sm" style={{ borderColor: `${m.color}20`, background: `${m.color}05` }}>
                      <div className="font-mono text-[9px] font-bold" style={{ color: m.color }}>{m.icon} {m.name}</div>
                      <div className="font-mono text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 8 difficulties preview */}
              <div className="p-3 border rounded" style={{ borderColor: 'rgba(255,214,0,0.2)', background: 'rgba(255,214,0,0.03)' }}>
                <h3 className="font-mono text-[10px] tracking-widest mb-2" style={{ color: '#ffd600' }}>⚡ 8 NIVELES DE DIFICULTAD</h3>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(DIFFICULTY_LABELS).map(([key, val]) => (
                    <span key={key} className="font-mono text-[8px] px-1.5 py-0.5 rounded-sm" style={{ color: val.color, backgroundColor: `${val.color}10`, border: `1px solid ${val.color}30` }}>
                      {val.label}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ========== CREATE STEP ========== */}
          {step === 'create' && (
            <div className="space-y-3">
              <button onClick={() => setStep('menu')} className="font-mono text-[10px]" style={{ color: '#666' }}>← Volver</button>
              <h3 className="font-mono text-sm tracking-widest" style={{ color: '#00e5ff' }}>CREAR SALA</h3>

              <div>
                <label className="font-mono text-[9px] block mb-1" style={{ color: '#555' }}>Dificultad</label>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(DIFFICULTY_LABELS).map(([key, val]) => (
                    <button key={key} onClick={() => setDifficulty(key)} className="font-mono text-[8px] px-2 py-1 rounded-sm border transition-all" style={{ color: difficulty === key ? val.color : '#444', borderColor: difficulty === key ? val.color : '#222', background: difficulty === key ? `${val.color}15` : 'transparent' }}>
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-mono text-[9px] block mb-1" style={{ color: '#555' }}>Capítulo</label>
                <select value={chapter} onChange={e => setChapter(Number(e.target.value))} className="w-full bg-black border rounded px-2 py-1.5 font-mono text-xs" style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.3)' }}>
                  <option value={7}>Cap. 7 — Frecuencia Compartida (Multijugador)</option>
                  <option value={1}>Cap. 1 — El Despertar</option>
                  <option value={2}>Cap. 2 — Las Cloacas</option>
                  <option value={3}>Cap. 3 — Calles Vacías</option>
                  <option value={4}>Cap. 4 — El Hospital</option>
                  <option value={5}>Cap. 5 — Bajo Tierra</option>
                  <option value={6}>Cap. 6 — La Torre del Silencio</option>
                </select>
              </div>

              <div>
                <label className="font-mono text-[9px] block mb-1" style={{ color: '#555' }}>Jugadores máximos</label>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setMaxPlayers(n)} className="font-mono text-xs px-3 py-1.5 rounded-sm border" style={{ color: maxPlayers === n ? '#00e5ff' : '#444', borderColor: maxPlayers === n ? 'rgba(0,229,255,0.5)' : '#222', background: maxPlayers === n ? 'rgba(0,229,255,0.1)' : 'transparent' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="font-mono text-[10px]" style={{ color: '#ff1744' }}>{error}</p>}

              <button onClick={handleCreate} disabled={connecting} className="w-full py-3 font-mono text-sm border rounded transition-all" style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.5)', background: 'rgba(0,229,255,0.1)' }}>
                {connecting ? 'Creando...' : '🎮 CREAR SALA'}
              </button>
            </div>
          )}

          {/* ========== JOIN STEP ========== */}
          {step === 'join' && (
            <div className="space-y-3">
              <button onClick={() => setStep('menu')} className="font-mono text-[10px]" style={{ color: '#666' }}>← Volver</button>
              <h3 className="font-mono text-sm tracking-widest" style={{ color: '#76ff03' }}>UNIRSE A SALA</h3>

              <div className="flex gap-2">
                <input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="CÓDIGO" maxLength={5} className="flex-1 bg-black border rounded px-3 py-2 font-mono text-sm text-center tracking-[0.3em]" style={{ color: '#76ff03', borderColor: 'rgba(118,255,3,0.3)' }} />
                <button onClick={handleJoin} disabled={connecting || roomCode.length < 3} className="px-4 py-2 font-mono text-xs border rounded" style={{ color: '#76ff03', borderColor: 'rgba(118,255,3,0.5)', background: 'rgba(118,255,3,0.1)' }}>
                  {connecting ? '...' : 'UNIRSE'}
                </button>
              </div>

              {error && <p className="font-mono text-[10px]" style={{ color: '#ff1744' }}>{error}</p>}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-mono text-[10px]" style={{ color: '#555' }}>SALAS DISPONIBLES</h4>
                  <button onClick={handleRefreshRooms} className="font-mono text-[9px]" style={{ color: '#00e5ff' }}>🔄</button>
                </div>
                {availableRooms.length === 0 ? (
                  <p className="font-mono text-[10px] text-center py-4" style={{ color: '#333' }}>No hay salas disponibles</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {availableRooms.map(r => (
                      <button key={r.code} onClick={() => handleQuickJoin(r.code)} className="w-full flex items-center justify-between p-2 border rounded-sm transition-all hover:border-opacity-60" style={{ borderColor: 'rgba(118,255,3,0.2)', background: 'rgba(118,255,3,0.03)' }}>
                        <div className="text-left">
                          <span className="font-mono text-[10px] font-bold" style={{ color: '#76ff03' }}>{r.code}</span>
                          <span className="font-mono text-[8px] ml-2" style={{ color: '#555' }}>{DIFFICULTY_LABELS[r.difficulty]?.label || r.difficulty}</span>
                        </div>
                        <span className="font-mono text-[9px]" style={{ color: '#888' }}>{r.players.length}/{r.maxPlayers} 👤</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========== LOBBY STEP ========== */}
          {step === 'lobby' && room && (
            <div className="space-y-3">
              {/* Room code */}
              <div className="text-center p-3 border rounded" style={{ borderColor: 'rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.05)' }}>
                <div className="font-mono text-[9px]" style={{ color: '#555' }}>CÓDIGO DE SALA</div>
                <div className="font-mono text-2xl sm:text-3xl font-bold tracking-[0.3em]" style={{ color: '#00e5ff', textShadow: '0 0 15px rgba(0,229,255,0.5)' }}>
                  {room.code}
                </div>
                <div className="font-mono text-[9px] mt-1" style={{ color: '#555' }}>
                  {DIFFICULTY_LABELS[room.difficulty]?.label} | Cap. {room.chapter} | {room.players.length}/{room.maxPlayers}
                </div>
              </div>

              {/* Players list */}
              <div>
                <h4 className="font-mono text-[10px] tracking-widest mb-1.5" style={{ color: '#00e5ff' }}>JUGADORES</h4>
                <div className="space-y-1">
                  {room.players.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 border rounded-sm" style={{ borderColor: `${p.color}20`, background: `${p.color}05` }}>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}` }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[10px] font-bold truncate" style={{ color: p.color }}>
                          {p.name} {p.id === room.hostId && <span style={{ color: '#ffd600' }}>👑</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.voiceEnabled && <span className="text-[10px]">🎤</span>}
                        {p.videoEnabled && <span className="text-[10px]">📹</span>}
                        <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-sm" style={{ color: p.isReady ? '#76ff03' : '#555', backgroundColor: p.isReady ? 'rgba(118,255,3,0.1)' : 'rgba(0,0,0,0.3)', border: `1px solid ${p.isReady ? 'rgba(118,255,3,0.3)' : '#222'}` }}>
                          {p.isReady ? 'LISTO' : 'NO'}
                        </span>
                      </div>
                      {/* Remote video thumbnail */}
                      {p.id !== socket?.id && p.videoEnabled && (
                        <video ref={el => { if (el) remoteVideoRefs.current.set(p.id, el); }} autoPlay playsInline muted className="w-10 h-8 rounded-sm object-cover border" style={{ borderColor: `${p.color}40` }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Local video preview */}
              {videoEnabled && (
                <div className="p-2 border rounded" style={{ borderColor: 'rgba(0,229,255,0.2)' }}>
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full rounded" style={{ maxHeight: 120, objectFit: 'cover' }} />
                  <div className="font-mono text-[8px] text-center mt-1" style={{ color: '#555' }}>Tu cámara</div>
                </div>
              )}

              {/* Media controls */}
              <div className="flex gap-2">
                <button onClick={handleToggleVoice} className={`flex-1 py-2 font-mono text-[10px] border rounded transition-all ${voiceEnabled ? 'animate-pulse' : ''}`} style={{ color: voiceEnabled ? '#76ff03' : '#555', borderColor: voiceEnabled ? 'rgba(118,255,3,0.5)' : '#222', background: voiceEnabled ? 'rgba(118,255,3,0.1)' : 'transparent' }}>
                  🎤 {voiceEnabled ? 'MIC ON' : 'MIC OFF'}
                </button>
                <button onClick={handleToggleVideo} className={`flex-1 py-2 font-mono text-[10px] border rounded transition-all ${videoEnabled ? 'animate-pulse' : ''}`} style={{ color: videoEnabled ? '#00e5ff' : '#555', borderColor: videoEnabled ? 'rgba(0,229,255,0.5)' : '#222', background: videoEnabled ? 'rgba(0,229,255,0.1)' : 'transparent' }}>
                  📹 {videoEnabled ? 'VÍDEO ON' : 'VÍDEO OFF'}
                </button>
              </div>

              {/* Chat */}
              <div className="border rounded" style={{ borderColor: 'rgba(0,229,255,0.15)' }}>
                <div className="max-h-28 overflow-y-auto p-2 space-y-1" style={{ scrollbarWidth: 'thin' }}>
                  {chatMessages.map((msg, i) => (
                    <div key={i} className="font-mono text-[9px]">
                      <span style={{ color: msg.color }}>{msg.from}:</span>{' '}
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{msg.text}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex border-t" style={{ borderColor: 'rgba(0,229,255,0.1)' }}>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendChat()} placeholder="Escribe..." className="flex-1 bg-transparent px-2 py-1.5 font-mono text-[10px]" style={{ color: '#00e5ff', outline: 'none' }} />
                  <button onClick={handleSendChat} className="px-3 font-mono text-[10px]" style={{ color: '#00e5ff' }}>→</button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button onClick={handleReady} className="flex-1 py-2.5 font-mono text-xs border rounded transition-all" style={{ color: room.players.find(p => p.id === socket?.id)?.isReady ? '#76ff03' : '#ffd600', borderColor: room.players.find(p => p.id === socket?.id)?.isReady ? 'rgba(118,255,3,0.5)' : 'rgba(255,214,0,0.5)', background: room.players.find(p => p.id === socket?.id)?.isReady ? 'rgba(118,255,3,0.1)' : 'rgba(255,214,0,0.05)' }}>
                  {room.players.find(p => p.id === socket?.id)?.isReady ? '✓ LISTO' : '¿LISTO?'}
                </button>
                {isHost && (
                  <button onClick={handleStart} disabled={!allReady} className="flex-1 py-2.5 font-mono text-xs border rounded transition-all" style={{ color: allReady ? '#ff1744' : '#444', borderColor: allReady ? 'rgba(255,23,68,0.5)' : '#222', background: allReady ? 'rgba(255,23,68,0.1)' : 'transparent' }}>
                    {allReady ? '🚀 INICIAR' : 'ESPERANDO...'}
                  </button>
                )}
              </div>

              <button onClick={handleLeave} className="w-full py-2 font-mono text-[10px] border rounded" style={{ color: '#666', borderColor: '#333' }}>
                SALIR DE LA SALA
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-2 border-t text-center" style={{ borderColor: 'rgba(0,229,255,0.1)' }}>
          <p className="font-mono text-[8px]" style={{ color: '#333' }}>
            WebRTC P2P • Socket.io Sync • Hasta 5 jugadores • Voz + Vídeo
          </p>
        </div>
      </div>
    </div>
  );
}
