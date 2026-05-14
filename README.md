<div align="center">

# 🎮 Echoes of the Static

**A first-person audio horror game with echolocation mechanics**

*You are blind. Sound is your only guide... and your greatest danger.*

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

</div>

---

## 📖 About

**Echoes of the Static** is a first-person horror game built entirely in the browser where you navigate pitch-black environments using only sound. Emit echolocation pulses to reveal your surroundings — but beware: every sound you make can be heard by the entities lurking in the darkness.

Navigate through 6 chapters of escalating terror, from abandoned buildings to the mysterious Tower of Silence, where the static originates. Each step could be your last.

> *"The static isn't noise. It's a million trapped voices crying for help."*

---

## ✨ Features

### 🕹️ v1.0 — Base Game
- **Echolocation System** — Send out sound pulses to illuminate the world around you in neon outlines
- **Raycasting Engine** — Smooth pseudo-3D rendering inspired by classic FPS games
- **3 Entity Types** — Stalker, Hunter, and Phantom, each with unique AI behaviors
- **6-Chapter Campaign** — Procedurally generated levels with increasing difficulty
- **Neon Visual Style** — Walls, entities, and items revealed as glowing neon wireframes

### 🔦 v1.5 — Survival Expansion
- **Flashlight** — Battery-powered cone of light (drains and creates noise)
- **Inventory System** — Collect and use items (healing, distractions, flares, keys)
- **Doors & Locks** — Locked doors requiring keys or lockpicks
- **5 Difficulty Levels** — Easy, Medium, Hard, Extreme, Impossible
- **Speedrun Challenges** — Gold/Silver/Bronze tiers with unlockable characters
- **Autosave System** — Progress saved automatically between chapters

### 📡 v2.0 — Sonar & Lore
- **Silent Zones** — Areas where sound cannot propagate (no echolocation)
- **White Noise Zones** — Areas filled with static interference
- **Passive Sonar** — Quiet, short-range pulses that don't alert entities
- **Active Sonar** — Loud, long-range pulses that reveal more but attract enemies
- **Entity Lore System** — Discover the dark backstory of each entity type
- **Acoustic Properties** — Echo, Absorb, and Reflect zones affect illumination

### 🤝 v2.5 — Co-op Mode
- **Asymmetric Co-op** — Two players, two roles:
  - **The Ear** — Can see everything via infinite echolocation, places ping markers for The Body
  - **The Body** — Navigates blindly, relies on The Ear's pings to survive
- **Ping System** — The Ear places illuminated markers to guide The Body
- **Local Co-op** — Shared screen with split responsibilities

### 🏗️ v3.0 — Level Editor
- **Visual Level Editor** — Paint walls, doors, exits, and zones on a grid
- **Acoustic Properties** — Assign Echo, Absorb, or Reflect to any cell
- **Entity Spawning** — Place Stalkers, Hunters, and Phantoms precisely
- **Item Placement** — Add items and pickups to custom levels
- **Custom Acoustic Profiles** — Global echo, absorption, and reflection settings
- **Save & Load** — Store custom levels in local storage

### 💀 v3.5 — Hardcore Mode
- **Permadeath** — One death, game over. No second chances.
- **No HUD** — Health, stamina, and battery indicators removed
- **No Starting Flashlight** — Must find a flashlight in the darkness
- **Binaural Audio** — 3D spatial audio for immersive horror (headphones required)
- **Microphone Integration** — Your real-world sounds alert in-game entities
- **Static Interference** — Random audio disruptions that mask entity sounds

---

## 📸 Screenshots

> *Screenshots coming soon*

