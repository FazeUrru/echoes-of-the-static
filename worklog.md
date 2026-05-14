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
