# Contributing to Echoes of the Static

First off, thank you for considering contributing! 🖤

Every contribution helps make the darkness a little more terrifying.

---

## 🍴 Fork & Clone

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/echoes-of-the-static.git
   cd echoes-of-the-static
   ```
3. **Add the upstream** remote:
   ```bash
   git remote add upstream https://github.com/user/echoes-of-the-static.git
   ```

---

## 💻 Development Setup

```bash
# Install dependencies
npm install
# or
bun install

# Start the development server
npm run dev

# Run linting
npm run lint

# Build for production
npm run build
```

The game runs at [http://localhost:3000](http://localhost:3000).

---

## 🎨 Code Style

### TypeScript
- Use **strict TypeScript** — no `any` types unless absolutely necessary
- Prefer `interface` over `type` for object shapes
- Use descriptive variable and function names
- Add JSDoc comments for public APIs and game engine methods

### Styling
- Use **Tailwind CSS** for all component styling
- Follow the **shadcn/ui** patterns for UI components
- Keep game rendering in the Canvas API (not DOM)
- Use the neon color palette defined in `src/game/types.ts`

### Game Engine
- All game logic lives in `src/game/`
- Keep the engine framework-agnostic (no React imports in game files)
- The React layer (`src/components/EchoGame.tsx`) bridges the engine to the UI
- Respect the existing architecture: engine → canvas rendering, React → UI overlay

### Commits
- Use clear, descriptive commit messages
- Prefix with emoji for clarity:
  - `🎮` Game logic
  - `🎨` UI/styling
  - `🔊` Audio
  - `🐛` Bug fix
  - `📝` Documentation
  - `♻️` Refactor

---

## 🔀 Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and commit them with clear messages

3. **Test your changes**:
   - Run `npm run lint` to check for errors
   - Verify the game starts with `npm run dev`
   - Test all affected game states (menu, playing, paused, etc.)

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request** on GitHub:
   - Describe what your PR does
   - Reference any related issues
   - Include screenshots for visual changes
   - Ensure the PR is ready for review

6. **Address review feedback** and make requested changes

7. **Squash commits** if requested before merging

---

## 🐛 Bug Reporting

Found a bug? Please [open an issue](https://github.com/user/echoes-of-the-static/issues) with:

- **Description** — What happened vs. what you expected
- **Steps to reproduce** — How to trigger the bug
- **Environment** — Browser, OS, device (desktop/mobile)
- **Game state** — What chapter, difficulty, and mode you were playing
- **Screenshots/Console logs** — If applicable

### Known Issues
- Audio may not initialize until user interaction (browser autoplay policy)
- Pointer lock requires a click on the game canvas
- Mobile performance may vary depending on device

---

## 🌟 Feature Requests

Have an idea? Open an issue with the `enhancement` label and describe:
- The feature and why it would improve the game
- How it fits into the existing game mechanics
- Any potential implementation ideas

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).

---

<div align="center">

*Every echo starts with a single sound.*

</div>
