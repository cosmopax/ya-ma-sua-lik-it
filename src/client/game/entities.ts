import { CONFIG } from './config';
import type { ProjectileType } from './difficulty';
import {
  circlesOverlap,
  randomAngle,
  randomRange,
  angleBetween,
} from './math';
import type { GameplayModifiers } from './mutators';

export type Edge = 'top' | 'bottom' | 'left' | 'right';
export type AimMode = 'direct' | 'spread' | 'random';

export type TrailPoint = { x: number; y: number; alpha: number };

export class Player {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  readonly radius = CONFIG.PLAYER_RADIUS;
  hp: number;
  maxHp: number;
  invulnTimer = 0;
  alive = true;
  trail: TrailPoint[] = [];
  angle = 0;

  constructor(mods: GameplayModifiers) {
    this.x = CONFIG.GAME_WIDTH / 2;
    this.y = CONFIG.GAME_HEIGHT * 0.7;
    this.targetX = this.x;
    this.targetY = this.y;
    this.hp = mods.playerMaxHp;
    this.maxHp = mods.playerMaxHp;
  }

  update(dt: number, cursorX: number, cursorY: number): void {
    this.targetX = cursorX;
    this.targetY = cursorY;

    const factor = 1 - Math.exp(-CONFIG.PLAYER_FOLLOW_SPEED * dt);
    const prevX = this.x;
    const prevY = this.y;
    this.x += (this.targetX - this.x) * factor;
    this.y += (this.targetY - this.y) * factor;

    const dx = this.x - prevX;
    const dy = this.y - prevY;
    if (dx * dx + dy * dy > 0.1) {
      this.angle = Math.atan2(dy, dx);
    }

    this.trail.unshift({ x: this.x, y: this.y, alpha: 1 });
    while (this.trail.length > CONFIG.PLAYER_TRAIL_LENGTH) {
      this.trail.pop();
    }
    for (let i = 0; i < this.trail.length; i++) {
      this.trail[i]!.alpha = 1 - i / this.trail.length;
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
    }
  }

  hit(mods: GameplayModifiers): boolean {
    if (this.invulnTimer > 0) return false;
    this.hp -= 1;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    if (mods.hasInvFrames) {
      this.invulnTimer = mods.invFrameDuration;
    }
    return false;
  }

  get isInvuln(): boolean {
    return this.invulnTimer > 0;
  }
}

export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: ProjectileType;
  age = 0;
  alive = true;
  nearMissed = false;
  baseVx: number;
  baseVy: number;
  spawnX: number;

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    type: ProjectileType
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.baseVx = vx;
    this.baseVy = vy;
    this.spawnX = x;
    this.type = type;

    if (type === 'orb') this.radius = CONFIG.ORB_RADIUS;
    else if (type === 'bolt') this.radius = CONFIG.BOLT_RADIUS;
    else this.radius = CONFIG.WAVE_RADIUS;
  }

  update(dt: number): void {
    this.age += dt;

    if (this.type === 'wave') {
      const perpX = -this.baseVy;
      const perpY = this.baseVx;
      const len = Math.sqrt(perpX * perpX + perpY * perpY);
      if (len > 0) {
        const wave =
          Math.sin(this.age * CONFIG.WAVE_FREQUENCY * Math.PI * 2) *
          CONFIG.WAVE_AMPLITUDE;
        const nx = perpX / len;
        const ny = perpY / len;
        this.x += (this.baseVx + nx * wave * dt * 10) * dt;
        this.y += (this.baseVy + ny * wave * dt * 10) * dt;
      } else {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      }
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    const margin = CONFIG.PROJECTILE_MARGIN;
    if (
      this.x < -margin ||
      this.x > CONFIG.GAME_WIDTH + margin ||
      this.y < -margin ||
      this.y > CONFIG.GAME_HEIGHT + margin
    ) {
      this.alive = false;
    }
  }

  overlapsPlayer(player: Player): boolean {
    return circlesOverlap(
      this.x,
      this.y,
      this.radius,
      player.x,
      player.y,
      player.radius
    );
  }

  isNearPlayer(player: Player): boolean {
    return circlesOverlap(
      this.x,
      this.y,
      0,
      player.x,
      player.y,
      CONFIG.NEAR_MISS_THRESHOLD
    );
  }

  get color(): string {
    if (this.type === 'orb') return CONFIG.ORB_COLOR;
    if (this.type === 'bolt') return CONFIG.BOLT_COLOR;
    return CONFIG.WAVE_COLOR;
  }
}

