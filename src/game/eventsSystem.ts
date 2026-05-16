// ============================================================
// Echoes of the Static — Events & Challenges System v5.0
// 30 Events + 35 Challenges — Weekly & Monthly Auto-Rotation
// ============================================================

export type EventFrequency = 'weekly' | 'monthly';
export type ChallengeFrequency = 'weekly' | 'monthly';
export type EventCategory = 'survival' | 'combat' | 'exploration' | 'speed' | 'stealth' | 'multiplayer' | 'hardcore' | 'gore';
export type ChallengeCategory = 'survival' | 'combat' | 'exploration' | 'speed' | 'stealth' | 'multiplayer' | 'hardcore' | 'gore';
export type EventDifficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'nightmare';

export interface GameEvent {
  id: string;
  name: string;
  description: string;
  frequency: EventFrequency;
  category: EventCategory;
  difficulty: EventDifficulty;
  icon: string;
  color: string;
  objective: string; // e.g. "Sobrevive 5 minutos sin emitir sonido"
  timeLimit?: number; // seconds, if applicable
  targetValue: number; // e.g. 5 for "5 minutos"
  targetUnit: string; // e.g. "minutos", "kills", "pulsos"
  reward: number; // points
  loreText?: string;
}

export interface GameChallenge {
  id: string;
  name: string;
  description: string;
  frequency: ChallengeFrequency;
  category: ChallengeCategory;
  difficulty: EventDifficulty;
  icon: string;
  color: string;
  objective: string;
  timeLimit?: number;
  targetValue: number;
  targetUnit: string;
  reward: number;
  streakReward?: number; // bonus for completing consecutive weeks
  loreText?: string;
}

// ============================================================
// 30 EVENTS — 20 Weekly + 10 Monthly
// ============================================================

