import { describe, expect, it } from 'vitest';
import { MutatorEngine, createDefaultModifiers } from '../src/client/game/mutators';
import { ScoreTracker } from '../src/client/game/scoring';
import { DifficultyRamp } from '../src/client/game/difficulty';
import { Player, Projectile, spawnParticles } from '../src/client/game/entities';
import { distance, lerp, clamp, circlesOverlap, normalize } from '../src/client/game/math';
import { CONFIG } from '../src/client/game/config';

describe('math utilities', () => {
  it('computes distance between points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('lerps between values', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('detects circle overlap', () => {
    expect(circlesOverlap(0, 0, 5, 8, 0, 5)).toBe(true);
    expect(circlesOverlap(0, 0, 5, 20, 0, 5)).toBe(false);
  });

  it('normalizes vectors', () => {
    const n = normalize({ x: 3, y: 4 });
    expect(Math.abs(n.x - 0.6)).toBeLessThan(0.001);
    expect(Math.abs(n.y - 0.8)).toBeLessThan(0.001);
  });

  it('returns zero vector when normalizing zero', () => {
    const n = normalize({ x: 0, y: 0 });
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
  });
});

describe('MutatorEngine', () => {
  it('returns default modifiers with no mutators', () => {
    const engine = new MutatorEngine([]);
    expect(engine.mods.playerMaxHp).toBe(CONFIG.PLAYER_DEFAULT_HP);
    expect(engine.mods.hasInvFrames).toBe(true);
    expect(engine.mods.fogEnabled).toBe(false);
    expect(engine.mods.showHud).toBe(true);
    expect(engine.mods.spawnRateMultiplier).toBe(1.0);
  });

  it('applies glass_cannon', () => {
    const engine = new MutatorEngine(['glass_cannon']);
    expect(engine.mods.playerMaxHp).toBe(1);
    expect(engine.mods.hasInvFrames).toBe(true);
  });

  it('applies sudden_death', () => {
    const engine = new MutatorEngine(['sudden_death']);
    expect(engine.mods.playerMaxHp).toBe(1);
    expect(engine.mods.hasInvFrames).toBe(false);
  });

  it('applies fog_protocol', () => {
    const engine = new MutatorEngine(['fog_protocol']);
    expect(engine.mods.fogEnabled).toBe(true);
  });

  it('applies turbo_swarm', () => {
    const engine = new MutatorEngine(['turbo_swarm']);
    expect(engine.mods.spawnRateMultiplier).toBe(2.0);
  });

  it('applies endless_echo', () => {
    const engine = new MutatorEngine(['endless_echo']);
    expect(engine.mods.difficultyRampSpeed).toBe(0.5);
    expect(engine.mods.difficultyRampCeiling).toBe(1.8);
  });

  it('applies micro_hud', () => {
    const engine = new MutatorEngine(['micro_hud']);
    expect(engine.mods.showHud).toBe(false);
  });

  it('stacks glass_cannon and sudden_death', () => {
    const engine = new MutatorEngine(['glass_cannon', 'sudden_death']);
    expect(engine.mods.playerMaxHp).toBe(1);
    expect(engine.mods.hasInvFrames).toBe(false);
  });

  it('stores active mutator ids', () => {
    const engine = new MutatorEngine(['fog_protocol', 'turbo_swarm']);
    expect(engine.activeIds).toEqual(['fog_protocol', 'turbo_swarm']);
  });
});

describe('ScoreTracker', () => {
  it('accumulates time score', () => {
    const tracker = new ScoreTracker();
    tracker.update(10);
    expect(tracker.timeScore).toBe(10 * CONFIG.TIME_SCORE_PER_SECOND);
  });

  it('awards milestones', () => {
    const tracker = new ScoreTracker();
    tracker.update(31);
    expect(tracker.milestoneTotal).toBe(CONFIG.MILESTONE_BONUSES[0]);
  });

  it('tracks near-miss combos', () => {
    const tracker = new ScoreTracker();
    tracker.update(1);

    const e1 = tracker.registerNearMiss(100, 100);
    expect(e1.combo).toBe(1);
    expect(e1.points).toBe(CONFIG.NEAR_MISS_BASE_POINTS);

    tracker.update(0.5);
    const e2 = tracker.registerNearMiss(100, 100);
    expect(e2.combo).toBe(2);
    expect(e2.points).toBe(Math.floor(CONFIG.NEAR_MISS_BASE_POINTS * 1.5));
  });

  it('resets combo after window expires', () => {
    const tracker = new ScoreTracker();
    tracker.update(1);
    tracker.registerNearMiss(100, 100);

    tracker.update(CONFIG.NEAR_MISS_COMBO_WINDOW + 0.1);
    const e2 = tracker.registerNearMiss(100, 100);
    expect(e2.combo).toBe(1);
  });

  it('computes raw score as sum of components', () => {
    const tracker = new ScoreTracker();
    tracker.update(31);
    tracker.registerNearMiss(100, 100);
    expect(tracker.rawScore).toBe(
      tracker.timeScore + tracker.nearMissTotal + tracker.milestoneTotal
    );
  });

  it('resets all state', () => {
    const tracker = new ScoreTracker();
    tracker.update(60);
    tracker.registerNearMiss(100, 100);
    tracker.reset();
    expect(tracker.rawScore).toBe(0);
    expect(tracker.elapsed).toBe(0);
    expect(tracker.nearMissCount).toBe(0);
  });
});

