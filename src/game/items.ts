// ============================================================
// Echoes of the Static - 75+ Items Database v2.5
// ============================================================

import { ItemDef, ItemRarity } from './types';

const COMMON: ItemRarity = 'common';
const UNCOMMON: ItemRarity = 'uncommon';
const RARE: ItemRarity = 'rare';
const LEGENDARY: ItemRarity = 'legendary';

export const ALL_ITEMS: ItemDef[] = [
  // ═══════════════ TOOLS (10) ═══════════════
  { id: 'flashlight', name: 'Linterna', description: 'Ilumina una zona estrecha frente a ti. Consume batería.', category: 'tool', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '🔦', effect: 'flashlight', uses: 200, noiseOnUse: 0.1, rangeOnUse: 8 },
  { id: 'flashlight_battery', name: 'Batería', description: 'Recarga la linterna 50 usos.', category: 'tool', rarity: COMMON, stackable: true, maxStack: 5, icon: '🔋', effect: 'recharge_flashlight', value: 50 },
  { id: 'echolocator', name: 'Ecolocalizador', description: 'Dispositivo que amplifica el pulso de eco. +5 radio.', category: 'tool', rarity: RARE, stackable: false, maxStack: 1, icon: '📡', effect: 'boost_pulse', value: 5, uses: 10, noiseOnUse: 0.3, rangeOnUse: 20 },
  { id: 'sound_dampener', name: 'Amortiguador', description: 'Reduce el ruido de tus pasos un 50% durante 60s.', category: 'tool', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '🔇', effect: 'dampen_footsteps', value: 60 },
  { id: 'lockpick', name: 'Ganzúa', description: 'Abre una puerta cerrada sin llave. Un solo uso.', category: 'tool', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '🔓', effect: 'unlock_door', noiseOnUse: 0.6, rangeOnUse: 3, uses: 1 },
  { id: 'sonar_watch', name: 'Reloj Sónar', description: 'Emite un eco suave cada 5 segundos. Te ayuda a orientarte.', category: 'tool', rarity: RARE, stackable: false, maxStack: 1, icon: '⌚', effect: 'auto_pulse', value: 5 },
  { id: 'radar_device', name: 'Radar Portátil', description: 'Muestra puntos rojos en la dirección de las entidades cercanas.', category: 'tool', rarity: RARE, stackable: false, maxStack: 1, icon: '📱', effect: 'entity_radar', uses: 30 },
  { id: 'rope', name: 'Cuerda', description: 'Permite descender por pozos y aberturas.', category: 'tool', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '🪢', effect: 'rope_descent', uses: 3 },
  { id: 'compass', name: 'Brújula', description: 'Mejora la precisión de la flecha de salida.', category: 'tool', rarity: COMMON, stackable: false, maxStack: 1, icon: '🧭', effect: 'compass_upgrade' },
  { id: 'night_visor', name: 'Visor Nocturno', description: 'Muestra siluetas de paredes cercanas siempre activo. Batería limitada.', category: 'tool', rarity: LEGENDARY, stackable: false, maxStack: 1, icon: '🥽', effect: 'night_vision', uses: 100 },
  { id: 'passive_sonar', name: 'Sonar Pasivo', description: 'Ves poco, pero no haces ruido. Escaneo silencioso de los alrededores.', category: 'tool', rarity: RARE, stackable: false, maxStack: 1, icon: '🔬', effect: 'passive_sonar', uses: 30, noiseOnUse: 0, rangeOnUse: 8 },
  { id: 'active_sonar', name: 'Sonar Activo', description: 'Ves mucho, pero atraes atención. Pulso poderoso que revela todo.', category: 'tool', rarity: RARE, stackable: false, maxStack: 1, icon: '📡', effect: 'active_sonar', uses: 10, noiseOnUse: 1.5, rangeOnUse: 25 },
  { id: 'sonar_passive_module', name: 'Módulo Sonar Pasivo', description: 'Cambia tu sonar a modo pasivo. No emites ruido, pero ves menos.', category: 'tool', rarity: RARE, stackable: false, maxStack: 1, icon: '🔇', effect: 'passive_sonar_module', noiseOnUse: 0 },
  { id: 'sonar_active_module', name: 'Módulo Sonar Activo', description: 'Cambia tu sonar de vuelta a modo activo. Pulso fuerte que revela todo.', category: 'tool', rarity: RARE, stackable: false, maxStack: 1, icon: '🔊', effect: 'active_sonar_module', noiseOnUse: 0.3, rangeOnUse: 3 },

  // ═══════════════ CONSUMABLES (15) ═══════════════
  { id: 'medkit', name: 'Botiquín', description: 'Restaura 30 de salud.', category: 'consumable', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '🩹', effect: 'heal', value: 30, noiseOnUse: 0.2, rangeOnUse: 2 },
  { id: 'medkit_large', name: 'Botiquín Grande', description: 'Restaura toda la salud.', category: 'consumable', rarity: RARE, stackable: true, maxStack: 1, icon: '🏥', effect: 'heal', value: 100, noiseOnUse: 0.3, rangeOnUse: 3 },
  { id: 'stamina_drink', name: 'Bebida Energética', description: 'Restaura 50 de resistencia.', category: 'consumable', rarity: COMMON, stackable: true, maxStack: 5, icon: '🥤', effect: 'stamina', value: 50 },
  { id: 'painkiller', name: 'Analgésico', description: 'Ignora el dolor. Sin penalización por daño durante 30s.', category: 'consumable', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '💊', effect: 'painkiller', value: 30 },
  { id: 'adrenaline', name: 'Adrenalina', description: 'Velocidad +50% durante 10s. Luego agotamiento.', category: 'consumable', rarity: RARE, stackable: true, maxStack: 2, icon: '💉', effect: 'adrenaline', value: 10, noiseOnUse: 0.1 },
  { id: 'sleeping_pill', name: 'Pastilla para Dormir', description: 'Enlentece las entidades cercanas 30s.', category: 'consumable', rarity: RARE, stackable: true, maxStack: 2, icon: '😴', effect: 'slow_entities', value: 30 },
  { id: 'caffeine_pill', name: 'Pastilla de Cafeína', description: 'Elimina la respiración pesada temporalmente.', category: 'consumable', rarity: COMMON, stackable: true, maxStack: 5, icon: '☕', effect: 'steady_breath', value: 45 },
  { id: 'alcohol', name: 'Alcohol', description: 'Reduce el miedo pero empeora la visión. 30s.', category: 'consumable', rarity: COMMON, stackable: true, maxStack: 3, icon: '🍶', effect: 'drunk', value: 30 },
  { id: 'antidote', name: 'Antídoto', description: 'Cura efectos negativos.', category: 'consumable', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '🧪', effect: 'cure' },
  { id: 'batteries_small', name: 'Pilas Pequeñas', description: 'Recarga linterna 20 usos.', category: 'consumable', rarity: COMMON, stackable: true, maxStack: 8, icon: '🔋', effect: 'recharge_flashlight', value: 20 },
  { id: 'food_can', name: 'Lata de Comida', description: 'Restaura 10 de salud y resistencia.', category: 'consumable', rarity: COMMON, stackable: true, maxStack: 5, icon: '🥫', effect: 'heal_stamina', value: 10, noiseOnUse: 0.4, rangeOnUse: 3 },
  { id: 'water_bottle', name: 'Botella de Agua', description: 'Restaura 20 de resistencia.', category: 'consumable', rarity: COMMON, stackable: true, maxStack: 5, icon: '💧', effect: 'stamina', value: 20 },
  { id: 'bandage', name: 'Vendaje', description: 'Restaura 15 de salud. Silencioso.', category: 'consumable', rarity: COMMON, stackable: true, maxStack: 5, icon: '🩹', effect: 'heal', value: 15 },
  { id: 'herbal_tea', name: 'Té Herbal', description: 'Restaura resistencia y reduce ritmo cardíaco.', category: 'consumable', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '🍵', effect: 'calm', value: 40 },
  { id: 'mystery_pill', name: 'Pastilla Misteriosa', description: 'Efecto aleatorio. ¿Te atreves?', category: 'consumable', rarity: RARE, stackable: true, maxStack: 2, icon: '💊', effect: 'random' },
  { id: 'echo_amplifier', name: 'Amplificador de Eco', description: 'Aumenta el radio del eco un 50% durante el nivel actual.', category: 'consumable', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '📢', effect: 'echo_amplifier', noiseOnUse: 0.1, rangeOnUse: 2 },
  { id: 'sound_dampener_field', name: 'Campo Amortiguador', description: 'Crea una zona a tu alrededor que amortigua todo el ruido durante 30s.', category: 'consumable', rarity: RARE, stackable: false, maxStack: 1, icon: '🛑', effect: 'sound_dampener_field', noiseOnUse: 0 },

  // ═══════════════ KEYS (10) ═══════════════
  { id: 'key_rusty', name: 'Llave Oxidada', description: 'Abre puertas antiguas del edificio.', category: 'key', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '🗝️', effect: 'key_rusty' },
  { id: 'key_master', name: 'Llave Maestra', description: 'Abre cualquier puerta del nivel actual.', category: 'key', rarity: LEGENDARY, stackable: false, maxStack: 1, icon: '🔑', effect: 'key_master' },
  { id: 'key_sewer', name: 'Llave de Alcantarilla', description: 'Abre las rejillas de las cloacas.', category: 'key', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '🗝️', effect: 'key_sewer' },
  { id: 'key_hospital', name: 'Llave del Hospital', description: 'Acceso a las alas restringidas.', category: 'key', rarity: RARE, stackable: false, maxStack: 1, icon: '🏥', effect: 'key_hospital' },
  { id: 'key_ancient', name: 'Llave Antigua', description: 'Una llave de piedra tallada. Abre el paso subterráneo.', category: 'key', rarity: LEGENDARY, stackable: false, maxStack: 1, icon: '🗿', effect: 'ancient_key' },
  { id: 'key_tower', name: 'Llave de la Torre', description: 'El acceso a la torre del silencio.', category: 'key', rarity: LEGENDARY, stackable: false, maxStack: 1, icon: '🏰', effect: 'key_tower' },
  { id: 'keycard_blue', name: 'Tarjeta Azul', description: 'Acceso nivel 1. Puertas electrónicas azules.', category: 'key', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '💳', effect: 'keycard_blue' },
  { id: 'keycard_red', name: 'Tarjeta Roja', description: 'Acceso nivel 2. Puertas electrónicas rojas.', category: 'key', rarity: RARE, stackable: false, maxStack: 1, icon: '💳', effect: 'keycard_red' },
  { id: 'keycard_gold', name: 'Tarjeta Dorada', description: 'Acceso total. Todas las puertas electrónicas.', category: 'key', rarity: LEGENDARY, stackable: false, maxStack: 1, icon: '💳', effect: 'keycard_gold' },
  { id: 'key_street_gate', name: 'Llave del Portón', description: 'Abre el portón de la calle.', category: 'key', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '🚪', effect: 'key_street_gate' },

  // ═══════════════ WEAPONS (8) ═══════════════
  { id: 'throwing_rock', name: 'Piedra', description: 'Lánzala para crear un sonido lejano. Distrae entidades.', category: 'weapon', rarity: COMMON, stackable: true, maxStack: 10, icon: '🪨', effect: 'throw_distraction', noiseOnUse: 0.8, rangeOnUse: 10, uses: 1 },
  { id: 'glass_bottle', name: 'Botella de Cristal', description: 'Se rompe al impactar. Ruido fuerte en el punto de impacto.', category: 'weapon', rarity: COMMON, stackable: true, maxStack: 5, icon: '🍶', effect: 'throw_loud', noiseOnUse: 1.0, rangeOnUse: 12, uses: 1 },
  { id: 'flare', name: 'Bengala', description: 'Ilumina una gran zona durante 10s. Muy ruidoso.', category: 'weapon', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '🎆', effect: 'flare', noiseOnUse: 1.0, rangeOnUse: 20, uses: 1 },
  { id: 'firecracker', name: 'Petardo', description: 'Explosión de ruido. Todas las entidades investigan.', category: 'weapon', rarity: UNCOMMON, stackable: true, maxStack: 5, icon: '🧨', effect: 'firecracker', noiseOnUse: 1.0, rangeOnUse: 25, uses: 1 },
  { id: 'whistle', name: 'Silbato', description: 'Sonido agudo que atrae entidades a tu posición.', category: 'weapon', rarity: COMMON, stackable: true, maxStack: 3, icon: '🎵', effect: 'whistle', noiseOnUse: 1.0, rangeOnUse: 15, uses: 3 },
  { id: 'shock_device', name: 'Descargador', description: 'Aturde a una entidad cercana durante 5s.', category: 'weapon', rarity: RARE, stackable: false, maxStack: 1, icon: '⚡', effect: 'stun_entity', noiseOnUse: 0.7, rangeOnUse: 2, uses: 3 },
  { id: 'smoke_bomb', name: 'Bomba de Humo', description: 'Crea una zona de silencio temporal. 15s.', category: 'weapon', rarity: RARE, stackable: true, maxStack: 2, icon: '💨', effect: 'silence_zone', uses: 1 },
  { id: 'sound_trap', name: 'Trampa Sonora', description: 'Coloca una trampa que emite ruido cuando una entidad pasa cerca.', category: 'weapon', rarity: RARE, stackable: true, maxStack: 2, icon: '⚠️', effect: 'sound_trap', uses: 1 },

  // ═══════════════ ARMOR (6) ═══════════════
  { id: 'padded_shoes', name: 'Zapatillas Acolchadas', description: 'Reduce ruido de pasos un 30%. Equipo pasivo.', category: 'armor', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '👟', effect: 'quiet_steps' },
  { id: 'soundproof_vest', name: 'Chaleco Insonorizado', description: 'Reduce ruido general un 20%. Equipo pasivo.', category: 'armor', rarity: RARE, stackable: false, maxStack: 1, icon: '🦺', effect: 'quiet_body' },
  { id: 'heavy_boots', name: 'Botas Pesadas', description: 'Más ruido pero +10% velocidad.', category: 'armor', rarity: COMMON, stackable: false, maxStack: 1, icon: '🥾', effect: 'heavy_steps' },
  { id: 'thick_coat', name: 'Abrigo Grueso', description: 'Protege del frío. Reduce daño recibido un 15%.', category: 'armor', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '🧥', effect: 'damage_reduction' },
  { id: 'kevlar_vest', name: 'Chaleco Kevlar', description: 'Reduce daño recibido un 40%. Un solo uso por ataque.', category: 'armor', rarity: RARE, stackable: false, maxStack: 1, icon: '🛡️', effect: 'kevlar', uses: 3 },
  { id: 'shadow_cloak', name: 'Capa de Sombra', description: 'Las entidades tardan más en detectarte. Pasivo.', category: 'armor', rarity: LEGENDARY, stackable: false, maxStack: 1, icon: '🧛', effect: 'stealth_boost' },

  // ═══════════════ DOCUMENTS (12) ═══════════════
  { id: 'note_1', name: 'Nota Arrugada', description: '"No hagas ruido. Ellas escuchan todo."', category: 'document', rarity: COMMON, stackable: false, maxStack: 1, icon: '📜' },
  { id: 'note_2', name: 'Diario Roto', description: '"Día 15... he aprendido a moverme en silencio. Las sombras responden al sonido."', category: 'document', rarity: COMMON, stackable: false, maxStack: 1, icon: '📓' },
  { id: 'note_3', name: 'Mapa Garabateado', description: 'Un mapa parcial del área con marcas de peligros.', category: 'document', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '🗺️', effect: 'reveal_map' },
  { id: 'note_4', name: 'Informe Médico', description: '"Los sujetos han perdido la vista pero su audición se ha amplificado x100."', category: 'document', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '📋' },
  { id: 'note_5', name: 'Carta de Despedida', description: '"Si lees esto, no enciendas la luz. Solo escucha."', category: 'document', rarity: COMMON, stackable: false, maxStack: 1, icon: '✉️' },
  { id: 'note_6', name: 'Manual de Supervivencia', description: 'Consejos sobre las entidades y su comportamiento.', category: 'document', rarity: RARE, stackable: false, maxStack: 1, icon: '📖', effect: 'enemy_info' },
  { id: 'note_7', name: 'Fórmula Química', description: 'Anotaciones sobre un compuesto que repele entidades.', category: 'document', rarity: RARE, stackable: false, maxStack: 1, icon: '🔬' },
  { id: 'note_8', name: 'Hoja de Ruta', description: 'Muestra la ubicación de todas las salidas del nivel.', category: 'document', rarity: RARE, stackable: false, maxStack: 1, icon: '🛤️', effect: 'reveal_exits' },
  { id: 'note_9', name: 'Foto Borrosa', description: 'Una foto de la torre. Algo se mueve en la cima.', category: 'document', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '📷' },
  { id: 'note_10', name: 'Código de Acceso', description: '4 dígitos garabateados: 7-3-9-1', category: 'document', rarity: RARE, stackable: false, maxStack: 1, icon: '🔐', effect: 'code_7391' },
  { id: 'note_11', name: 'Profecía', description: '"Cuando la estática cese, los ciegos verán y los sordos oirán."', category: 'document', rarity: LEGENDARY, stackable: false, maxStack: 1, icon: '🔮' },
  { id: 'note_12', name: 'Registro de Audio', description: 'Una grabación con los sonidos de cada tipo de entidad.', category: 'document', rarity: RARE, stackable: false, maxStack: 1, icon: '🎙️', effect: 'enemy_sounds' },

  // ═══════════════ MISC (14) ═══════════════
  { id: 'carpet_piece', name: 'Trozo de Alfombra', description: 'Colócalo para caminar sin hacer ruido en una zona.', category: 'misc', rarity: COMMON, stackable: true, maxStack: 5, icon: '🟫', effect: 'quiet_floor', uses: 1 },
  { id: 'foam_pad', name: 'Espuma Aislante', description: 'Colócala en una pared para amortiguar ecos.', category: 'misc', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '⬜', effect: 'dampen_echo', uses: 1 },
  { id: 'mirror_shard', name: 'Fragmento de Espejo', description: 'Refleja la luz de la linterna en otra dirección.', category: 'misc', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '🪞', effect: 'reflect_light', uses: 5 },
  { id: 'wax_earplugs', name: 'Tapones de Cera', description: 'Reduce el volumen de los gritos de las entidades.', category: 'misc', rarity: COMMON, stackable: true, maxStack: 3, icon: '👂', effect: 'reduce_entity_sound' },
  { id: 'clockwork_toy', name: 'Juguete de Cuerda', description: 'Suena durante 10 segundos donde lo dejes.', category: 'misc', rarity: UNCOMMON, stackable: true, maxStack: 3, icon: '🎪', effect: 'timed_distraction', noiseOnUse: 0.6, rangeOnUse: 8, uses: 1 },
  { id: 'chalk', name: 'Tiza', description: 'Marca paredes para recordar el camino.', category: 'misc', rarity: COMMON, stackable: true, maxStack: 20, icon: '🖍️', effect: 'mark_wall', uses: 1 },
  { id: 'cloth_strip', name: 'Tira de Tela', description: 'Venda improvisada. Cura 8 de salud.', category: 'misc', rarity: COMMON, stackable: true, maxStack: 10, icon: '🧵', effect: 'heal', value: 8 },
  { id: 'metal_scrap', name: 'Chatarra Metálica', description: 'Haz ruido o úsala como distracción.', category: 'misc', rarity: COMMON, stackable: true, maxStack: 10, icon: '🔩', effect: 'throw_distraction', noiseOnUse: 0.5, rangeOnUse: 5, uses: 1 },
  { id: 'old_radio', name: 'Radio Vieja', description: 'Emite estática que oculta tus pasos. 20s.', category: 'misc', rarity: RARE, stackable: false, maxStack: 1, icon: '📻', effect: 'static_mask', uses: 5, noiseOnUse: 0.4, rangeOnUse: 15 },
  { id: 'candle', name: 'Vela', description: 'Luz tenue y estable. Las entidades la ignoran.', category: 'misc', rarity: COMMON, stackable: true, maxStack: 5, icon: '🕯️', effect: 'steady_light', uses: 30 },
  { id: 'glow_stick', name: 'Barra Luminosa', description: 'Luz química suave durante 60s. No atrae entidades.', category: 'misc', rarity: COMMON, stackable: true, maxStack: 5, icon: '💡', effect: 'soft_light', uses: 1 },
  { id: 'bolt_cutters', name: 'Cortacables', description: 'Corta cadenas y cerraduras endebles.', category: 'misc', rarity: UNCOMMON, stackable: false, maxStack: 1, icon: '✂️', effect: 'cut_lock', noiseOnUse: 0.5, rangeOnUse: 2, uses: 5 },
  { id: 'tape_roll', name: 'Cinta Adhesiva', description: 'Repara objetos o silencia superficies.', category: 'misc', rarity: COMMON, stackable: true, maxStack: 5, icon: '🏷️', effect: 'tape', uses: 5 },
  { id: 'prism', name: 'Prisma', description: 'Descompone la luz en colores. Amplifica la linterna.', category: 'misc', rarity: RARE, stackable: false, maxStack: 1, icon: '🔺', effect: 'amplify_flashlight' },
];

