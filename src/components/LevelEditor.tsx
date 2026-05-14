'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  CustomLevel,
  EditorCell,
  EnemyType,
  ACOUSTIC_LABELS,
} from '@/game/types';
import {
  createEmptyLevel,
  validateLevel,
  serializeLevel,
  deserializeLevel,
  getSavedLevels,
  saveLevel,
  deleteLevel,
} from '@/game/levelEditor';

// ============================================================
// Constants
// ============================================================

type PaintTool = EditorCell['type'] | 'eraser' | 'playerStart';
type AcousticTool = EditorCell['acousticProperty'];
type EntityTool = EnemyType | 'none';

const CELL_COLORS: Record<EditorCell['type'], { bg: string; border: string }> = {
  empty: { bg: '#0a0a0a', border: 'transparent' },
  wall: { bg: '#1a1a2e', border: '#00e5ff' },
  exit: { bg: '#003300', border: '#76ff03' },
  door: { bg: '#332200', border: '#ffab00' },
  silentZone: { bg: '#1a0033', border: '#9c27b0' },
  whiteNoiseZone: { bg: '#1a1a1a', border: '#ffffff' },
};

const ENTITY_COLORS: Record<EnemyType, string> = {
  stalker: '#ff1744',
  hunter: '#ff6d00',
  phantom: '#aa00ff',
};

const ACOUSTIC_MARKS: Record<AcousticTool, { color: string; symbol: string }> = {
  normal: { color: 'transparent', symbol: '' },
  echo: { color: '#ff6d00', symbol: '●' },
  absorb: { color: '#330066', symbol: '●' },
  reflect: { color: '#ffd600', symbol: '●' },
};

// ============================================================
// Component
// ============================================================

interface LevelEditorProps {
  onTestPlay: (level: CustomLevel) => void;
  onExit: () => void;
}

