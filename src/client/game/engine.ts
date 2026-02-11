import { CONFIG } from './config';
import { DifficultyRamp } from './difficulty';
import { Player, Projectile, Rift, Particle, spawnParticles } from './entities';
import type { Edge } from './entities';
import { InputManager } from './input';
import { MutatorEngine, createDefaultModifiers } from './mutators';
import type { GameplayModifiers } from './mutators';
import { Renderer } from './renderer';
import type { GameState } from './renderer';
import { ScoreTracker } from './scoring';
import { ScreenShake } from './shake';
import { sfx, ensureAudioResumed } from './audio';
import type { InitResponse, RunCompleteResponse, RunStartResponse } from '../../shared/api';
import type { DevvitGameBridge } from '../companion-panel';
import { randomRange } from './math';

const EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

const edgePosition = (edge: Edge): number => {
  switch (edge) {
    case 'top':
    case 'bottom':
      return randomRange(40, CONFIG.GAME_WIDTH - 40);
    case 'left':
    case 'right':
      return randomRange(40, CONFIG.GAME_HEIGHT - 40);
  }
};

const getMutatorNames = (ids: string[]): string[] => {
  const nameMap: Record<string, string> = {
    glass_cannon: 'Glass Cannon',
    fog_protocol: 'Fog Protocol',
    turbo_swarm: 'Turbo Swarm',
    sudden_death: 'Sudden Death',
    endless_echo: 'Endless Echo',
    micro_hud: 'Micro HUD',
  };
  return ids.map((id) => nameMap[id] ?? id);
};

export class Game {
  private readonly input: InputManager;
  private readonly renderer: Renderer;
  private readonly difficulty = new DifficultyRamp();
  private readonly scoring = new ScoreTracker();
  private readonly shake = new ScreenShake();

  private state: GameState = 'ready';
  private lastTime = 0;
  private player: Player;
  private projectiles: Projectile[] = [];
  private rifts: Rift[] = [];
  private particles: Particle[] = [];
  private mutatorEngine = new MutatorEngine([]);
  private mods: GameplayModifiers = createDefaultModifiers();

  private riftSpawnTimer = 0;
  private countdownTimer = 0;
  private countdownStep = 0;
  private prevCountdownStep = -1;
  private deathTimer = 0;
  private resultsDelay = 0;

  private timeScale = 1;
  private timeScaleTimer = 0;

  private runData: RunStartResponse | null = null;
  private runResult: RunCompleteResponse | null = null;
  private bridge: DevvitGameBridge | null = null;
  private bestScore = 0;
  private metaLevel = 0;
  private submitting = false;

  constructor(canvas: HTMLCanvasElement, initData: InitResponse) {
    canvas.width = CONFIG.GAME_WIDTH;
    canvas.height = CONFIG.GAME_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    this.input = new InputManager(canvas);
    this.renderer = new Renderer(ctx);
    this.player = new Player(this.mods);

    if (initData.state?.bestScore) {
      this.bestScore = initData.state.bestScore;
    } else if (initData.leaderboard.me) {
      this.bestScore = initData.leaderboard.me.score;
    }
  }

