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