| Menu | Gameplay | Level Editor |
|------|----------|-------------|
| ![Menu](https://via.placeholder.com/400x225/0a0a0a/00e5ff?text=Main+Menu) | ![Gameplay](https://via.placeholder.com/400x225/0a0a0a/00e5ff?text=Echolocation+View) | ![Editor](https://via.placeholder.com/400x225/0a0a0a/00e5ff?text=Level+Editor) |

---

## 🚀 Installation

### Prerequisites
- [Node.js](https://nodejs.org/) 18+ or [Bun](https://bun.sh/)
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/user/echoes-of-the-static.git
cd echoes-of-the-static

# Install dependencies
npm install
# or with Bun
bun install

# Run the development server
npm run dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm run start
```

---

## 🎮 Controls

### Movement
| Key | Action |
|-----|--------|
| `W` / `A` / `S` / `D` | Move forward / left / backward / right |
| `Shift` | Sneak (reduces footstep noise) |
| Mouse | Look around (click to lock cursor) |

### Actions
| Key | Action |
|-----|--------|
| `Space` | Echolocation pulse (reveals surroundings) |
| `E` | Interact / Soft pulse |
| `F` | Toggle flashlight |
| `Q` | Use selected item |
| `G` | Drop selected item |

### Inventory
| Key | Action |
|-----|--------|
| `1` / `2` / `3` / `4` | Select inventory slot |

### System
| Key | Action |
|-----|--------|
| `R` | Toggle sonar mode (Passive / Active) |
| `T` | Place co-op ping (Ear role only) |
| `Escape` | Pause |

### Mobile
- **Virtual joystick** for movement
- **Touch buttons** for all actions
- **Swipe** to look around

---

## 🛠️ Technology Stack

| Technology | Purpose |
|-----------|---------|
| [Next.js 16](https://nextjs.org/) | React framework & SSR |
| [TypeScript 5](https://www.typescriptlang.org/) | Type-safe development |
| [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) | Raycasting & game rendering |
| [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | Spatial audio & sound effects |
| [Tailwind CSS 4](https://tailwindcss.com/) | UI styling |
| [shadcn/ui](https://ui.shadcn.com/) | UI component library |
| [Zustand](https://zustand.docs.pmnd.rs/) | State management |
| [Prisma](https://www.prisma.io/) | Database ORM |
| [Framer Motion](https://www.framer.com/motion/) | UI animations |

---

## 📁 Project Structure

```
echoes-of-the-static/
├── public/                 # Static assets
│   ├── manifest.json       # PWA manifest
│   ├── sw.js              # Service worker (offline support)
│   └── logo.svg           # Game logo
├── src/
│   ├── app/               # Next.js app router
│   │   ├── layout.tsx     # Root layout
│   │   ├── page.tsx       # Main page
│   │   ├── globals.css    # Global styles
│   │   └── api/           # API routes
│   ├── components/        # React components
│   │   ├── EchoGame.tsx   # Main game component
│   │   ├── LevelEditor.tsx # Level editor component
│   │   └── ui/            # shadcn/ui components
│   ├── game/              # Game engine (core)
│   │   ├── engine.ts      # Main game engine
│   │   ├── audio.ts       # Audio system (Web Audio API)
│   │   ├── level.ts       # Level generation & management
│   │   ├── items.ts       # Item definitions
│   │   ├── types.ts       # TypeScript type definitions
│   │   ├── saveSystem.ts  # Save/load system
│   │   └── levelEditor.ts # Level editor logic
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Utility functions
├── prisma/                # Database schema
├── package.json           # Dependencies & scripts
├── next.config.ts         # Next.js configuration
├── tailwind.config.ts     # Tailwind CSS configuration
└── tsconfig.json          # TypeScript configuration
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

**Quick summary:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.

---

## 👥 Credits

| Role | Name |
|------|------|
| 🎨 Game Design | Echoes of the Static Team |
| 💻 Development | Echoes of the Static Team |
| 🔊 Audio Design | Procedural (Web Audio API) |
| 🖼️ Visual Style | Neon wireframe aesthetic |

---

<div align="center">

**Made with 🖤 and static noise**

*If you can hear this, they can hear you.*

</div>