export const ALL_EVENTS: GameEvent[] = [
  // ===== WEEKLY EVENTS (20) =====
  {
    id: 'evt_w_01', name: 'Silencio Absoluto', description: 'No emitas ningún sonido durante el tiempo indicado. Ni un paso, ni un susurro.',
    frequency: 'weekly', category: 'stealth', difficulty: 'hard', icon: '🔇', color: '#9c27b0',
    objective: 'Sobrevive sin emitir sonido', timeLimit: 300, targetValue: 5, targetUnit: 'minutos', reward: 2000,
    loreText: 'Los sujetos del Proyecto Eco aprendieron a moverse como fantasmas. Su silencio era tan absoluto que las entidades perdían la noción de su existencia.',
  },
  {
    id: 'evt_w_02', name: 'Cazador de Ecos', description: 'Emite la mayor cantidad de pulsos de ecolocalización sin morir.',
    frequency: 'weekly', category: 'exploration', difficulty: 'medium', icon: '📡', color: '#00e5ff',
    objective: 'Emite pulsos de eco', targetValue: 50, targetUnit: 'pulsos', reward: 1500,
    loreText: 'Cada pulso es una revelación y una sentencia. Los ecos te muestran el camino... y a ellos.',
  },
  {
    id: 'evt_w_03', name: 'Sangre en las Paredes', description: 'Elimina monstruos hasta alcanzar el objetivo. Cada muerte deja su marca.',
    frequency: 'weekly', category: 'combat', difficulty: 'medium', icon: '⚔️', color: '#ff1744',
    objective: 'Elimina entidades', targetValue: 10, targetUnit: 'kills', reward: 1800,
  },
  {
    id: 'evt_w_04', name: 'Velocidad Fantasma', description: 'Completa el capítulo en el tiempo límite. Un segundo más y habrás fallado.',
    frequency: 'weekly', category: 'speed', difficulty: 'hard', icon: '⚡', color: '#ffd600',
    objective: 'Completa un capítulo en menos de', timeLimit: 120, targetValue: 2, targetUnit: 'minutos', reward: 3000,
  },
  {
    id: 'evt_w_05', name: 'Sigilo Mortal', description: 'Elimina 3 entidades mientras estás agachado. Un solo ruido y te descubrirán.',
    frequency: 'weekly', category: 'stealth', difficulty: 'extreme', icon: '🤫', color: '#76ff03',
    objective: 'Elimina entidades en sigilo', targetValue: 3, targetUnit: 'kills sigilosas', reward: 2500,
  },
  {
    id: 'evt_w_06', name: 'Linterna Eterna', description: 'Completa un capítulo usando solo la linterna. Sin pulsos de eco.',
    frequency: 'weekly', category: 'survival', difficulty: 'hard', icon: '🔦', color: '#ffe082',
    objective: 'Completa un capítulo sin usar ecolocalización', targetValue: 1, targetUnit: 'capítulo', reward: 2200,
  },
  {
    id: 'evt_w_07', name: 'Corredor de la Muerte', description: 'Corre sin parar durante el tiempo indicado. No te detengas o las entidades te alcanzarán.',
    frequency: 'weekly', category: 'speed', difficulty: 'medium', icon: '🏃', color: '#ff6d00',
    objective: 'Mantén velocidad máxima durante', targetValue: 3, targetUnit: 'minutos', reward: 1600,
  },
  {
    id: 'evt_w_08', name: 'Médico de Combate', description: 'Sobrevive con menos del 25% de salud durante el tiempo indicado.',
    frequency: 'weekly', category: 'survival', difficulty: 'extreme', icon: '💉', color: '#ff1744',
    objective: 'Sobrevive con salud crítica durante', targetValue: 2, targetUnit: 'minutos', reward: 2800,
  },
  {
    id: 'evt_w_09', name: 'Desarmado y Peligroso', description: 'Elimina entidades sin usar armas. Solo pulsos sónicos y tu ingenio.',
    frequency: 'weekly', category: 'combat', difficulty: 'nightmare', icon: '👊', color: '#ff1744',
    objective: 'Elimina entidades sin armas equipadas', targetValue: 5, targetUnit: 'kills', reward: 3500,
  },
  {
    id: 'evt_w_10', name: 'Explorador Total', description: 'Revela un porcentaje del mapa usando ecolocalización.',
    frequency: 'weekly', category: 'exploration', difficulty: 'easy', icon: '🗺️', color: '#00e5ff',
    objective: 'Revela el mapa con pulsos', targetValue: 80, targetUnit: '% del mapa', reward: 1200,
  },
  {
    id: 'evt_w_11', name: 'No Mires Atrás', description: 'Avanza sin detenerte. Si retrocedes, el evento falla.',
    frequency: 'weekly', category: 'speed', difficulty: 'hard', icon: '👁️', color: '#e040fb',
    objective: 'Avanza sin retroceder durante', targetValue: 4, targetUnit: 'minutos', reward: 2100,
  },
  {
    id: 'evt_w_12', name: 'Zona de Peligro', description: 'Permanece en una zona de peligro (tóxica, eléctrica o inestable) el tiempo indicado.',
    frequency: 'weekly', category: 'survival', difficulty: 'extreme', icon: '☠️', color: '#76ff03',
    objective: 'Sobrevive en zona peligrosa', targetValue: 60, targetUnit: 'segundos', reward: 2400,
  },
  {
    id: 'evt_w_13', name: 'Carnicero', description: 'Causa la mayor cantidad de daño posible en una sola partida.',
    frequency: 'weekly', category: 'gore', difficulty: 'medium', icon: '🩸', color: '#8b0000',
    objective: 'Causa daño total', targetValue: 500, targetUnit: 'de daño', reward: 1700,
  },
  {
    id: 'evt_w_14', name: 'Superviviente del Eco', description: 'Completa un capítulo usando solo el modo de sonar pasivo.',
    frequency: 'weekly', category: 'survival', difficulty: 'hard', icon: '🔊', color: '#9c27b0',
    objective: 'Completa un capítulo en modo pasivo', targetValue: 1, targetUnit: 'capítulo', reward: 2000,
  },
  {
    id: 'evt_w_15', name: 'Cero Daño', description: 'Completa un capítulo sin recibir daño alguno. Ni un rasguño.',
    frequency: 'weekly', category: 'survival', difficulty: 'nightmare', icon: '🛡️', color: '#76ff03',
    objective: 'Completa sin recibir daño', targetValue: 1, targetUnit: 'capítulo', reward: 5000,
  },
  {
    id: 'evt_w_16', name: 'Sangre y Acero', description: 'Elimina entidades con 3 armas diferentes en una sola partida.',
    frequency: 'weekly', category: 'combat', difficulty: 'hard', icon: '🗡️', color: '#ff6d00',
    objective: 'Usa 3 armas distintas para eliminar', targetValue: 3, targetUnit: 'armas diferentes', reward: 2200,
  },
  {
    id: 'evt_w_17', name: 'Infiltrado', description: 'Completa un capítulo sin que ninguna entidad te detecte.',
    frequency: 'weekly', category: 'stealth', difficulty: 'extreme', icon: '👻', color: '#e040fb',
    objective: 'No te detecte ninguna entidad', targetValue: 1, targetUnit: 'capítulo', reward: 4000,
  },
  {
    id: 'evt_w_18', name: 'Pulso Certero', description: 'Acerta a revelar entidades con el eco en un radio cercano.',
    frequency: 'weekly', category: 'exploration', difficulty: 'medium', icon: '🎯', color: '#00e5ff',
    objective: 'Revela entidades cercanas con eco', targetValue: 15, targetUnit: 'revelaciones', reward: 1400,
  },
  {
    id: 'evt_w_19', name: 'Manada Cooperativa', description: 'En multijugador, elimina entidades mientras tu equipo no recibe daño.',
    frequency: 'weekly', category: 'multiplayer', difficulty: 'hard', icon: '👥', color: '#76ff03',
    objective: 'Elimina entidades sin que tu equipo reciba daño', targetValue: 5, targetUnit: 'kills', reward: 2500,
  },
  {
    id: 'evt_w_20', name: 'Hardcore Express', description: 'Completa un capítulo en modo Hardcore en menos del tiempo indicado.',
    frequency: 'weekly', category: 'hardcore', difficulty: 'nightmare', icon: '💀', color: '#ff1744',
    objective: 'Completa capítulo Hardcore en menos de', timeLimit: 180, targetValue: 3, targetUnit: 'minutos', reward: 6000,
  },

  // ===== MONTHLY EVENTS (10) =====
  {
    id: 'evt_m_01', name: 'Maratón de la Estática', description: 'Completa 3 capítulos consecutivos sin morir. La estática no perdona.',
    frequency: 'monthly', category: 'survival', difficulty: 'extreme', icon: '📡', color: '#00e5ff',
    objective: 'Completa 3 capítulos sin morir', targetValue: 3, targetUnit: 'capítulos', reward: 8000,
    loreText: 'Los sujetos que completaron la maratón de frecuencia desarrollaron una sensibilidad auditiva permanente. Nunca más pudieron dormir en silencio.',
  },
  {
    id: 'evt_m_02', name: 'Genocidio de Entidades', description: 'Elimina 50 entidades en total durante el mes. La limpieza es necesaria.',
    frequency: 'monthly', category: 'combat', difficulty: 'hard', icon: '💀', color: '#ff1744',
    objective: 'Elimina entidades este mes', targetValue: 50, targetUnit: 'kills', reward: 6000,
  },
  {
    id: 'evt_m_03', name: 'Explorador Maestro', description: 'Revela el 100% del mapa en 3 capítulos diferentes.',
    frequency: 'monthly', category: 'exploration', difficulty: 'medium', icon: '🧭', color: '#00e5ff',
    objective: 'Revela mapa completo en', targetValue: 3, targetUnit: 'capítulos', reward: 5000,
  },
  {
    id: 'evt_m_04', name: 'Maestro del Sigilo', description: 'Completa 5 capítulos sin ser detectado por ninguna entidad.',
    frequency: 'monthly', category: 'stealth', difficulty: 'nightmare', icon: '🥷', color: '#9c27b0',
    objective: 'Completa sin detección en', targetValue: 5, targetUnit: 'capítulos', reward: 10000,
  },
  {
    id: 'evt_m_05', name: 'Récord de Velocidad', description: 'Completa los 6 capítulos en el menor tiempo total posible.',
    frequency: 'monthly', category: 'speed', difficulty: 'extreme', icon: '⏱️', color: '#ffd600',
    objective: 'Completa todos los capítulos', targetValue: 6, targetUnit: 'capítulos', reward: 12000,
  },
  {
    id: 'evt_m_06', name: 'Carnicería Total', description: 'Causa 5000 de daño total y deja 100 charcos de sangre.',
    frequency: 'monthly', category: 'gore', difficulty: 'hard', icon: '🩸', color: '#8b0000',
    objective: 'Causa daño y deja charcos de sangre', targetValue: 5000, targetUnit: 'de daño', reward: 7000,
  },
  {
    id: 'evt_m_07', name: 'Frecuencia Compartida', description: 'Completa el capítulo multijugador con 5 jugadores en dificultad Pesadilla.',
    frequency: 'monthly', category: 'multiplayer', difficulty: 'nightmare', icon: '👥', color: '#76ff03',
    objective: 'Completa Cap.7 con 5 jugadores en Pesadilla', targetValue: 1, targetUnit: 'partida', reward: 15000,
  },
  {
    id: 'evt_m_08', name: 'Hardcore Legend', description: 'Completa todos los capítulos en modo Hardcore. Sin excepciones.',
    frequency: 'monthly', category: 'hardcore', difficulty: 'nightmare', icon: '☠️', color: '#ff1744',
    objective: 'Completa todos los capítulos en Hardcore', targetValue: 6, targetUnit: 'capítulos', reward: 20000,
  },
  {
    id: 'evt_m_09', name: 'Camino de la Sombra', description: 'Completa 3 capítulos usando solo sonar pasivo y sin linterna.',
    frequency: 'monthly', category: 'stealth', difficulty: 'extreme', icon: '🌑', color: '#37474f',
    objective: 'Completa en pasivo sin linterna', targetValue: 3, targetUnit: 'capítulos', reward: 9000,
  },
  {
    id: 'evt_m_10', name: 'Último en Pie', description: 'En multijugador, sé el último jugador vivo y completa el capítulo solo.',
    frequency: 'monthly', category: 'multiplayer', difficulty: 'extreme', icon: '🏆', color: '#ffd600',
    objective: 'Sé el último vivo y completa', targetValue: 1, targetUnit: 'partida', reward: 11000,
  },
];

