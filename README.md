# ⚡ RIFTBREAKERS

An arcade-style 2D fighting game featuring **Vex**, an adaptive, pattern-reading AI opponent that learns your combat habits mid-match and dynamically counters your playstyle. 

Built with pure vanilla HTML5 Canvas, modern Web Audio, Three.js visuals, and Node.js WebSockets.

---

## 🎮 Game Modes

- **VS VEX (AI Mode)**: Fight against an adaptive AI opponent that learns whether you prefer punches, kicks, turtle-blocking, or whiffing, adjusting move weights and reflex parries in real time.
- **LOCAL 1v1 (2-Player)**: Battle friends head-to-head on the same keyboard with full customizable color palettes and controller configurations.
- **Difficulty Selection**:
  - 🟢 **Easy**: Sluggish AI reactions, slower tick rate, reduced aggression.
  - 🟡 **Medium**: Balanced adaptive reactions with pattern-reading mid-match.
  - 🔴 **Hard**: Relentless AI aggression with rapid reflexes and ruthless whiff-punishing.

---

## 🕹️ Controls

| Action | WASD Scheme | ARROWS Scheme |
| :--- | :--- | :--- |
| **Move Left / Right** | `A` / `D` | `Left Arrow` / `Right Arrow` |
| **Jump** | `W` | `Up Arrow` |
| **Block** | `S` (hold) | `Down Arrow` (hold) |
| **Dodge** | `Space` | `Numpad 0` / `Right Shift` |
| **Punch** | `C` | `J` / `Numpad 1` |
| **Kick** | `Z` | `K` / `Numpad 2` |
| **Special** | `X` | `L` / `Numpad 3` |
| **Grab** *(beats block)* | `V` | `I` / `Numpad 4` |
| **⚡ SUPER MOVE** | `T` *(when charged)* | `Y` / `Numpad 5` *(when charged)* |
| **⛶ Toggle Fullscreen** | `F` *(universal key)* | `F` *(universal key)* |

> [!TIP]
> **Display & Fullscreen**:
> - Press **`F`** anytime to enter or exit borderless Fullscreen mode.
> - Use the floating screen widget at the bottom right to toggle between **FILL SCREEN** (edge-to-edge coverage) and **FIT (16:9)** aspect ratio.
> **Super Moves**: Landing combo hits charges your super meter.
> - **Blue Fighter**: Kamehameha Energy Beam blast.
> - **Red Fighter**: Cosmic Asteroid Rain barrage.

---

## 🚀 Quick Start

### 1. Installation
```bash
npm install
```

### 2. Start Game Server
```bash
npm start
```

### 3. Open in Browser
Visit **[http://localhost:3000](http://localhost:3000)**

---

## 🧠 How the Adaptive AI (Vex) Works

`server/aiEngine.js` uses a **heuristic pattern-reader** that reacts to your tendencies within a single match:

1. **Habit Tracking**: Tracks your attack distribution (punches, kicks, grabs, specials), block frequency, dodge timing, and whiff-punish success rate.
2. **Dynamic Weighting**: Adjusts counter-action probabilities:
   - High block rate → mixes in unblockable grabs and specials.
   - Kick or punch spamming → increases dodge and directional parry weights.
   - Aggressive rushing → plays patient and waits for punishable whiffs.
3. **Reflex Layer**: `game.js` includes a reflex system where Vex can predict and parry incoming telegraphed moves based on confidence ratings.
4. **Persistent Memory**: Profiles are saved locally to `server/data/profiles.json` by player session ID so Vex remembers your playstyle between rounds. Use **"forget me"** on the menu to reset AI memory.

---

## 📁 Codebase Architecture

```
mk-game/
├── public/                     # Frontend client assets
│   ├── css/
│   │   └── style.css           # Cyberpunk/arcade neon dark theme styling
│   ├── js/
│   │   ├── audio.js            # Synthesizer audio engine (hits, impacts, banter)
│   │   ├── effects.js          # Particle effects, screen shake, slow-mo, supers
│   │   ├── fighter.js          # Fighter physics, hurtboxes, hitboxes & animations
│   │   ├── game.js             # Main game loop, input controller, HUD & flow
│   │   ├── network.js          # Client WebSocket communicator
│   │   └── renderer3d.js       # Three.js 3D arena scene & dynamic lighting
│   └── index.html              # Game canvas, HUD overlays & UI screens
│
├── server/                     # Backend Node.js server
│   ├── aiEngine.js             # Adaptive AI decision-making heuristic engine
│   ├── server.js               # Express static server & WebSocket endpoint
│   └── data/
│       └── profiles.json       # Persistent AI memory per player
│
├── package.json
└── README.md
```

---

## 📜 License

ISC License. Built for fighting game enthusiasts and AI experimentation.
