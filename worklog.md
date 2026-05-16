---
Task ID: 1
Agent: Main Agent
Task: Add events (30) and challenges (35) system with weekly/monthly auto-rotation, navigation buttons, landing page sections, and version update

Work Log:
- Created `/home/z/my-project/src/game/eventsSystem.ts` with full events and challenges system
  - 30 events: 20 weekly + 10 monthly
  - 35 challenges: 25 weekly + 10 monthly
  - Auto-rotation system using seeded random based on week/month number
  - 8 categories: survival, combat, exploration, speed, stealth, multiplayer, hardcore, gore
  - 5 difficulty levels: easy, medium, hard, extreme, nightmare
  - Streak rewards for consecutive challenge completion
  - Lore text on special events
  - Helper functions: getActiveWeeklyEvents, getActiveMonthlyEvents, getActiveWeeklyChallenges, getActiveMonthlyChallenges, getNextWeeklyReset, getNextMonthlyReset, formatTimeUntil, getDifficultyLabel, getCategoryLabel
- Updated `/home/z/my-project/src/components/EchoGame.tsx`:
  - Added import for eventsSystem
  - Added navigation buttons for 🎯 EVENTOS and 🏆 DESAFÍOS (with animate-pulse)
  - Added full Events section (section-eventos) with weekly and monthly events
  - Added full Challenges section (section-desafios) with weekly and monthly challenges
  - Added v5.0 version entry to version history timeline
  - Added news entry for v5.0
  - Updated footer to v5.0
  - Updated Features section with 2 new entries (Events+Challenges, Gore)
  - Updated Controls Reference to mention events and challenges
- Ran `bun run lint` - passed with no errors
- Dev server compiling correctly

Stage Summary:
- 30 events (20 weekly + 10 monthly) with auto-rotation
- 35 challenges (25 weekly + 10 monthly) with auto-rotation and streak bonuses
- Navigation buttons with pulse animation for new sections
- Full landing page sections with countdown timers, category badges, difficulty badges
- Version v5.0 entry in timeline and news
- All lint checks passing
