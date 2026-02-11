import { CONFIG } from './config';

export type NearMissEvent = {
  x: number;
  y: number;
  points: number;
  combo: number;
  time: number;
};

export class ScoreTracker {
  elapsed = 0;
  timeScore = 0;
  nearMissTotal = 0;
  milestoneTotal = 0;
  nearMissCount = 0;
  combo = 0;
  lastNearMissTime = -Infinity;
  milestonesClaimed = new Set<number>();
  recentNearMiss: NearMissEvent | null = null;
  recentNearMissAge = 0;

  get rawScore(): number {
    return this.timeScore + this.nearMissTotal + this.milestoneTotal;
  }

  get milestonesHit(): number {
    return this.milestonesClaimed.size;
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.timeScore = Math.floor(this.elapsed * CONFIG.TIME_SCORE_PER_SECOND);

    for (let i = 0; i < CONFIG.SURVIVAL_MILESTONES.length; i++) {
      const milestone = CONFIG.SURVIVAL_MILESTONES[i]!;
      if (this.elapsed >= milestone && !this.milestonesClaimed.has(milestone)) {
        this.milestonesClaimed.add(milestone);
        this.milestoneTotal += CONFIG.MILESTONE_BONUSES[i]!;
      }
    }

    if (this.recentNearMiss) {
      this.recentNearMissAge += dt;
      if (this.recentNearMissAge > 1.2) {
        this.recentNearMiss = null;
      }
    }
  }

  registerNearMiss(x: number, y: number): NearMissEvent {
    const now = this.elapsed;
    if (now - this.lastNearMissTime < CONFIG.NEAR_MISS_COMBO_WINDOW) {
      this.combo = Math.min(this.combo + 1, CONFIG.NEAR_MISS_MAX_COMBO);
    } else {
      this.combo = 1;
    }
    this.lastNearMissTime = now;

    const multiplier = 1 + (this.combo - 1) * 0.5;
    const points = Math.floor(CONFIG.NEAR_MISS_BASE_POINTS * multiplier);
    this.nearMissTotal += points;
    this.nearMissCount += 1;

    const event: NearMissEvent = { x, y, points, combo: this.combo, time: now };
    this.recentNearMiss = event;
    this.recentNearMissAge = 0;
    return event;
  }

  reset(): void {
    this.elapsed = 0;
    this.timeScore = 0;
    this.nearMissTotal = 0;
    this.milestoneTotal = 0;
    this.nearMissCount = 0;
    this.combo = 0;
    this.lastNearMissTime = -Infinity;
    this.milestonesClaimed.clear();
    this.recentNearMiss = null;
    this.recentNearMissAge = 0;
  }
}
