# GameMaker Bridge (Devvit APIs)

This app exposes JavaScript bridge functions on `window` so your GameMaker code can save state, run challenge sessions, manage perks, submit scores, and read progression metadata through the Devvit backend.

## Available functions

All functions are available in the game iframe after startup.

- `window.devvit_submit_score(score, callbackMethod?)`
- `window.devvit_save_state(level?, note?, callbackMethod?)`
- `window.devvit_load_state(callbackMethod?)`
- `window.devvit_refresh_leaderboard(limit?, callbackMethod?)`
- `window.devvit_get_meta(callbackMethod?)`
- `window.devvit_start_run(mode?, callbackMethod?)`
- `window.devvit_complete_run(score, survivedSeconds?, callbackMethod?)`
- `window.devvit_toggle_perk(perkId, callbackMethod?)`

These wrappers call `window.DevvitBridge` internally and then optionally call back into GML through `doGMLCallback(...)` when `callbackMethod` is provided.

## Quick fire-and-forget examples

Use these when you do not need an immediate callback payload in GML.

```gml
// On run end / score event
external_call("devvit_submit_score", current_score);

// On checkpoint save
external_call("devvit_save_state", current_level, "Reached lava room");

// On continue button
external_call("devvit_load_state");

// On leaderboard screen open
external_call("devvit_refresh_leaderboard", 10);

// Start a daily challenge run
external_call("devvit_start_run", "daily");

// Complete active run using current score
external_call("devvit_complete_run", current_score, survived_seconds);

// Pull profile + quests + active challenges
external_call("devvit_get_meta");

// Equip/unequip a perk
external_call("devvit_toggle_perk", "arc_synth");
```

## Callback payload shape

When `callbackMethod` is passed, the JS bridge calls back with one object:

```json
{
  "ok": true,
  "action": "submit_score",
  "data": {},
  "at": 1739232000000
}
```

Error form:

```json
{
  "ok": false,
  "action": "save_state",
  "error": "Level must be a finite number",
  "at": 1739232000000
}
```

`action` values:

- `save_state`
- `load_state`
- `submit_score`
- `refresh_leaderboard`
- `get_meta`
- `start_run`
- `complete_run`
- `toggle_perk`

## Callback examples (GML)

Use your project's callback-pointer pattern for HTML5 JavaScript interop, then pass that pointer as `callbackMethod`.

```gml
function on_devvit_bridge(result) {
    if (result.ok) {
        show_debug_message("Devvit action success: " + string(result.action));
    } else {
        show_debug_message("Devvit action failed: " + string(result.error));
    }
}
```

```gml
// Pseudocode: replace with your project's callback pointer creation pattern
var cb = method(self, on_devvit_bridge);
external_call("devvit_submit_score", current_score, cb);
```

## Returned `data` by action

- `submit_score`: `{ result, leaderboard }`
- `save_state`: `{ username, level?, bestScore?, data?, updatedAt }`
- `load_state`: `null` or `{ username, level?, bestScore?, data?, updatedAt }`
- `refresh_leaderboard`: `{ top, me, totalPlayers, generatedAt }`
- `get_meta`: `{ profile, quests, activeChallenges, catalog, leaderboard, generatedAt }`
- `start_run`: `{ ticket, mode, offeredMutatorIds, defaultMutatorIds, challenge?, ... }`
- `complete_run`: `{ score, reward, profile, quests, leaderboard, runSummary, ... }`
- `toggle_perk`: `{ profile, equippedPerks }`

## Notes

- `score`, `level`, and `limit` accept numbers or numeric strings.
- If `callbackMethod` is omitted, calls are still executed.
- `devvit_save_state` requires at least one of `level` or a non-empty `note`.
- `devvit_start_run` modes: `normal`, `daily`, `weekly`.
