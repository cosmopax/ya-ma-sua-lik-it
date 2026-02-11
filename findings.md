# Findings & Decisions

## Requirements
- User requested much more sophisticated gameplay.
- User requested research on comparable popular games first.
- User requested a creative and innovative resulting game design.
- User requested practical environment mapping: local path, GitHub, developers app, and subreddit.

## Research Findings
- Hades still shows extreme long-tail traction on Steam (138k+ reviews, 98% positive), indicating replay-first + progression-first roguelite loops can sustain years of engagement.
- Hades store framing highlights specific reusable retention pillars:
  - permanent meta upgrades between runs
  - high build diversity via boon combinations
  - narrative progress tied to repeated runs
  - challenge scaling for skilled players
- Balatro reached 5M copies sold by Jan 2025 (widely reported from official social announcement), validating compact-session roguelike card/progression loops for indie-scale games.
- Combined implication for this app: highest ROI is not one linear mode, but a layered loop with:
  - short high-intensity runs
  - persistent progression currency/perks
  - rotating constraints/modifiers to prevent stale play.
- Vampire Survivors has strong comparable signals:
  - very high Steam review volume (240k+ recent snapshot)
  - session-friendly “survive waves + evolve build” loop
  - continued content support can re-activate audience even years after launch.
- Reported sales scale (millions sold) and ongoing DLC updates support a design takeaway:
  - a simple core mechanic can scale if surrounded by combinatorial upgrades and recurring content.
- Slay the Spire remains a strong benchmark for strategic replay loops:
  - very high review volume with overwhelmingly positive sentiment
  - each run feels unique through card/relic pathing combinations
  - “easy to start, hard to master” structure supports both casual and expert audiences.
- Brotato adds a useful comparability pattern for short-session action roguelites:
  - wave-based bite-size runs
  - dense item/combo synergies
  - high challenge variance through characters + item choices.
- Cross-game synthesis for this app:
  - keep run length short (Reddit-friendly)
  - add high-variance modifiers and build choices
  - ensure persistent progression plus rotating weekly/daily constraints.
- Implemented design translation:
  - core loop: start run -> choose mutators/perks -> submit run result
  - meta loop: XP, levels, currency, streaks, perk unlock/equip
  - social loop: persistent leaderboard + challenge-specific leaderboards
  - content loop: deterministic daily + weekly challenge generation from date/week keys

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Drive sophistication through a layered gameplay model (run loop + meta progression + social systems) | Produces depth and replayability without requiring immediate changes to compiled GameMaker binary assets |
| Keep systems exposed through `window.DevvitBridge` and additional bridge calls | Lets GameMaker runtime consume progression/challenge data incrementally |
| Add `POST /api/run/start` + `POST /api/run/complete` with ticket validation | Supports a coherent run lifecycle and tamper-resistant reward calculations |
| Add `GET /api/meta` + `POST /api/meta/perk/equip` | Enables rich client UI and perk management outside GameMaker binary updates |
| Expand bridge with `devvit_get_meta`, `devvit_start_run`, `devvit_complete_run`, `devvit_toggle_perk` | Gives GameMaker direct access to new progression/challenge systems |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Planning skill template path in this environment differs from docs | Used `assets/templates` instead |

## Resources
- `src/server/routes/api.ts`
- `src/client/companion-panel.ts`
- `src/client/devvit-api.ts`
- `src/client/splash.ts`
- `src/client/index.html`
- `src/client/style.css`
- `test/companion-bridge.test.ts`
- `test/devvit-api.test.ts`
- Hades Steam page: https://store.steampowered.com/app/1145360/Hades/
- Balatro 5M coverage: https://www.nintendolife.com/news/2025/01/balatro-dev-urges-fans-to-buy-more-indie-games-as-title-hits-5-million-units-sold
- Vampire Survivors Steam page: https://store.steampowered.com/app/1794680/Vampire_Survivors/
- Vampire Survivors scale coverage: https://www.gamesradar.com/games/roguelike/vampire-survivors-has-sold-over-five-million-copies-in-its-three-years-and-yet-it-still-feels-like-its-just-getting-started/
- Slay the Spire Steam page: https://store.steampowered.com/app/646570/Slay_the_Spire/
- Brotato SteamDB (engagement indicator): https://steamdb.info/app/1942280/charts/

## Visual/Browser Findings
- Hades Steam metadata and description explicitly emphasize replayability and permanent power growth.
- Balatro coverage cites rapid sales growth likely amplified by word-of-mouth and lightweight session loop design.
- Vampire Survivors Steam page reflects very high player sentiment and a compact but highly replayable design promise.
- Slay the Spire and Brotato references reinforce that combinatorial build variance is a core retention driver across styles.
- Implemented UI now exposes meta profile metrics, quests, challenges, perks, run ticket status, and mutator selection.
