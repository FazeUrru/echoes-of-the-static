---
Task ID: 1
Agent: main
Task: Add flashlight to starting inventory, start with it ON, ambient light, speedrun challenge system

Work Log:
- Added flashlight to player's starting inventory in `initLevel()` for ALL chapters (not just chapter 1)
- Changed `flashlightOn: false` to `flashlightOn: true` so player starts with flashlight ON
- Added `updateAmbientLight()` method to engine that provides a faint constant glow (AMBIENT_LIGHT_RADIUS=3.5, AMBIENT_LIGHT_INTENSITY=0.07) around the player - not complete darkness
- Added ambient light call to the game update loop
- Added speedrun challenge system with SPEEDRUN_CHALLENGES constant defining 3 tiers (gold/silver/bronze) per chapter with time limits, points, and exclusive characters
- Each chapter has unique exclusive characters with names, icons, and descriptions (e.g., "El Primero" 👑 for ch1 gold, "Silenciador" 🔇 for ch6 gold)
- Updated `checkWinCondition()` to calculate completion time, check against speedrun targets, award points, and unlock characters
- Added tracking: totalPoints, unlockedCharacters, lastCompletionTimeSeconds, lastReward, bestChapterTimes
- Completely redesigned `renderWinScreen()` to show: completion time with milliseconds, speedrun challenge results with tier colors (gold/silver/bronze), unlocked characters with icons and descriptions, total points, and next chapter unlock
- Updated React component to show speedrun targets in chapter select screen and chapter intro screen
- Added "🏆 Complétalo rápido para desbloquear personajes exclusivos" hint on main menu
- Removed redundant flashlight item placement in level generator (player now always starts with it)
- Fixed CellType import error in level.ts
- Fixed unused variable `wasFaster` in win screen rendering

Stage Summary:
- Player now starts with flashlight ON and in inventory for all chapters
- Ambient light provides faint glow so it's never complete darkness
- Speedrun challenge system with 18 exclusive characters across 6 chapters (3 tiers each)
- Points range from 1000 (bronze) to 15000 (gold for final chapter)
- Win screen shows completion time, challenge results, unlocked characters, and total points
- Chapter select and intro screens show speedrun targets
