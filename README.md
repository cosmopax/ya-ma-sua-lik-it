# Rift Relay

**Dodge. Thread. Survive. One more run.**

A neon-soaked arena survival game that lives inside Reddit posts. Portals rip open at the screen edges, spewing projectiles. You dodge. You thread the needle for near-miss combos. You die. You tap "play again" before the score even finishes tallying. That's the loop.

Built for the Reddit Daily Games Hackathon 2026.

## Gameplay

Control a glowing ship with your cursor or finger. Rifts tear open at the arena edges and fire orbs, bolts, and waves at you. Survive as long as possible.

- **3 HP** to start (or 1 if you're brave enough for Glass Cannon)
- **Near-miss scoring** -- threading between projectiles awards combo points that escalate fast
- **Survival milestones** at 30s, 60s, 90s, 120s, 150s for bonus points
- **3 projectile types** that unlock as difficulty ramps: orbs (standard), bolts (fast & small), waves (slow & sinusoidal)
- **Procedural audio** -- every hit, dodge, and death has a synthesized sound. Zero audio files, all Web Audio API
- **Screen shake, slow-mo, particle explosions** -- the game *feels* every impact

Sessions run 30 seconds to 3 minutes. Perfect for "one more try" in a Reddit feed.

## Mutator System

Each run can apply mutators that twist the rules for higher score multipliers:

| Mutator | Effect |
|---------|--------|
| Glass Cannon | 1 HP instead of 3 |
| Sudden Death | 1 HP, no invincibility frames |
| Fog Protocol | Shrinking visibility radius around your ship |
| Turbo Swarm | Rift spawn rate doubled |
| Endless Echo | Slower difficulty ramp but higher ceiling |
| Micro HUD | Score and timer hidden |

## Meta Progression

- **XP & levels** from every run
- **Currency** for perk unlocks
- **Perks** -- equip up to 3 before a run (Arc Synth +12% XP, Volatile Matrix +6% per risky mutator, etc.)
- **Play streaks** -- bonus rewards starting at day 3
- **Daily & weekly challenges** -- same conditions for everyone, deterministic from date
- **Quests** -- Daily Cadence (3 runs), Daily Spike (10k), Weekly Grinder (15 runs), Weekly Peak (75k)
- **Anti-cheat** -- server-side run tickets with expiration and backend score resolution

## Tech Stack

| Layer | Tech |
|-------|------|
| Game | HTML5 Canvas 2D, pure TypeScript (no game engine library) |
| Audio | Web Audio API (procedural synthesis) |
| Frontend | Vanilla TypeScript, Vite |
| Backend | Devvit serverless, Hono, Redis |
| Platform | Reddit (Devvit Web SDK 0.12) |
| Tests | Vitest (49 tests) |

```bash
npm install
npm run dev          # watch mode
npm run build        # production build
npm run test         # vitest suite
npm run verify       # type-check + lint + test + build
npx devvit playtest  # playtest on dev subreddit
```

## Project Structure

```
src/
  client/
    game/
      engine.ts      # Game loop, state machine, bridge integration
      renderer.ts    # All Canvas2D drawing, HUD, overlays
      entities.ts    # Player, Projectile, Rift, Particle
      scoring.ts     # Time score, near-miss combos, milestones
      difficulty.ts  # Difficulty ramp curves
      mutators.ts    # Mutator ID -> gameplay modifier mapping
      audio.ts       # Procedural sound effects (Web Audio API)
      shake.ts       # Screen shake system
      input.ts       # Unified mouse/touch input
      config.ts      # All tunable constants
      math.ts        # Vector math utilities
    main.ts          # Bootstrap
    companion-panel.ts # Devvit bridge & debug panel
    devvit-api.ts    # API client
  server/            # Devvit backend (runs, leaderboards, progression)
  shared/            # Type contracts between client & server
```

## Philosophy

Every run reshuffles the rules. The players who climb aren't the ones with the fastest reflexes -- they're the ones who read the current conditions and adapt. Quick pattern recognition for the age of mind.

---

*The rift doesn't care about your last high score.*
