import { CONFIG } from './config';
import { lerp } from './math';
import type { GameplayModifiers } from './mutators';

export type ProjectileType = 'orb' | 'bolt' | 'wave';

export class DifficultyRamp {
  getLevel(elapsed: number, mods: GameplayModifiers): number {
    const speed = mods.difficultyRampSpeed;
    const ceiling = mods.difficultyRampCeiling;
    const raw = 1 - Math.exp((-elapsed * speed) / CONFIG.DIFFICULTY_TIME_CONSTANT);
    return raw * ceiling;
  }

  getRiftSpawnInterval(level: number, mods: GameplayModifiers): number {
    const base = lerp(
      CONFIG.BASE_RIFT_SPAWN_INTERVAL,
      CONFIG.MIN_RIFT_SPAWN_INTERVAL,
      Math.min(level, 1)
    );
    return base / mods.spawnRateMultiplier;
  }

  getProjectileSpeed(level: number): number {
    return lerp(
      CONFIG.BASE_PROJECTILE_SPEED,
      CONFIG.MAX_PROJECTILE_SPEED,
      Math.min(level, 1)
    );
  }

  getActiveRiftCap(level: number): number {
    return Math.floor(
      lerp(CONFIG.BASE_ACTIVE_RIFT_CAP, CONFIG.MAX_ACTIVE_RIFT_CAP, Math.min(level, 1))
    );
  }

  getRiftLifetime(level: number): number {
    return lerp(
      CONFIG.BASE_RIFT_LIFETIME,
      CONFIG.MIN_RIFT_LIFETIME,
      Math.min(level, 1)
    );
  }

  getProjectileType(level: number): ProjectileType {
    if (level < 0.25) return 'orb';
    const roll = Math.random();
    if (level < 0.5) return roll < 0.15 ? 'bolt' : 'orb';
    if (level < 0.75) {
      if (roll < 0.2) return 'wave';
      if (roll < 0.4) return 'bolt';
      return 'orb';
    }
    if (roll < 0.25) return 'wave';
    if (roll < 0.5) return 'bolt';
    return 'orb';
  }

  getProjectilesPerBurst(level: number): number {
    if (level < 0.3) return 1;
    if (level < 0.6) return Math.random() < 0.3 ? 2 : 1;
    if (level < 0.9) return Math.random() < 0.5 ? 2 : 1;
    return Math.random() < 0.3 ? 3 : 2;
  }
}
