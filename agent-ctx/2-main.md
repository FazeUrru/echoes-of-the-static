# Task 2 - Mobile Touch Controls and PWA Offline Support

## Agent: main

## Summary
Added complete mobile touch control support and PWA offline functionality to the "Echoes of the Static" horror game.

## Changes Made

### Engine (`/home/z/my-project/src/game/engine.ts`)
- Added touch input properties: `touchMoveX`, `touchMoveY`, `touchSneak`, `touchLookDelta`, `isMobile`
- Modified `updatePlayer()` to handle touch joystick movement (additive with keyboard), apply `touchLookDelta` each frame, and consider `touchSneak` in isSneaking calculation
- Made `toggleFlashlight()`, `handleInteract()`, `useSelectedItem()`, `dropSelectedItem()`, `playerDeath()` public
- Added `startPlaying()` method for touch-based chapter intro transition
- Added `restartChapter()` method for touch-based restart

### React Component (`/home/z/my-project/src/components/EchoGame.tsx`)
- Added `useIsTouchDevice()` hook for mobile detection
- Virtual joystick (left side) with outer ring and draggable inner thumb
- Touch-to-look area for horizontal swipe rotation
- Action buttons: ECO (pulse), 🔦 (flashlight), E (interact), 🤫 (sneak toggle), ▶ (use item), ✕ (drop item)
- Pause button in top-right corner
- "TOCAR PARA COMENZAR" / "TOCAR PARA REINTENTAR" / "TOCAR PARA CONTINUAR" touch buttons
- Prevented pointer lock on mobile
- Used `joystickPos` state for render (instead of ref) to satisfy lint

### PWA Support
- Created `/public/manifest.json` with game info, standalone display, landscape orientation
- Created `/public/sw.js` with cache-first for static assets, network-first for navigation
- Modified `/src/app/layout.tsx` with manifest link, apple-mobile-web-app meta tags, SW registration
- Created custom `/public/logo.svg` with pulse rings and neon E letter

### CSS (`/src/app/globals.css`)
- `.game-container` with no-select and touch-action:none
- `.game-touch-btn` styles with neon/cyan aesthetic, active states, glow effects
- Size variants: `-lg`, `-md`, `-sm` with proper min-height for accessibility
- `.game-touch-btn-active` for toggle state
- `.touch-joystick` pointer-events styling

## Lint Status
✅ ESLint passes with 0 errors