export class Rift {
  x: number;
  y: number;
  edge: Edge;
  spawnTimer: number;
  spawnInterval: number;
  lifetime: number;
  age = 0;
  pulsePhase = 0;
  projectileType: ProjectileType;
  aimMode: AimMode;
  alive = true;
  projectileSpeed: number;
  burstCount: number;

  constructor(
    edge: Edge,
    position: number,
    interval: number,
    lifetime: number,
    type: ProjectileType,
    speed: number,
    burstCount: number
  ) {
    this.edge = edge;
    this.spawnInterval = interval;
    this.spawnTimer = 0.5;
    this.lifetime = lifetime;
    this.projectileType = type;
    this.projectileSpeed = speed;
    this.burstCount = burstCount;

    switch (edge) {
      case 'top':
        this.x = position;
        this.y = 0;
        break;
      case 'bottom':
        this.x = position;
        this.y = CONFIG.GAME_HEIGHT;
        break;
      case 'left':
        this.x = 0;
        this.y = position;
        break;
      case 'right':
        this.x = CONFIG.GAME_WIDTH;
        this.y = position;
        break;
    }

    const roll = Math.random();
    if (roll < 0.5) this.aimMode = 'direct';
    else if (roll < 0.8) this.aimMode = 'spread';
    else this.aimMode = 'random';
  }

  update(dt: number): void {
    this.age += dt;
    this.pulsePhase += dt * 4;
    this.spawnTimer -= dt;

    if (this.age >= this.lifetime) {
      this.alive = false;
    }
  }

  get openness(): number {
    if (this.age < CONFIG.RIFT_OPEN_DURATION) {
      return this.age / CONFIG.RIFT_OPEN_DURATION;
    }
    const closeStart = this.lifetime - CONFIG.RIFT_OPEN_DURATION;
    if (this.age > closeStart) {
      return Math.max(0, (this.lifetime - this.age) / CONFIG.RIFT_OPEN_DURATION);
    }
    return 1;
  }

  shouldSpawn(): boolean {
    return this.spawnTimer <= 0 && this.openness >= 1;
  }

  resetSpawnTimer(): void {
    this.spawnTimer = this.spawnInterval;
  }

  createProjectiles(playerX: number, playerY: number): Projectile[] {
    const projectiles: Projectile[] = [];
    const baseAngle = angleBetween(
      { x: this.x, y: this.y },
      { x: playerX, y: playerY }
    );

    let speed = this.projectileSpeed;
    if (this.projectileType === 'bolt') speed *= CONFIG.BOLT_SPEED_MULT;
    else if (this.projectileType === 'wave') speed *= CONFIG.WAVE_SPEED_MULT;

    const fireProjectile = (angle: number): void => {
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      projectiles.push(
        new Projectile(this.x, this.y, vx, vy, this.projectileType)
      );
    };

    for (let b = 0; b < this.burstCount; b++) {
      switch (this.aimMode) {
        case 'direct':
          fireProjectile(baseAngle + (b - (this.burstCount - 1) / 2) * 0.15);
          break;
        case 'spread':
          fireProjectile(
            baseAngle + (b - (this.burstCount - 1) / 2) * 0.35
          );
          break;
        case 'random': {
          const inward = this.getInwardAngle();
          fireProjectile(inward + randomRange(-0.5, 0.5));
          break;
        }
      }
    }

    return projectiles;
  }

  private getInwardAngle(): number {
    switch (this.edge) {
      case 'top':
        return Math.PI / 2 + randomRange(-0.3, 0.3);
      case 'bottom':
        return -Math.PI / 2 + randomRange(-0.3, 0.3);
      case 'left':
        return 0 + randomRange(-0.3, 0.3);
      case 'right':
        return Math.PI + randomRange(-0.3, 0.3);
    }
  }
}

export class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  alive = true;

  constructor(
    x: number,
    y: number,
    speed: number,
    life: number,
    radius: number,
    color: string
  ) {
    this.x = x;
    this.y = y;
    const angle = randomAngle();
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = life;
    this.maxLife = life;
    this.radius = radius;
    this.color = color;
  }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.97;
    this.vy *= 0.97;
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
    }
  }

  get alpha(): number {
    return Math.max(0, this.life / this.maxLife);
  }
}

export const spawnParticles = (
  x: number,
  y: number,
  count: number,
  speed: number,
  life: number,
  radius: number,
  color: string
): Particle[] => {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push(
      new Particle(x, y, randomRange(speed * 0.3, speed), life, radius, color)
    );
  }
  return particles;
};