export default function LevelEditor({ onTestPlay, onExit }: LevelEditorProps) {
  // ---- Level state ----
  const [level, setLevel] = useState<CustomLevel>(() => createEmptyLevel(20, 20));
  const [levelName, setLevelName] = useState('Nivel sin nombre');

  // ---- Tool state ----
  const [activeTool, setActiveTool] = useState<PaintTool>('wall');
  const [activeAcoustic, setActiveAcoustic] = useState<AcousticTool>('normal');
  const [activeEntity, setActiveEntity] = useState<EntityTool>('none');

  // ---- Canvas state ----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(20);
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
  const isPaintingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // ---- UI state ----
  const [savedLevels, setSavedLevels] = useState<CustomLevel[]>(() => getSavedLevels());
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  // ---- Touch state ----
  const touchPaintRef = useRef(false);

  // ---- Notification auto-dismiss ----
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 2500);
    return () => clearTimeout(timer);
  }, [notification]);

  // levelName is synced into level via handlers that use levelName directly

  // ============================================================
  // Canvas rendering
  // ============================================================

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: lw, height: lh, cells, playerStart } = level;
    const cellSize = zoom;

    // Resize canvas to match container
    const container = canvas.parentElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    }

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center offset
    const totalW = lw * cellSize;
    const totalH = lh * cellSize;
    const ox = Math.floor((canvas.width - totalW) / 2) + scrollOffset.x;
    const oy = Math.floor((canvas.height - totalH) / 2) + scrollOffset.y;

    // Draw cells
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const cell = cells[y][x];
        const px = ox + x * cellSize;
        const py = oy + y * cellSize;

        // Skip if offscreen
        if (px + cellSize < 0 || py + cellSize < 0 || px > canvas.width || py > canvas.height) continue;

        const colors = CELL_COLORS[cell.type];
        ctx.fillStyle = colors.bg;
        ctx.fillRect(px, py, cellSize, cellSize);

        // Border for non-empty cells
        if (cell.type !== 'empty' && cellSize > 6) {
          ctx.strokeStyle = colors.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
        }

        // Acoustic property mark
        if (cell.acousticProperty !== 'normal' && cellSize >= 12) {
          const mark = ACOUSTIC_MARKS[cell.acousticProperty];
          ctx.fillStyle = mark.color;
          ctx.font = `${Math.max(8, cellSize * 0.4)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(mark.symbol, px + cellSize / 2, py + cellSize * 0.3);
        }

        // Entity spawn marker
        if (cell.entitySpawn && cellSize >= 10) {
          ctx.fillStyle = ENTITY_COLORS[cell.entitySpawn];
          ctx.beginPath();
          ctx.arc(px + cellSize / 2, py + cellSize / 2, Math.max(2, cellSize * 0.2), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw grid lines (only if zoomed in enough)
    if (cellSize >= 8) {
      ctx.strokeStyle = 'rgba(0,229,255,0.08)';
      ctx.lineWidth = 0.5;
      for (let y = 0; y <= lh; y++) {
        const py = oy + y * cellSize;
        ctx.beginPath();
        ctx.moveTo(ox, py);
        ctx.lineTo(ox + lw * cellSize, py);
        ctx.stroke();
      }
      for (let x = 0; x <= lw; x++) {
        const px = ox + x * cellSize;
        ctx.beginPath();
        ctx.moveTo(px, oy);
        ctx.lineTo(px, oy + lh * cellSize);
        ctx.stroke();
      }
    }

    // Player start marker
    if (playerStart.x >= 0 && playerStart.x < lw && playerStart.y >= 0 && playerStart.y < lh) {
      const px = ox + playerStart.x * cellSize;
      const py = oy + playerStart.y * cellSize;
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(px + cellSize / 2, py + cellSize / 2, Math.max(3, cellSize * 0.3), 0, Math.PI * 2);
      ctx.fill();
      // Glow
      ctx.strokeStyle = 'rgba(0,229,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + cellSize / 2, py + cellSize / 2, Math.max(4, cellSize * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [level, zoom, scrollOffset]);

  // Render on every frame
  useEffect(() => {
    const animLoop = () => {
      renderCanvas();
      requestAnimationFrame(animLoop);
    };
    const id = requestAnimationFrame(animLoop);
    return () => cancelAnimationFrame(id);
  }, [renderCanvas]);

  // ============================================================
  // Paint logic
  // ============================================================

  const getCellFromEvent = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const { width: lw, height: lh } = level;
    const cellSize = zoom;
    const totalW = lw * cellSize;
    const totalH = lh * cellSize;
    const ox = Math.floor((canvas.width - totalW) / 2) + scrollOffset.x;
    const oy = Math.floor((canvas.height - totalH) / 2) + scrollOffset.y;

    const cx = Math.floor((mx - ox) / cellSize);
    const cy = Math.floor((my - oy) / cellSize);

    if (cx < 0 || cx >= lw || cy < 0 || cy >= lh) return null;
    return { x: cx, y: cy };
  }, [level, zoom, scrollOffset]);

  const paintCell = useCallback((cellX: number, cellY: number, isRightClick: boolean = false) => {
    setLevel(prev => {
      const newCells = prev.cells.map(row => row.map(cell => ({ ...cell })));

      if (isRightClick || activeTool === 'eraser') {
        // Erase: set to empty, clear entity, clear acoustic
        newCells[cellY][cellX] = {
          type: 'empty',
          acousticProperty: 'normal',
        };
      } else if (activeTool === 'playerStart') {
        // Set player start position
        return { ...prev, playerStart: { x: cellX, y: cellY } };
      } else {
        // Paint cell type
        const cell = newCells[cellY][cellX];
        cell.type = activeTool as EditorCell['type'];

        // Apply acoustic property if selected
        if (activeAcoustic !== 'normal') {
          cell.acousticProperty = activeAcoustic;
        }

        // Apply entity spawn if selected (only on walkable cells)
        if (activeEntity !== 'none' && cell.type !== 'wall') {
          cell.entitySpawn = activeEntity as EnemyType;
        }
      }

      return { ...prev, cells: newCells };
    });
  }, [activeTool, activeAcoustic, activeEntity]);

  // ============================================================
  // Mouse handlers
  // ============================================================

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (e.button === 1) {
      // Middle click: start panning
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: scrollOffset.x, oy: scrollOffset.y };
      return;
    }
    if (e.button === 2) {
      // Right click: erase
      const cell = getCellFromEvent(e.clientX, e.clientY);
      if (cell) paintCell(cell.x, cell.y, true);
      isPaintingRef.current = true;
      return;
    }
    // Left click: paint
    isPaintingRef.current = true;
    const cell = getCellFromEvent(e.clientX, e.clientY);
    if (cell) paintCell(cell.x, cell.y, false);
  }, [getCellFromEvent, paintCell, scrollOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setScrollOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      return;
    }
    if (!isPaintingRef.current) return;
    const cell = getCellFromEvent(e.clientX, e.clientY);
    if (cell) {
      const isRightClick = e.buttons === 2;
      paintCell(cell.x, cell.y, isRightClick);
    }
  }, [getCellFromEvent, paintCell]);

  const handleMouseUp = useCallback(() => {
    isPaintingRef.current = false;
    isPanningRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -2 : 2;
    setZoom(prev => Math.max(6, Math.min(60, prev + delta)));
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ============================================================
  // Touch handlers
  // ============================================================

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Two finger: pan
      isPanningRef.current = true;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      panStartRef.current = {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
        ox: scrollOffset.x,
        oy: scrollOffset.y,
      };
      return;
    }
    if (e.touches.length === 1) {
      touchPaintRef.current = true;
      const t = e.touches[0];
      const cell = getCellFromEvent(t.clientX, t.clientY);
      if (cell) paintCell(cell.x, cell.y, false);
    }
  }, [getCellFromEvent, paintCell, scrollOffset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (isPanningRef.current && e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const cx = (t0.clientX + t1.clientX) / 2;
      const cy = (t0.clientY + t1.clientY) / 2;
      const dx = cx - panStartRef.current.x;
      const dy = cy - panStartRef.current.y;
      setScrollOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      return;
    }
    if (touchPaintRef.current && e.touches.length === 1) {
      const t = e.touches[0];
      const cell = getCellFromEvent(t.clientX, t.clientY);
      if (cell) paintCell(cell.x, cell.y, false);
    }
  }, [getCellFromEvent, paintCell]);

  const handleTouchEnd = useCallback(() => {
    touchPaintRef.current = false;
    isPanningRef.current = false;
  }, []);

  // ============================================================
  // Actions
  // ============================================================

  const handleResize = useCallback((newWidth: number, newHeight: number) => {
    setLevel(prev => {
      const newCells: EditorCell[][] = [];
      for (let y = 0; y < newHeight; y++) {
        newCells[y] = [];
        for (let x = 0; x < newWidth; x++) {
          if (y < prev.height && x < prev.width) {
            newCells[y][x] = { ...prev.cells[y][x] };
          } else {
            newCells[y][x] = { type: 'wall', acousticProperty: 'normal' };
          }
        }
      }
      // Clamp player start
      let ps = { ...prev.playerStart };
      if (ps.x >= newWidth) ps.x = newWidth - 1;
      if (ps.y >= newHeight) ps.y = newHeight - 1;

      return { ...prev, width: newWidth, height: newHeight, cells: newCells, playerStart: ps };
    });
  }, []);

  const handleSave = useCallback(() => {
    const updatedLevel = { ...level, name: levelName };
    saveLevel(updatedLevel);
    setSavedLevels(getSavedLevels());
    setNotification('Nivel guardado');
  }, [level, levelName]);

  const handleLoad = useCallback((name: string) => {
    const levels = getSavedLevels();
    const found = levels.find(l => l.name === name);
    if (found) {
      setLevel(found);
      setLevelName(found.name);
      setScrollOffset({ x: 0, y: 0 });
      setShowLoadDialog(false);
      setNotification('Nivel cargado');
    }
  }, []);

  const handleDelete = useCallback((name: string) => {
    deleteLevel(name);
    setSavedLevels(getSavedLevels());
    setNotification('Nivel eliminado');
  }, []);

  const handleExport = useCallback(() => {
    const json = serializeLevel({ ...level, name: levelName });
    navigator.clipboard.writeText(json).then(() => {
      setNotification('JSON copiado al portapapeles');
    }).catch(() => {
      setNotification('Error al copiar al portapapeles');
    });
  }, [level, levelName]);

  const handleImport = useCallback(() => {
    const parsed = deserializeLevel(importText);
    if (parsed) {
      setLevel(parsed);
      setLevelName(parsed.name);
      setShowImportDialog(false);
      setImportText('');
      setNotification('Nivel importado');
    } else {
      setNotification('JSON inválido');
    }
  }, [importText]);

  const handleTestPlay = useCallback(() => {
    const updatedLevel = { ...level, name: levelName };
    const validation = validateLevel(updatedLevel);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }
    setValidationErrors([]);
    onTestPlay(updatedLevel);
  }, [level, levelName, onTestPlay]);

  const handleNewLevel = useCallback(() => {
    setLevel(createEmptyLevel(20, 20));
    setLevelName('Nivel sin nombre');
    setScrollOffset({ x: 0, y: 0 });
    setValidationErrors([]);
  }, []);

  const handleClearLevel = useCallback(() => {
    setLevel(prev => {
      const newCells: EditorCell[][] = [];
      for (let y = 0; y < prev.height; y++) {
        newCells[y] = [];
        for (let x = 0; x < prev.width; x++) {
          newCells[y][x] = { type: 'wall', acousticProperty: 'normal' };
        }
      }
      return { ...prev, cells: newCells };
    });
    setNotification('Nivel limpiado');
  }, []);

  const handleAcousticProfileChange = useCallback((key: keyof CustomLevel['acousticProfile'], value: number) => {
    setLevel(prev => ({
      ...prev,
      acousticProfile: { ...prev.acousticProfile, [key]: value },
    }));
  }, []);

  // ============================================================
  // Styles
  // ============================================================

  const sidebarStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.95)',
    borderRight: '1px solid rgba(0,229,255,0.2)',
    fontFamily: 'monospace',
  };

  const rightSidebarStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.95)',
    borderLeft: '1px solid rgba(0,229,255,0.2)',
    fontFamily: 'monospace',
  };

  const toolButtonStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '6px 8px',
    border: `1px solid ${active ? '#00e5ff' : 'rgba(0,229,255,0.15)'}`,
    background: active ? 'rgba(0,229,255,0.1)' : 'rgba(0,0,0,0.3)',
    color: active ? '#00e5ff' : '#666',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontSize: 11,
  });

  const sectionLabelStyle: React.CSSProperties = {
    color: '#00e5ff',
    fontSize: 10,
    letterSpacing: '0.1em',
    marginBottom: 4,
    marginTop: 8,
    opacity: 0.7,
  };

  const actionButtonStyle = (color: string = '#00e5ff', dim: boolean = false): React.CSSProperties => ({
    padding: '8px 12px',
    border: `1px solid ${dim ? 'rgba(100,100,100,0.2)' : `${color}40`}`,
    background: dim ? 'rgba(0,0,0,0.3)' : `${color}0a`,
    color: dim ? '#555' : color,
    cursor: 'pointer',
    fontSize: 10,
    letterSpacing: '0.05em',
    transition: 'all 0.15s',
    width: '100%',
    textAlign: 'center',
  });

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="absolute inset-0 z-30 flex flex-col md:flex-row" style={{ background: '#000' }}>
      {/* ===== LEFT SIDEBAR - TOOLS ===== */}
      <div className="w-full md:w-48 flex-shrink-0 overflow-y-auto p-2 order-2 md:order-1" style={sidebarStyle}>
        {/* Cell types */}
        <div style={sectionLabelStyle}>TIPO DE CELDA</div>
        <div className="grid grid-cols-3 md:grid-cols-2 gap-1">
          {([
            { tool: 'empty' as PaintTool, label: 'Vacío', color: '#0a0a0a', borderColor: '#333' },
            { tool: 'wall' as PaintTool, label: 'Pared', color: '#1a1a2e', borderColor: '#00e5ff' },
            { tool: 'exit' as PaintTool, label: 'Salida', color: '#003300', borderColor: '#76ff03' },
            { tool: 'door' as PaintTool, label: 'Puerta', color: '#332200', borderColor: '#ffab00' },
            { tool: 'silentZone' as PaintTool, label: 'Silencio', color: '#1a0033', borderColor: '#9c27b0' },
            { tool: 'whiteNoiseZone' as PaintTool, label: 'Ruido', color: '#1a1a1a', borderColor: '#ffffff' },
          ]).map(({ tool, label, color, borderColor }) => (
            <button
              key={tool}
              onClick={() => setActiveTool(tool)}
              style={toolButtonStyle(activeTool === tool)}
              title={label}
            >
              <div style={{
                width: 14, height: 14, background: color,
                border: `1px solid ${borderColor}`, flexShrink: 0,
              }} />
              <span className="hidden md:inline text-[9px]">{label}</span>
            </button>
          ))}
        </div>

        {/* Acoustic property */}
        <div style={sectionLabelStyle}>ACÚSTICA</div>
        <div className="grid grid-cols-4 md:grid-cols-2 gap-1">
          {([
            { tool: 'normal' as AcousticTool, label: 'Normal', color: 'transparent', symbol: '' },
            { tool: 'echo' as AcousticTool, label: 'Eco', color: '#ff6d00', symbol: '●' },
            { tool: 'absorb' as AcousticTool, label: 'Absorb', color: '#330066', symbol: '●' },
            { tool: 'reflect' as AcousticTool, label: 'Reflejo', color: '#ffd600', symbol: '●' },
          ]).map(({ tool, label, color, symbol }) => (
            <button
              key={tool}
              onClick={() => setActiveAcoustic(tool)}
              style={toolButtonStyle(activeAcoustic === tool)}
              title={ACOUSTIC_LABELS[tool]?.label || label}
            >
              {symbol && <span style={{ color, fontSize: 12 }}>{symbol}</span>}
              {!symbol && <span style={{ fontSize: 9, opacity: 0.5 }}>—</span>}
              <span className="hidden md:inline text-[9px]">{label}</span>
            </button>
          ))}
        </div>

        {/* Entity spawner */}
        <div style={sectionLabelStyle}>ENTIDADES</div>
        <div className="grid grid-cols-4 md:grid-cols-2 gap-1">
          <button
            onClick={() => setActiveEntity('none')}
            style={toolButtonStyle(activeEntity === 'none')}
            title="Sin entidad"
          >
            <span style={{ fontSize: 9, opacity: 0.5 }}>—</span>
            <span className="hidden md:inline text-[9px]">Ninguna</span>
          </button>
          {([
            { type: 'stalker' as EnemyType, label: 'Acech.', color: '#ff1744' },
            { type: 'hunter' as EnemyType, label: 'Cazad.', color: '#ff6d00' },
            { type: 'phantom' as EnemyType, label: 'Fant.', color: '#aa00ff' },
          ]).map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => setActiveEntity(type)}
              style={toolButtonStyle(activeEntity === type)}
              title={label}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color, flexShrink: 0,
              }} />
              <span className="hidden md:inline text-[9px]">{label}</span>
            </button>
          ))}
        </div>

        {/* Special tools */}
        <div style={sectionLabelStyle}>HERRAMIENTAS</div>
        <div className="grid grid-cols-2 md:grid-cols-1 gap-1">
          <button
            onClick={() => setActiveTool('eraser')}
            style={toolButtonStyle(activeTool === 'eraser')}
          >
            <span style={{ fontSize: 12 }}>✕</span>
            <span className="text-[9px]">Borrar</span>
          </button>
          <button
            onClick={() => setActiveTool('playerStart')}
            style={toolButtonStyle(activeTool === 'playerStart')}
          >
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#00e5ff', flexShrink: 0,
            }} />
            <span className="text-[9px]">Inicio</span>
          </button>
        </div>

        {/* Grid size */}
        <div style={sectionLabelStyle}>TAMAÑO {level.width}x{level.height}</div>
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-[8px]" style={{ color: '#666', width: 12 }}>W</span>
            <input
              type="range" min={10} max={50} value={level.width}
              onChange={e => handleResize(parseInt(e.target.value), level.height)}
              className="flex-1 h-1 appearance-none rounded cursor-pointer"
              style={{ background: '#222', accentColor: '#00e5ff' }}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px]" style={{ color: '#666', width: 12 }}>H</span>
            <input
              type="range" min={10} max={50} value={level.height}
              onChange={e => handleResize(level.width, parseInt(e.target.value))}
              className="flex-1 h-1 appearance-none rounded cursor-pointer"
              style={{ background: '#222', accentColor: '#00e5ff' }}
            />
          </div>
        </div>
      </div>

      {/* ===== CENTER - GRID CANVAS ===== */}
      <div className="flex-1 relative order-1 md:order-2" style={{ minHeight: 300 }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: activeTool === 'eraser' ? 'crosshair' : 'pointer' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* Zoom controls (bottom-center) */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2" style={{ zIndex: 5 }}>
          <button
            onClick={() => setZoom(prev => Math.max(6, prev - 2))}
            style={{ ...actionButtonStyle('#00e5ff'), width: 28, padding: '4px 0' }}
          >−</button>
          <span className="font-mono text-[9px]" style={{ color: '#666' }}>{zoom}px</span>
          <button
            onClick={() => setZoom(prev => Math.min(60, prev + 2))}
            style={{ ...actionButtonStyle('#00e5ff'), width: 28, padding: '4px 0' }}
          >+</button>
          <button
            onClick={() => { setScrollOffset({ x: 0, y: 0 }); }}
            style={{ ...actionButtonStyle('#00e5ff', true), width: 'auto', padding: '4px 8px', fontSize: 8 }}
          >CENTRAR</button>
        </div>

        {/* Tool indicator (top-center) */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest" style={{ color: '#00e5ff', zIndex: 5 }}>
          {activeTool === 'eraser' ? 'BORRADOR' : activeTool === 'playerStart' ? 'INICIO JUGADOR' : activeTool.toUpperCase()}
          {activeAcoustic !== 'normal' && ` + ${ACOUSTIC_LABELS[activeAcoustic]?.label || activeAcoustic}`}
          {activeEntity !== 'none' && ` + ${activeEntity.toUpperCase()}`}
        </div>
      </div>

      {/* ===== RIGHT SIDEBAR - PROPERTIES & ACTIONS ===== */}
      <div className="w-full md:w-56 flex-shrink-0 overflow-y-auto p-3 order-3" style={rightSidebarStyle}>
        {/* Level name */}
        <div style={sectionLabelStyle}>NOMBRE DEL NIVEL</div>
        <input
          type="text"
          value={levelName}
          onChange={e => setLevelName(e.target.value)}
          className="w-full px-2 py-1 font-mono text-xs"
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(0,229,255,0.2)',
            color: '#00e5ff',
            outline: 'none',
          }}
        />

        {/* Acoustic profile */}
        <div style={sectionLabelStyle}>PERFIL ACÚSTICO</div>
        <div className="space-y-2">
          {([
            { key: 'globalEcho' as const, label: 'Eco Global', color: '#ff6d00' },
            { key: 'globalAbsorption' as const, label: 'Absorción', color: '#9c27b0' },
            { key: 'globalReflection' as const, label: 'Reflexión', color: '#ffd600' },
          ]).map(({ key, label: lbl, color }) => (
            <div key={key}>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[9px]" style={{ color }}>{lbl}</span>
                <span className="font-mono text-[9px]" style={{ color: '#00e5ff' }}>
                  {level.acousticProfile[key].toFixed(2)}
                </span>
              </div>
              <input
                type="range" min={0} max={1} step={0.05}
                value={level.acousticProfile[key]}
                onChange={e => handleAcousticProfileChange(key, parseFloat(e.target.value))}
                className="w-full h-1 appearance-none rounded cursor-pointer"
                style={{ background: '#222', accentColor: color }}
              />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ ...sectionLabelStyle, marginTop: 12 }}>ACCIONES</div>
        <div className="space-y-1">
          <button onClick={handleSave} style={actionButtonStyle('#00e5ff')}>💾 GUARDAR</button>
          <button onClick={() => { setSavedLevels(getSavedLevels()); setShowLoadDialog(true); }} style={actionButtonStyle('#00e5ff')}>📂 CARGAR</button>
          <button onClick={handleExport} style={actionButtonStyle('#00e5ff')}>📋 EXPORTAR JSON</button>
          <button onClick={() => { setImportText(''); setShowImportDialog(true); }} style={actionButtonStyle('#00e5ff')}>📥 IMPORTAR JSON</button>
          <button onClick={handleTestPlay} style={actionButtonStyle('#76ff03')}>▶ PROBAR NIVEL</button>
          <button onClick={handleNewLevel} style={actionButtonStyle('#ff6d00')}>📄 NUEVO</button>
          <button onClick={handleClearLevel} style={actionButtonStyle('#ff1744', true)}>🗑 LIMPIAR</button>
          <button onClick={onExit} style={actionButtonStyle('#666', true)}>← VOLVER AL MENÚ</button>
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="mt-3 p-2" style={{ border: '1px solid rgba(255,23,68,0.3)', background: 'rgba(255,0,0,0.05)' }}>
            <div className="font-mono text-[9px] mb-1" style={{ color: '#ff1744' }}>ERRORES:</div>
            {validationErrors.map((err, i) => (
              <div key={i} className="font-mono text-[8px]" style={{ color: '#ff8a80' }}>• {err}</div>
            ))}
          </div>
        )}

        {/* Level stats */}
        <div className="mt-3 pt-2" style={{ borderTop: '1px solid rgba(0,229,255,0.1)' }}>
          <div className="font-mono text-[8px]" style={{ color: '#444' }}>
            Celdas: {level.width * level.height} | Zoom: {zoom}px
          </div>
          <div className="font-mono text-[8px]" style={{ color: '#444' }}>
            Entidades: {level.cells.flat().filter(c => c.entitySpawn).length}/10
          </div>
          <div className="font-mono text-[8px]" style={{ color: '#444' }}>
            Salidas: {level.cells.flat().filter(c => c.type === 'exit').length}
          </div>
        </div>
      </div>

      {/* ===== LOAD DIALOG ===== */}
      {showLoadDialog && (
        <div className="absolute inset-0 flex items-center justify-center z-40" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="p-4 border max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" style={{ borderColor: 'rgba(0,229,255,0.3)', backgroundColor: 'rgba(0,0,0,0.95)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-sm" style={{ color: '#00e5ff' }}>CARGAR NIVEL</h3>
              <button onClick={() => setShowLoadDialog(false)} className="font-mono text-xs px-2 py-1" style={{ color: '#666', border: '1px solid #333' }}>CERRAR</button>
            </div>
            {savedLevels.length === 0 ? (
              <p className="font-mono text-xs" style={{ color: '#555' }}>No hay niveles guardados</p>
            ) : (
              <div className="space-y-2">
                {savedLevels.map((sl, i) => (
                  <div key={i} className="flex items-center gap-2 p-2" style={{ border: '1px solid rgba(0,229,255,0.1)', background: 'rgba(0,0,0,0.3)' }}>
                    <button
                      onClick={() => handleLoad(sl.name)}
                      className="flex-1 text-left font-mono text-xs py-1"
                      style={{ color: '#00e5ff' }}
                    >
                      {sl.name} <span style={{ color: '#444' }}>({sl.width}x{sl.height})</span>
                    </button>
                    <button
                      onClick={() => handleDelete(sl.name)}
                      className="font-mono text-[9px] px-2 py-1"
                      style={{ color: '#ff1744', border: '1px solid rgba(255,23,68,0.2)' }}
                    >ELIMINAR</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== IMPORT DIALOG ===== */}
      {showImportDialog && (
        <div className="absolute inset-0 flex items-center justify-center z-40" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="p-4 border max-w-md w-full mx-4" style={{ borderColor: 'rgba(0,229,255,0.3)', backgroundColor: 'rgba(0,0,0,0.95)' }}>
            <h3 className="font-mono text-sm mb-3" style={{ color: '#00e5ff' }}>IMPORTAR NIVEL</h3>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Pega el JSON aquí..."
              className="w-full h-40 p-2 font-mono text-[10px]"
              style={{
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(0,229,255,0.2)',
                color: '#00e5ff',
                outline: 'none',
                resize: 'vertical',
              }}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={handleImport} style={{ ...actionButtonStyle('#76ff03'), flex: 1 }}>IMPORTAR</button>
              <button onClick={() => setShowImportDialog(false)} style={{ ...actionButtonStyle('#666', true), flex: 1 }}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTIFICATION ===== */}
      {notification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 font-mono text-xs tracking-wider"
          style={{
            background: 'rgba(0,229,255,0.1)',
            border: '1px solid rgba(0,229,255,0.3)',
            color: '#00e5ff',
            boxShadow: '0 0 20px rgba(0,229,255,0.1)',
          }}>
          {notification}
        </div>
      )}
    </div>
  );
}
