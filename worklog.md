---
Task ID: 1-3
Agent: Main
Task: Fix ECMAScript error + implement all user-requested changes

Work Log:
- Fixed ECMAScript error in LevelEditor.tsx (duplicate savedLevels variable)
- Updated game mechanics: F=Active Pulse (Pulso Activo), C=Crouch toggle, Left Click=Passive Echo, Space=Active Echo
- Built complete landing page with dynamic wave background (ParticleBackground component with canvas particles that illuminate on click and briefly form monster silhouettes)
- Added glitch typography with chromatic aberration effect on title (CSS .glitch-text with ::before/::after pseudo-elements using clip-path animations)
- Created SoundWaveButton component with expanding wave rings and audio feedback on hover
- Built EchoMiniDemo component (30-second playable echolocation demo with walls, entity, hidden logo to find)
- Built AudioDiary component with 6 narrative lore entries using Web Audio API for atmospheric sound
- Added TrailerPreview component (animated canvas showing echolocation mechanic cycle: darkness → pulse → monster reveal → darkness)
- Rewrote hook text from "Estás ciego. Solo puedes ver a través del sonido." to "La oscuridad no es tu enemiga. El silencio sí. Usa el sonido para ver, pero recuerda: ellos también escuchan."
- Added features section with 6 feature cards (Echolocation, 3 Enemy Types, 6 Chapters, Silent Zones, Co-op, Hardcore)
- Updated controls display to reflect new bindings
- Monster rendering already improved (stalker with void face/multiple arms, hunter with unhinging jaw, phantom with afterimage trails)
- Added CSS animations: glitch-1/2, sound-wave-expand, demo-pulse-ring, audio-bar, float-particle, trailer-glow, landing-page scrollbar

Stage Summary:
- All user-requested changes implemented
- Lint passes clean
- App loads with 200 status
- New components: ParticleBackground.tsx, EchoMiniDemo.tsx, AudioDiary.tsx
- Modified: EchoGame.tsx (landing page, SoundWaveButton, TrailerPreview), globals.css (new animations), types.ts (controls), engine.ts (game mechanics)

---
Task ID: 4
Agent: Main
Task: Optimize web for mobile - reduce zoom, responsive design

Work Log:
- Added viewportFit: "cover" to viewport config in layout.tsx for safe area support
- Added format-detection meta tag to prevent iOS auto-behaviors
- Added safe area insets (env(safe-area-inset-*)) to body padding in layout.tsx
- Changed all h-screen to h-[100dvh] for proper mobile viewport height (avoids address bar issues)
- Scaled down hero title from text-5xl to text-3xl sm:text-5xl on mobile
- Scaled down subtitle from text-2xl to text-lg sm:text-2xl on mobile
- Scaled down hook text with responsive sizes (text-sm sm:text-base etc.)
- Made SoundWaveButton and NeonButton full-width on mobile (w-full sm:w-auto)
- Added minHeight: 44 to all buttons for touch accessibility
- Made difficulty select grid responsive: grid-cols-2 sm:grid-cols-3 md:grid-cols-5
- Made chapter select grid responsive: grid-cols-2 sm:grid-cols-1 md:grid-cols-3
- Made features grid responsive: grid-cols-2 md:grid-cols-3 with smaller padding/text on mobile
- Reduced joystick size from 140x140 to 110x110 for smaller screens
- Reduced joystick thumb from 50x50 to 40x40
- Optimized action buttons layout: smaller ECO button (60x60), compact gaps
- Scaled down all game screens (death, win, chapter intro, paused) text for mobile
- Added CSS mobile optimizations: 100dvh support, overscroll-behavior: none, touch target sizes
- Added safe area inset CSS rules for game container
- Updated CSS touch button sizes for mobile (smaller lg/md/sm variants)
- Added text selection prevention for game UI elements
- Updated page.tsx loading screen with responsive text sizes
- Lint passes clean, dev server returns 200

Stage Summary:
- Comprehensive mobile optimization across all game screens
- Prevented zoom via viewport settings and CSS
- All text sizes now scale properly for small screens
- Touch targets meet 44px minimum accessibility standard
- Game controls (joystick, buttons) optimized for smaller displays
- Safe area insets handle notched phones properly
- 100dvh used instead of 100vh to handle mobile browser chrome
---
Task ID: backup-system-and-improvements
Agent: main
Task: Implement full backup system and verify all 10 improvements

