import { CONFIG } from './config';

export type GameplayModifiers = {
  playerMaxHp: number;
  hasInvFrames: boolean;
  invFrameDuration: number;
  spawnRateMultiplier: number;
  fogEnabled: boolean;
  fogShrinkRate: number;
  fogMinRadius: number;
  fogInitialRadius: number;
  showHud: boolean;
  difficultyRampSpeed: number;
  difficultyRampCeiling: number;
};

const DEFAULT_MODIFIERS: GameplayModifiers = {
  playerMaxHp: CONFIG.PLAYER_DEFAULT_HP,
  hasInvFrames: true,
  invFrameDuration: CONFIG.INVULN_DURATION,
  spawnRateMultiplier: 1.0,
  fogEnabled: false,
  fogShrinkRate: CONFIG.FOG_SHRINK_RATE,
  fogMinRadius: CONFIG.FOG_MIN_RADIUS,
  fogInitialRadius: CONFIG.FOG_INITIAL_RADIUS,
  showHud: true,
  difficultyRampSpeed: 1.0,
  difficultyRampCeiling: 1.0,
};

export class MutatorEngine {
  readonly activeIds: string[];
  readonly mods: GameplayModifiers;

  constructor(mutatorIds: string[]) {
    this.activeIds = [...mutatorIds];
    this.mods = { ...DEFAULT_MODIFIERS };

    for (const id of mutatorIds) {
      switch (id) {
        case 'glass_cannon':
          this.mods.playerMaxHp = 1;
          break;
        case 'fog_protocol':
          this.mods.fogEnabled = true;
          break;
        case 'turbo_swarm':
          this.mods.spawnRateMultiplier = 2.0;
          break;
        case 'sudden_death':
          this.mods.playerMaxHp = 1;
          this.mods.hasInvFrames = false;
          break;
        case 'endless_echo':
          this.mods.difficultyRampSpeed = 0.5;
          this.mods.difficultyRampCeiling = 1.8;
          break;
        case 'micro_hud':
          this.mods.showHud = false;
          break;
      }
    }
  }
}

export const createDefaultModifiers = (): GameplayModifiers => ({
  ...DEFAULT_MODIFIERS,
});