  start(): void {
    this.bridge = window.DevvitBridge ?? null;
    this.state = 'ready';
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  private tick = (timestamp: number): void => {
    const rawDt = Math.min(
      (timestamp - this.lastTime) / 1000,
      CONFIG.MAX_DELTA_TIME
    );
    this.lastTime = timestamp;

    // Time scale
    if (this.timeScaleTimer > 0) {
      this.timeScaleTimer -= rawDt;
      if (this.timeScaleTimer <= 0) {
        this.timeScale = 1;
      }
    }
    const dt = rawDt * this.timeScale;

    this.shake.update(rawDt);
    this.update(dt);
    this.render();
    requestAnimationFrame(this.tick);
  };

  private setSlowMo(scale: number, duration: number): void {
    this.timeScale = scale;
    this.timeScaleTimer = duration;
  }

  private update(dt: number): void {
    switch (this.state) {
      case 'ready':
        this.updateReady();
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'dying':
        this.updateDying(dt);
        break;
      case 'dead':
        this.updateDead(dt);
        break;
      case 'results':
        this.updateResults();
        break;
    }
  }

  private render(): void {
    this.renderer.beginFrame(this.shake);
    this.renderer.drawBackground(0.016);

    switch (this.state) {
      case 'ready':
        this.renderer.drawReadyScreen(this.bestScore, this.metaLevel);
        break;
      case 'countdown':
        this.renderer.drawPlayer(this.player);
        this.renderer.drawCountdown(
          this.countdownStep,
          (this.countdownTimer % CONFIG.COUNTDOWN_STEP_DURATION) /
            CONFIG.COUNTDOWN_STEP_DURATION
        );
        break;
      case 'playing':
        this.renderGameplay();
        break;
      case 'dying':
        this.renderGameplay();
        this.renderer.drawDeathFlash(
          this.deathTimer / CONFIG.DEATH_ANIM_DURATION
        );
        break;
      case 'dead':
        this.renderGameplay();
        break;
      case 'results':
        this.renderGameplay();
        this.renderer.drawResults(
          this.scoring,
          this.runResult,
          getMutatorNames(this.mutatorEngine.activeIds)
        );
        break;
    }

    this.renderer.endFrame();
  }

  private renderGameplay(): void {
    this.renderer.drawRifts(this.rifts);
    this.renderer.drawProjectiles(this.projectiles);
    this.renderer.drawPlayer(this.player);
    this.renderer.drawFog(this.player, this.scoring.elapsed, this.mods);
    this.renderer.drawParticles(this.particles);
    this.renderer.drawHud(
      this.scoring,
      this.player,
      this.mods,
      getMutatorNames(this.mutatorEngine.activeIds)
    );
  }

  private updateReady(): void {
    if (this.input.consumeTap()) {
      ensureAudioResumed();
      void this.startRun();
    }
  }

  private async startRun(): Promise<void> {
    if (!this.bridge) {
      this.beginCountdown([]);
      return;
    }

    try {
      const run = await this.bridge.startRun('normal');
      this.runData = run;
      if (run.profile) {
        this.metaLevel = run.profile.level;
      }
      this.beginCountdown(run.defaultMutatorIds ?? []);
    } catch (error) {
      console.error('Failed to start run:', error);
      this.beginCountdown([]);
    }
  }

  private beginCountdown(mutatorIds: string[]): void {
    this.mutatorEngine = new MutatorEngine(mutatorIds);
    this.mods = this.mutatorEngine.mods;
    this.player = new Player(this.mods);
    this.projectiles = [];
    this.rifts = [];
    this.particles = [];
    this.scoring.reset();
    this.riftSpawnTimer = 1.5;
    this.countdownTimer = 0;
    this.countdownStep = 0;
    this.prevCountdownStep = -1;
    this.runResult = null;
    this.submitting = false;
    this.timeScale = 1;
    this.timeScaleTimer = 0;
    this.state = 'countdown';
  }

  private updateCountdown(dt: number): void {
    this.countdownTimer += dt;
    this.countdownStep = Math.floor(
      this.countdownTimer / CONFIG.COUNTDOWN_STEP_DURATION
    );
    this.player.update(dt, this.input.cursorX, this.input.cursorY);

    if (this.countdownStep !== this.prevCountdownStep) {
      this.prevCountdownStep = this.countdownStep;
      if (this.countdownStep < 3) {
        sfx.countdown();
      } else {
        sfx.countdownGo();
      }
    }

    if (this.countdownStep >= 3) {
      this.state = 'playing';
    }
  }

  private updatePlaying(dt: number): void {
    const prevMilestoneCount = this.scoring.milestonesHit;
    this.scoring.update(dt);
    this.player.update(dt, this.input.cursorX, this.input.cursorY);

    // Milestone celebration
    if (this.scoring.milestonesHit > prevMilestoneCount) {
      sfx.milestone();
      this.shake.add(CONFIG.SHAKE_MILESTONE);
    }

    const level = this.difficulty.getLevel(this.scoring.elapsed, this.mods);

    this.riftSpawnTimer -= dt;
    if (this.riftSpawnTimer <= 0 && this.rifts.length < this.difficulty.getActiveRiftCap(level)) {
      this.spawnRift(level);
      this.riftSpawnTimer = this.difficulty.getRiftSpawnInterval(level, this.mods);
    }

    for (const rift of this.rifts) {
      rift.update(dt);
      if (rift.shouldSpawn()) {
        const newProjectiles = rift.createProjectiles(this.player.x, this.player.y);
        this.projectiles.push(...newProjectiles);
        rift.resetSpawnTimer();
        sfx.projectileFire();

        this.addParticles(
          spawnParticles(
            rift.x,
            rift.y,
            CONFIG.RIFT_PARTICLE_COUNT,
            60,
            0.4,
            2,
            CONFIG.RIFT_COLOR
          )
        );
      }
    }
    this.rifts = this.rifts.filter((r) => r.alive);

    for (const p of this.projectiles) {
      p.update(dt);

      if (p.alive && p.overlapsPlayer(this.player)) {
        if (!this.player.isInvuln) {
          const died = this.player.hit(this.mods);
          sfx.hit();
          this.shake.add(CONFIG.SHAKE_HIT);

          this.addParticles(
            spawnParticles(
              this.player.x,
              this.player.y,
              CONFIG.HIT_PARTICLE_COUNT,
              120,
              0.5,
              3,
              CONFIG.HIT_FLASH_COLOR
            )
          );
          this.addParticles(
            spawnParticles(
              this.player.x,
              this.player.y,
              6,
              80,
              0.4,
              2,
              CONFIG.ORB_COLOR
            )
          );
          p.alive = false;
          if (died) {
            this.onPlayerDeath();
            return;
          }
          this.setSlowMo(CONFIG.HIT_SLOWMO_SCALE, CONFIG.HIT_SLOWMO_DURATION);
        }
      } else if (
        p.alive &&
        !p.nearMissed &&
        p.isNearPlayer(this.player) &&
        !p.overlapsPlayer(this.player)
      ) {
        p.nearMissed = true;
        const event = this.scoring.registerNearMiss(
          this.player.x,
          this.player.y
        );
        sfx.nearMiss(event.combo);
        this.shake.add(CONFIG.SHAKE_NEAR_MISS);

        this.addParticles(
          spawnParticles(
            event.x,
            event.y,
            CONFIG.NEAR_MISS_PARTICLE_COUNT,
            70,
            0.4,
            2.5,
            CONFIG.BOLT_COLOR
          )
        );
        this.addParticles(
          spawnParticles(
            event.x,
            event.y,
            4,
            40,
            0.3,
            1.5,
            CONFIG.ACCENT
          )
        );
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);

    for (const p of this.particles) {
      p.update(dt);
    }
    this.particles = this.particles.filter((p) => p.alive);
  }

  private spawnRift(level: number): void {
    const edge = EDGES[Math.floor(Math.random() * EDGES.length)]!;
    const position = edgePosition(edge);
    const type = this.difficulty.getProjectileType(level);
    const speed = this.difficulty.getProjectileSpeed(level);
    const lifetime = this.difficulty.getRiftLifetime(level);
    const burstCount = this.difficulty.getProjectilesPerBurst(level);
    const interval = Math.max(0.4, lifetime / 4);

    const rift = new Rift(
      edge,
      position,
      interval,
      lifetime,
      type,
      speed,
      burstCount
    );
    this.rifts.push(rift);
    sfx.riftSpawn();
  }

  private onPlayerDeath(): void {
    sfx.death();
    this.shake.add(CONFIG.SHAKE_DEATH);
    this.setSlowMo(CONFIG.DEATH_SLOWMO_SCALE, CONFIG.DEATH_SLOWMO_DURATION);

    this.addParticles(
      spawnParticles(
        this.player.x,
        this.player.y,
        CONFIG.DEATH_PARTICLE_COUNT,
        200,
        1.0,
        4,
        CONFIG.DEATH_COLOR
      )
    );
    this.addParticles(
      spawnParticles(
        this.player.x,
        this.player.y,
        Math.floor(CONFIG.DEATH_PARTICLE_COUNT * 0.6),
        140,
        0.8,
        3,
        CONFIG.ACCENT
      )
    );
    this.addParticles(
      spawnParticles(
        this.player.x,
        this.player.y,
        Math.floor(CONFIG.DEATH_PARTICLE_COUNT * 0.3),
        100,
        0.6,
        2,
        CONFIG.HIT_FLASH_COLOR
      )
    );
    this.deathTimer = 0;
    this.state = 'dying';
  }

  private updateDying(dt: number): void {
    this.deathTimer += dt;

    for (const p of this.particles) {
      p.update(dt);
    }
    this.particles = this.particles.filter((p) => p.alive);

    if (this.deathTimer >= CONFIG.DEATH_ANIM_DURATION) {
      this.state = 'dead';
      this.resultsDelay = CONFIG.RESULTS_DELAY;
      void this.submitRun();
    }
  }

  private updateDead(dt: number): void {
    this.resultsDelay -= dt;
    if (this.resultsDelay <= 0 && this.state === 'dead') {
      this.state = 'results';
    }
  }

  private async submitRun(): Promise<void> {
    if (this.submitting) return;
    this.submitting = true;

    if (!this.bridge || !this.runData) {
      this.runResult = null;
      return;
    }

    try {
      const result = await this.bridge.completeRun({
        ticket: this.runData.ticket,
        score: this.scoring.rawScore,
        survivedSeconds: Math.floor(this.scoring.elapsed),
        selectedMutatorIds: this.mutatorEngine.activeIds,
      });
      this.runResult = result;
      this.bestScore = Math.max(this.bestScore, result.bestScore);
      if (result.profile) {
        this.metaLevel = result.profile.level;
      }
    } catch (error) {
      console.error('Failed to submit run:', error);
      this.runResult = null;
    }
  }

  private updateResults(): void {
    if (this.input.consumeTap()) {
      this.state = 'ready';
    }
  }

  private addParticles(particles: Particle[]): void {
    this.particles.push(...particles);
    while (this.particles.length > CONFIG.MAX_PARTICLES) {
      this.particles.shift();
    }
  }
}