Work Log:
- Created backupSystem.ts with FullBackupData interface, 3-slot backup, crash recovery, export/import
- Added createFullBackup(), restoreFullBackup(), saveBackupToSlot() to engine.ts
- Added auto crash-recovery save every 30 seconds during gameplay
- Added Backup Manager UI with slots, export/import, crash recovery detection
- Added crash recovery banner to main menu
- Added "📖 HISTORIA COMPLETA" button to menu for STORY_CINEMATIC
- Added 3 backup slot buttons to pause menu
- Verified all 10 improvements are in place:
  1. Story cinematic (INTRO_CINEMATIC + STORY_CINEMATIC with heartbeat/glitch_text/whisper)
  2. Monster death animations (per-type: explode, dissolve, collapse, static-out, burst)
  3. Dynamic lighting (flicker timer, lightning flash, entity glow pulses)
  4. Screen post-processing (film grain, vignette, chromatic aberration, damage flash, screen shake)
  5. Sound wave visualization (concentric circles around crosshair)
  6. Minimap with fog of war (explored cells, entity dots, player direction)
  7. Kill counter & combat stats (HUD top-left)
  8. Weapon stats in inventory UI
  9. Environmental hazards (toxic/electric/collapsing zones)
  10. Victory/stats screen with S-rank system

Stage Summary:
- Full backup system with 3 slots + crash recovery + file export/import
- All 10 improvements verified and working
- Lint passes, dev server compiles successfully
---
Task ID: gore-blood-system
Agent: Main
Task: Add realistic blood/gore system, heart-rip mechanic, dismemberment, visceral death scenes

Work Log:
- Added 7 new type definitions to types.ts: BloodPool, BloodSplash, BodyPart, DismembermentInfo, HeartRipState, GoreConfig, GoreEventType
- Added 5 new constants to types.ts: DEFAULT_GORE_CONFIG, EMPTY_DISMEMBERMENT, DEFAULT_HEART_RIP_STATE, GORY_DEATH_MESSAGES, MONSTER_BLOOD_COLORS
- Added 6 new gore fields to Player interface: heartRip, isBleeding, bleedingIntensity, bloodTrailTimer, lastGoreEvent, goreEventTimer
- Added 8 new gore fields to Entity interface: dismemberment, bloodTrailTimer, isBleeding, bleedingIntensity, lastGoreEvent, goreEventTimer, headless, gutSpilled
- Implemented complete gore system in engine.ts with 15 gore methods:
  - spawnBloodPool(), spawnBloodSplash(), spawnBodyPart() - create gore elements
  - processGoreEvent() - handles 10 gore event types (blood_spray, dismemberment, head_explode, heart_rip, gut_spill, decapitation, arterial_spray, flesh_tear, bone_break, eye_pop)
  - updateGoreSystem(), updateHeartRip(), attemptHeartRip(), updateBleeding() - frame updates
  - damageEntityGore(), damagePlayerGore() - combat gore hooks
- Added 3 rendering methods: renderGoreFloor(), renderBodyParts(), renderBloodOverlay()
- Body parts have unique visual rendering per type (arm, leg, head, heart, organ, rib, eye, tentacle, torso)
- Heart-rip mechanic: Devourer and Broodmother can grab and extract player's heart (2-second animation, can escape by moving)
- Heart rip shows pulsating heart on screen, red vignette, "¡TE ARRANCAN EL CORAZÓN!" text
- Dismemberment: entities lose limbs when taking high damage at low health (arms, legs, head)
- Blood trails: bleeding entities and players leave blood trails on the floor
- Toxic blood: Abomination, Arachnid, and Broodmother have toxic blood that damages the player
- Monster blood colors: each monster type has unique fresh/dried blood colors
- Environmental gore: levels spawn with dried blood pools and old body parts from previous victims
- Screen blood overlay: spray, drip, smear, and handprint effects when damaged
- Gory death messages in Spanish for different death types (heartRip, dismemberment, devoured, decapitation, generic)
- Death screen shows death message, blood pool count, body part count
- Heart-rip and bleeding status indicators in HUD
- Landing page updated with gore feature descriptions
- Updated EchoGame.tsx engineLiveState polling to include heartRipping, heartRipProgress, playerBleeding, bleedingIntensity, deathMessage, bloodPoolCount, bodyPartCount

Stage Summary:
- Complete realistic gore/blood system implemented
- Heart-rip mechanic with visual feedback and escape mechanism
- Dismemberment system with 7 body part types and unique rendering
- Blood pools, trails, and screen splashes
- Toxic blood mechanic for certain monster types
- Environmental gore spawns on level start
- Visceral Spanish death messages
- All lint checks pass, dev server runs correctly
