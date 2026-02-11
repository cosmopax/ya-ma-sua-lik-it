# Task Plan: Sophisticated Gameplay Upgrade

## Goal
Design and implement a substantially deeper gameplay system for this Devvit GameMaker app, informed by research on comparable successful games, and ship the changes with passing verification.

## Current Phase
Phase 5

## Phases
### Phase 1: Research Comparable Games
- [x] Identify 5-8 relevant popular games with proven retention loops
- [x] Extract mechanics that fit Reddit + Devvit + GameMaker bridge constraints
- [x] Log findings in `findings.md`
- **Status:** complete

### Phase 2: Gameplay System Design
- [x] Define the core loop, meta loop, and social loop for this app
- [x] Define data model and server/client feature set
- [x] Record design decisions and tradeoffs
- **Status:** complete

### Phase 3: Backend Implementation
- [x] Implement new gameplay endpoints and persistence model in server routes
- [x] Add shared types for the new systems
- [x] Keep compatibility with existing score/state endpoints
- **Status:** complete

### Phase 4: Frontend + Bridge Implementation
- [x] Implement new gameplay UX in splash/companion UI
- [x] Extend GameMaker bridge functions for new systems
- [x] Ensure flows are understandable on mobile and desktop
- **Status:** complete

### Phase 5: Testing & Delivery
- [x] Add/extend automated tests for gameplay APIs and bridge behavior
- [x] Run `npm run verify` and resolve failures
- [ ] Deliver concise product naming + pitch + environment mapping
- **Status:** in_progress

## Key Questions
1. Which popular-game mechanics best transfer to a Reddit session-based context?
2. What sophisticated systems can be implemented now without direct GameMaker source edits?
3. How should progression, challenge variation, and social competition connect into one cohesive loop?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use planning files for this task | Task scope is large and multi-phase, requiring persistent execution memory |
| Build sophistication via app-level meta systems around the GameMaker runtime | Current repository contains compiled GameMaker artifacts, so immediate gameplay depth can be added through backend/client/bridge systems |
| Add run tickets + server-side reward resolution | Prevents naive client-side score spoofing and enables deterministic challenge reward logic |
| Keep legacy `/api/score` and `/api/state` intact | Preserves backward compatibility for existing game hooks while new systems roll out |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Skill template path mismatch (`templates/` absent) | 1 | Located templates in `assets/templates/` and copied from there |

## Notes
- Re-log findings after each web-research batch.
- Keep `npm run verify` green at the end of each major implementation phase.