describe('DifficultyRamp', () => {
  it('starts at level 0', () => {
    const ramp = new DifficultyRamp();
    const mods = createDefaultModifiers();
    expect(ramp.getLevel(0, mods)).toBeCloseTo(0, 2);
  });

  it('increases over time', () => {
    const ramp = new DifficultyRamp();
    const mods = createDefaultModifiers();
    const early = ramp.getLevel(10, mods);
    const late = ramp.getLevel(120, mods);
    expect(late).toBeGreaterThan(early);
  });

  it('approaches ceiling', () => {
    const ramp = new DifficultyRamp();
    const mods = createDefaultModifiers();
    const veryLate = ramp.getLevel(600, mods);
    expect(veryLate).toBeGreaterThan(0.95);
    expect(veryLate).toBeLessThanOrEqual(1.0);
  });

  it('respects endless_echo ramp speed and ceiling', () => {
    const ramp = new DifficultyRamp();
    const normal = createDefaultModifiers();
    const echo = new MutatorEngine(['endless_echo']).mods;

    // At early times, echo ramps slower than normal
    const normalAt20 = ramp.getLevel(20, normal);
    const echoAt20 = ramp.getLevel(20, echo);
    expect(echoAt20).toBeLessThan(normalAt20);

    // At late times, echo exceeds normal ceiling (1.0) due to 1.8x ceiling
    const echoLate = ramp.getLevel(600, echo);
    expect(echoLate).toBeGreaterThan(1.0);
  });

  it('returns valid projectile speed range', () => {
    const ramp = new DifficultyRamp();
    expect(ramp.getProjectileSpeed(0)).toBe(CONFIG.BASE_PROJECTILE_SPEED);
    expect(ramp.getProjectileSpeed(1)).toBe(CONFIG.MAX_PROJECTILE_SPEED);
  });
});

describe('Player', () => {
  it('initializes with correct hp from modifiers', () => {
    const mods = createDefaultModifiers();
    const player = new Player(mods);
    expect(player.hp).toBe(CONFIG.PLAYER_DEFAULT_HP);
    expect(player.alive).toBe(true);
  });

  it('initializes with 1 hp for glass_cannon', () => {
    const mods = new MutatorEngine(['glass_cannon']).mods;
    const player = new Player(mods);
    expect(player.hp).toBe(1);
  });

  it('dies when hp reaches 0', () => {
    const mods = new MutatorEngine(['glass_cannon']).mods;
    const player = new Player(mods);
    const died = player.hit(mods);
    expect(died).toBe(true);
    expect(player.alive).toBe(false);
  });

  it('grants invulnerability after hit when invFrames enabled', () => {
    const mods = createDefaultModifiers();
    const player = new Player(mods);
    player.hit(mods);
    expect(player.isInvuln).toBe(true);
    expect(player.hp).toBe(CONFIG.PLAYER_DEFAULT_HP - 1);
  });

  it('does not grant invulnerability with sudden_death', () => {
    const mods = new MutatorEngine(['sudden_death']).mods;
    const player = new Player(mods);
    const died = player.hit(mods);
    expect(died).toBe(true);
  });

  it('does not take damage during invulnerability', () => {
    const mods = createDefaultModifiers();
    const player = new Player(mods);
    player.hit(mods);
    const secondHit = player.hit(mods);
    expect(secondHit).toBe(false);
    expect(player.hp).toBe(CONFIG.PLAYER_DEFAULT_HP - 1);
  });
});

describe('Projectile', () => {
  it('moves in the correct direction', () => {
    const p = new Projectile(0, 0, 100, 0, 'orb');
    p.update(1);
    expect(p.x).toBeCloseTo(100, 0);
    expect(p.y).toBeCloseTo(0, 0);
  });

  it('dies when leaving the canvas', () => {
    const p = new Projectile(CONFIG.GAME_WIDTH + 50, 100, 100, 0, 'orb');
    p.update(0.016);
    expect(p.alive).toBe(false);
  });

  it('detects overlap with player', () => {
    const mods = createDefaultModifiers();
    const player = new Player(mods);
    player.x = 100;
    player.y = 100;
    const p = new Projectile(100, 100, 0, 0, 'orb');
    expect(p.overlapsPlayer(player)).toBe(true);
  });

  it('detects near miss', () => {
    const mods = createDefaultModifiers();
    const player = new Player(mods);
    player.x = 100;
    player.y = 100;
    const p = new Projectile(100 + CONFIG.NEAR_MISS_THRESHOLD - 1, 100, 0, 0, 'orb');
    expect(p.isNearPlayer(player)).toBe(true);
    expect(p.overlapsPlayer(player)).toBe(false);
  });
});

describe('Particle spawning', () => {
  it('creates the requested number of particles', () => {
    const particles = spawnParticles(100, 100, 10, 50, 0.5, 2, '#fff');
    expect(particles).toHaveLength(10);
  });

  it('particles start alive', () => {
    const particles = spawnParticles(100, 100, 5, 50, 0.5, 2, '#fff');
    for (const p of particles) {
      expect(p.alive).toBe(true);
    }
  });

  it('particles die after their lifetime', () => {
    const particles = spawnParticles(100, 100, 5, 50, 0.5, 2, '#fff');
    for (const p of particles) {
      p.update(0.6);
    }
    for (const p of particles) {
      expect(p.alive).toBe(false);
    }
  });
});