export const ITEMS_BY_CATEGORY = (category: string) => ALL_ITEMS.filter(i => i.category === category);
export const ITEMS_BY_RARITY = (rarity: string) => ALL_ITEMS.filter(i => i.rarity === rarity);
export const ITEM_BY_ID = (id: string) => ALL_ITEMS.find(i => i.id === id);

// Items that spawn in each map type
export const ITEM_SPAWN_TABLES: Record<string, string[]> = {
  building: ['flashlight', 'batteries_small', 'bandage', 'food_can', 'water_bottle', 'throwing_rock', 'glass_bottle', 'chalk', 'carpet_piece', 'key_rusty', 'note_1', 'note_2', 'candle', 'glow_stick', 'cloth_strip', 'metal_scrap', 'lockpick', 'padded_shoes', 'tape_roll', 'note_5', 'sonar_passive_module', 'echo_amplifier'],
  sewers: ['flashlight_battery', 'bandage', 'stamina_drink', 'throwing_rock', 'key_sewer', 'note_3', 'candle', 'cloth_strip', 'wax_earplugs', 'foam_pad', 'clockwork_toy', 'old_radio', 'note_4', 'sound_dampener', 'caffeine_pill'],
  street: ['throwing_rock', 'glass_bottle', 'food_can', 'water_bottle', 'key_street_gate', 'note_9', 'flare', 'firecracker', 'whistle', 'heavy_boots', 'thick_coat', 'chalk', 'carpet_piece', 'metal_scrap', 'batteries_small', 'compass'],
  hospital: ['medkit', 'medkit_large', 'painkiller', 'adrenaline', 'antidote', 'key_hospital', 'keycard_blue', 'keycard_red', 'note_4', 'note_6', 'note_7', 'flashlight_battery', 'lockpick', 'shock_device', 'kevlar_vest', 'sonar_active_module', 'sound_dampener_field'],
  underground: ['flashlight_battery', 'medkit', 'key_ancient', 'note_8', 'note_10', 'note_11', 'radar_device', 'echolocator', 'smoke_bomb', 'sound_trap', 'rope', 'bolt_cutters', 'night_visor', 'prism', 'sonar_passive_module', 'sonar_active_module', 'echo_amplifier', 'sound_dampener_field'],
  tower: ['medkit_large', 'key_tower', 'keycard_gold', 'note_11', 'note_12', 'shadow_cloak', 'sleeping_pill', 'adrenaline', 'shock_device', 'smoke_bomb', 'flare', 'firecracker', 'ancient_key', 'flashlight_battery', 'sonar_passive_module', 'sonar_active_module', 'echo_amplifier', 'sound_dampener_field'],
};