// ============================================================
// 35 CHALLENGES — 25 Weekly + 10 Monthly
// ============================================================

export const ALL_CHALLENGES: GameChallenge[] = [
  // ===== WEEKLY CHALLENGES (25) =====
  {
    id: 'ch_w_01', name: 'Primer Paso', description: 'Completa cualquier capítulo. Da el primer paso en la oscuridad.',
    frequency: 'weekly', category: 'survival', difficulty: 'easy', icon: '🚶', color: '#76ff03',
    objective: 'Completa un capítulo', targetValue: 1, targetUnit: 'capítulo', reward: 500, streakReward: 200,
  },
  {
    id: 'ch_w_02', name: 'Eco Inicial', description: 'Emite tu primer pulso de ecolocalización.',
    frequency: 'weekly', category: 'exploration', difficulty: 'easy', icon: '📡', color: '#00e5ff',
    objective: 'Emite un pulso de eco', targetValue: 1, targetUnit: 'pulso', reward: 200, streakReward: 100,
  },
  {
    id: 'ch_w_03', name: 'Asesino Silencioso', description: 'Elimina una entidad sin que te detecte primero.',
    frequency: 'weekly', category: 'stealth', difficulty: 'hard', icon: '🤫', color: '#9c27b0',
    objective: 'Elimina sin ser detectado', targetValue: 1, targetUnit: 'kill sigilosa', reward: 1200, streakReward: 500,
  },
  {
    id: 'ch_w_04', name: 'Superviviente Básico', description: 'Sobrevive 5 minutos en cualquier capítulo.',
    frequency: 'weekly', category: 'survival', difficulty: 'easy', icon: '❤️', color: '#ff1744',
    objective: 'Sobrevive durante', targetValue: 5, targetUnit: 'minutos', reward: 600, streakReward: 300,
  },
  {
    id: 'ch_w_05', name: 'Cazador Novato', description: 'Elimina 3 entidades en una partida.',
    frequency: 'weekly', category: 'combat', difficulty: 'medium', icon: '⚔️', color: '#ff6d00',
    objective: 'Elimina entidades', targetValue: 3, targetUnit: 'kills', reward: 1000, streakReward: 400,
  },
  {
    id: 'ch_w_06', name: 'Corredor', description: 'Recorre 500 metros en una partida.',
    frequency: 'weekly', category: 'exploration', difficulty: 'easy', icon: '🏃', color: '#ffd600',
    objective: 'Recorre distancia', targetValue: 500, targetUnit: 'metros', reward: 800, streakReward: 300,
  },
  {
    id: 'ch_w_07', name: 'Cero Pulsos', description: 'Completa un capítulo sin emitir ni un solo pulso de eco.',
    frequency: 'weekly', category: 'stealth', difficulty: 'extreme', icon: '🔇', color: '#9c27b0',
    objective: 'Completa sin emitir pulsos', targetValue: 1, targetUnit: 'capítulo', reward: 2500, streakReward: 800,
  },
  {
    id: 'ch_w_08', name: 'Berserker', description: 'Elimina 5 entidades con armas cuerpo a cuerpo.',
    frequency: 'weekly', category: 'combat', difficulty: 'hard', icon: '🗡️', color: '#ff1744',
    objective: 'Elimina con armas cuerpo a cuerpo', targetValue: 5, targetUnit: 'kills', reward: 1800, streakReward: 600,
  },
  {
    id: 'ch_w_09', name: 'Farmacéutico', description: 'Usa 5 objetos consumibles en una partida.',
    frequency: 'weekly', category: 'survival', difficulty: 'medium', icon: '💊', color: '#76ff03',
    objective: 'Usa consumibles', targetValue: 5, targetUnit: 'objetos', reward: 900, streakReward: 350,
  },
  {
    id: 'ch_w_10', name: 'Cartógrafo', description: 'Revela el 50% del mapa en un capítulo.',
    frequency: 'weekly', category: 'exploration', difficulty: 'medium', icon: '🗺️', color: '#00e5ff',
    objective: 'Revela el mapa', targetValue: 50, targetUnit: '% del mapa', reward: 1100, streakReward: 400,
  },
  {
    id: 'ch_w_11', name: 'Fuera de la Oscuridad', description: 'Completa un capítulo usando solo la linterna para ver.',
    frequency: 'weekly', category: 'survival', difficulty: 'hard', icon: '🔦', color: '#ffe082',
    objective: 'Completa con solo linterna', targetValue: 1, targetUnit: 'capítulo', reward: 1600, streakReward: 600,
  },
  {
    id: 'ch_w_12', name: 'Velocista', description: 'Completa un capítulo en menos de 3 minutos.',
    frequency: 'weekly', category: 'speed', difficulty: 'hard', icon: '⏱️', color: '#ffd600',
    objective: 'Completa en menos de', targetValue: 3, targetUnit: 'minutos', reward: 2000, streakReward: 700,
  },
  {
    id: 'ch_w_13', name: 'Sangre Fresca', description: 'Deja 10 charcos de sangre en una partida.',
    frequency: 'weekly', category: 'gore', difficulty: 'medium', icon: '🩸', color: '#8b0000',
    objective: 'Deja charcos de sangre', targetValue: 10, targetUnit: 'charcos', reward: 1300, streakReward: 450,
  },
  {
    id: 'ch_w_14', name: 'Desmembrador', description: 'Desmiembra 3 entidades en combate.',
    frequency: 'weekly', category: 'gore', difficulty: 'hard', icon: '🦴', color: '#ff1744',
    objective: 'Desmiembra entidades', targetValue: 3, targetUnit: 'dismembramientos', reward: 1700, streakReward: 550,
  },
  {
    id: 'ch_w_15', name: 'Amigo del Eco', description: 'Completa un capítulo en modo cooperativo.',
    frequency: 'weekly', category: 'multiplayer', difficulty: 'medium', icon: '👥', color: '#76ff03',
    objective: 'Completa en cooperativo', targetValue: 1, targetUnit: 'capítulo', reward: 1500, streakReward: 500,
  },
  {
    id: 'ch_w_16', name: 'Camina, No Corras', description: 'Completa un capítulo sin correr. Solo caminar y agacharse.',
    frequency: 'weekly', category: 'stealth', difficulty: 'medium', icon: '🚶', color: '#9c27b0',
    objective: 'Completa sin correr', targetValue: 1, targetUnit: 'capítulo', reward: 1200, streakReward: 400,
  },
  {
    id: 'ch_w_17', name: 'Devorador de Devoradores', description: 'Elimina 2 Devoradores en una partida.',
    frequency: 'weekly', category: 'combat', difficulty: 'extreme', icon: '👹', color: '#8b0000',
    objective: 'Elimina Devoradores', targetValue: 2, targetUnit: 'Devoradores', reward: 2200, streakReward: 750,
  },
  {
    id: 'ch_w_18', name: 'Maestro de Puertas', description: 'Abre 8 puertas en un capítulo.',
    frequency: 'weekly', category: 'exploration', difficulty: 'easy', icon: '🚪', color: '#ffab00',
    objective: 'Abre puertas', targetValue: 8, targetUnit: 'puertas', reward: 700, streakReward: 250,
  },
  {
    id: 'ch_w_19', name: 'Sin Linterna', description: 'Completa un capítulo sin usar la linterna.',
    frequency: 'weekly', category: 'survival', difficulty: 'hard', icon: '🌑', color: '#37474f',
    objective: 'Completa sin linterna', targetValue: 1, targetUnit: 'capítulo', reward: 1800, streakReward: 650,
  },
  {
    id: 'ch_w_20', name: 'Voz del Micrófono', description: 'Activa el micrófono y emite sonido 3 veces para atraer entidades.',
    frequency: 'weekly', category: 'survival', difficulty: 'medium', icon: '🎤', color: '#00e5ff',
    objective: 'Atrae entidades con micrófono', targetValue: 3, targetUnit: 'atracciones', reward: 1100, streakReward: 400,
  },
  {
    id: 'ch_w_21', name: 'Punto Ciego', description: 'Permanece en una zona silenciosa durante 30 segundos.',
    frequency: 'weekly', category: 'survival', difficulty: 'hard', icon: '🔇', color: '#1a0033',
    objective: 'Permanece en zona silenciosa', targetValue: 30, targetUnit: 'segundos', reward: 1400, streakReward: 500,
  },
  {
    id: 'ch_w_22', name: 'Rescatador', description: 'En multijugador, revive a un compañero caído.',
    frequency: 'weekly', category: 'multiplayer', difficulty: 'hard', icon: '🆘', color: '#76ff03',
    objective: 'Revive a un compañero', targetValue: 1, targetUnit: 'revive', reward: 1600, streakReward: 550,
  },
  {
    id: 'ch_w_23', name: 'Acumulador', description: 'Consigue 15 objetos en una partida.',
    frequency: 'weekly', category: 'exploration', difficulty: 'easy', icon: '🎒', color: '#ffd600',
    objective: 'Recoge objetos', targetValue: 15, targetUnit: 'objetos', reward: 800, streakReward: 300,
  },
  {
    id: 'ch_w_24', name: 'Hardcore Initiate', description: 'Completa un capítulo en modo Hardcore.',
    frequency: 'weekly', category: 'hardcore', difficulty: 'extreme', icon: '💀', color: '#ff1744',
    objective: 'Completa un capítulo en Hardcore', targetValue: 1, targetUnit: 'capítulo', reward: 3000, streakReward: 1000,
  },
  {
    id: 'ch_w_25', name: 'Cazador de Madres', description: 'Elimina a La Madre (Broodmother) sin que genere parásitos.',
    frequency: 'weekly', category: 'combat', difficulty: 'nightmare', icon: '🕷️', color: '#880e4f',
    objective: 'Elimina a La Madre sin parásitos', targetValue: 1, targetUnit: 'Broodmother', reward: 3500, streakReward: 1200,
  },

  // ===== MONTHLY CHALLENGES (10) =====
  {
    id: 'ch_m_01', name: 'Superviviente Legendario', description: 'Completa 5 capítulos en cualquier dificultad sin morir.',
    frequency: 'monthly', category: 'survival', difficulty: 'extreme', icon: '🏆', color: '#ffd600',
    objective: 'Completa sin morir', targetValue: 5, targetUnit: 'capítulos', reward: 6000, streakReward: 2000,
  },
  {
    id: 'ch_m_02', name: 'Genocida', description: 'Elimina 100 entidades durante el mes.',
    frequency: 'monthly', category: 'combat', difficulty: 'hard', icon: '💀', color: '#ff1744',
    objective: 'Elimina entidades este mes', targetValue: 100, targetUnit: 'kills', reward: 5000, streakReward: 1500,
  },
  {
    id: 'ch_m_03', name: 'Fantasma Perfecto', description: 'Completa 3 capítulos sin ser detectado.',
    frequency: 'monthly', category: 'stealth', difficulty: 'nightmare', icon: '👻', color: '#e040fb',
    objective: 'Completa sin detección', targetValue: 3, targetUnit: 'capítulos', reward: 8000, streakReward: 2500,
  },
  {
    id: 'ch_m_04', name: 'Velocista Maestro', description: 'Completa los 6 capítulos en menos de 20 minutos totales.',
    frequency: 'monthly', category: 'speed', difficulty: 'extreme', icon: '⚡', color: '#ffd600',
    objective: 'Completa todos en menos de', targetValue: 20, targetUnit: 'minutos totales', reward: 10000, streakReward: 3000,
  },
  {
    id: 'ch_m_05', name: 'Armería Completa', description: 'Usa las 10 armas del juego para eliminar al menos 1 entidad con cada una.',
    frequency: 'monthly', category: 'combat', difficulty: 'hard', icon: '⚔️', color: '#ff6d00',
    objective: 'Elimina con las 10 armas', targetValue: 10, targetUnit: 'armas diferentes', reward: 7000, streakReward: 2000,
  },
  {
    id: 'ch_m_06', name: 'Carnicero Mensual', description: 'Causa 10000 de daño total y desmiembra 20 entidades.',
    frequency: 'monthly', category: 'gore', difficulty: 'extreme', icon: '🩸', color: '#8b0000',
    objective: 'Causa daño y desmiembra', targetValue: 10000, targetUnit: 'de daño', reward: 8000, streakReward: 2500,
  },
  {
    id: 'ch_m_07', name: 'Equipo Inquebrantable', description: 'En multijugador, completa 3 capítulos sin que muera ningún jugador.',
    frequency: 'monthly', category: 'multiplayer', difficulty: 'extreme', icon: '👥', color: '#76ff03',
    objective: 'Completa sin bajas en equipo', targetValue: 3, targetUnit: 'capítulos', reward: 9000, streakReward: 3000,
  },
  {
    id: 'ch_m_08', name: 'Camino del Vacío', description: 'Completa un capítulo en dificultad Vacío.',
    frequency: 'monthly', category: 'hardcore', difficulty: 'nightmare', icon: '🕳️', color: '#9c27b0',
    objective: 'Completa en dificultad Vacío', targetValue: 1, targetUnit: 'capítulo', reward: 12000, streakReward: 4000,
  },
  {
    id: 'ch_m_09', name: 'Explorador del Abismo', description: 'Revela el 100% del mapa en todos los capítulos.',
    frequency: 'monthly', category: 'exploration', difficulty: 'extreme', icon: '🗺️', color: '#00e5ff',
    objective: 'Revela mapa completo en', targetValue: 6, targetUnit: 'capítulos', reward: 7000, streakReward: 2000,
  },
  {
    id: 'ch_m_10', name: 'Maestro de la Estática', description: 'Completa todos los desafíos semanales del mes.',
    frequency: 'monthly', category: 'hardcore', difficulty: 'nightmare', icon: '👑', color: '#ffd600',
    objective: 'Completa todos los desafíos semanales', targetValue: 25, targetUnit: 'desafíos', reward: 25000, streakReward: 8000,
  },
];

// ============================================================
// AUTO-ROTATION SYSTEM
// Uses current week number / month number to select active events
// ============================================================

function getWeekNumber(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.floor(diff / oneWeek) + 1;
}

function getMonthNumber(date: Date): number {
  return date.getMonth() + 1;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const rng = seededRandom(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getActiveWeeklyEvents(count: number = 5): GameEvent[] {
  const weekNum = getWeekNumber(new Date());
  const weeklyEvents = ALL_EVENTS.filter(e => e.frequency === 'weekly');
  const shuffled = shuffleArray(weeklyEvents, weekNum * 7 + 42);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function getActiveMonthlyEvents(count: number = 4): GameEvent[] {
  const monthNum = getMonthNumber(new Date());
  const monthlyEvents = ALL_EVENTS.filter(e => e.frequency === 'monthly');
  const shuffled = shuffleArray(monthlyEvents, monthNum * 13 + 99);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function getActiveWeeklyChallenges(count: number = 8): GameChallenge[] {
  const weekNum = getWeekNumber(new Date());
  const weeklyChallenges = ALL_CHALLENGES.filter(c => c.frequency === 'weekly');
  const shuffled = shuffleArray(weeklyChallenges, weekNum * 11 + 73);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function getActiveMonthlyChallenges(count: number = 5): GameChallenge[] {
  const monthNum = getMonthNumber(new Date());
  const monthlyChallenges = ALL_CHALLENGES.filter(c => c.frequency === 'monthly');
  const shuffled = shuffleArray(monthlyChallenges, monthNum * 17 + 53);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function getNextWeeklyReset(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}

export function getNextMonthlyReset(): Date {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth;
}

export function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return 'Ahora';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getDifficultyLabel(diff: EventDifficulty): { label: string; color: string } {
  switch (diff) {
    case 'easy': return { label: 'Fácil', color: '#4caf50' };
    case 'medium': return { label: 'Medio', color: '#ffd600' };
    case 'hard': return { label: 'Difícil', color: '#ff9800' };
    case 'extreme': return { label: 'Extremo', color: '#ff5722' };
    case 'nightmare': return { label: 'Pesadilla', color: '#ff1744' };
  }
}

export function getCategoryLabel(cat: EventCategory | ChallengeCategory): { label: string; icon: string } {
  switch (cat) {
    case 'survival': return { label: 'Supervivencia', icon: '❤️' };
    case 'combat': return { label: 'Combate', icon: '⚔️' };
    case 'exploration': return { label: 'Exploración', icon: '🗺️' };
    case 'speed': return { label: 'Velocidad', icon: '⚡' };
    case 'stealth': return { label: 'Sigilo', icon: '🤫' };
    case 'multiplayer': return { label: 'Multijugador', icon: '👥' };
    case 'hardcore': return { label: 'Hardcore', icon: '💀' };
    case 'gore': return { label: 'Gore', icon: '🩸' };
  }
}
