import { CONFIG } from './config';
import type { Player, Projectile, Rift, Particle } from './entities';
import type { GameplayModifiers } from './mutators';
import type { ScoreTracker } from './scoring';
import type { ScreenShake } from './shake';
import type { RunCompleteResponse } from '../../shared/api';

export type GameState =
  | 'loading'
  | 'ready'
  | 'countdown'
  | 'playing'
  | 'dying'
  | 'dead'
  | 'results';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly W = CONFIG.GAME_WIDTH;
  private readonly H = CONFIG.GAME_HEIGHT;
  private gridOffset = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  beginFrame(shake: ScreenShake): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = CONFIG.BG_COLOR;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.translate(shake.offsetX, shake.offsetY);
  }

  endFrame(): void {
    this.ctx.restore();
  }

  drawBackground(dt: number): void {
    this.gridOffset = (this.gridOffset + dt * 8) % CONFIG.GRID_SPACING;
    this.ctx.fillStyle = CONFIG.ACCENT_DIM;
    for (let x = this.gridOffset; x < this.W; x += CONFIG.GRID_SPACING) {
      for (let y = this.gridOffset; y < this.H; y += CONFIG.GRID_SPACING) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, CONFIG.GRID_DOT_RADIUS, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  drawRifts(rifts: Rift[]): void {
    const ctx = this.ctx;
    for (const rift of rifts) {
      const open = rift.openness;
      if (open <= 0) continue;

      const pulse = 1 + Math.sin(rift.pulsePhase) * 0.15;
      const r = CONFIG.RIFT_VISUAL_RADIUS * open * pulse;

      // Outer glow
      ctx.save();
      ctx.globalAlpha = 0.25 * open;
      const outerGrad = ctx.createRadialGradient(
        rift.x, rift.y, 0,
        rift.x, rift.y, r * 2
      );
      outerGrad.addColorStop(0, CONFIG.RIFT_COLOR);
      outerGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(rift.x, rift.y, r * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Inner glow
      ctx.save();
      ctx.globalAlpha = 0.6 * open;
      const grad = ctx.createRadialGradient(
        rift.x, rift.y, 0,
        rift.x, rift.y, r
      );
      grad.addColorStop(0, CONFIG.RIFT_COLOR);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rift.x, rift.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.globalAlpha = 0.9 * open;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rift.x, rift.y, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawProjectiles(projectiles: Projectile[]): void {
    const ctx = this.ctx;
    for (const p of projectiles) {
      if (!p.alive) continue;

      // Outer glow
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Hot center
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPlayer(player: Player): void {
    const ctx = this.ctx;

    // Trail with glow
    for (const point of player.trail) {
      ctx.save();
      ctx.globalAlpha = point.alpha * 0.4;
      ctx.shadowBlur = 6;
      ctx.shadowColor = CONFIG.PLAYER_COLOR;
      ctx.fillStyle = CONFIG.PLAYER_COLOR;
      ctx.beginPath();
      ctx.arc(point.x, point.y, player.radius * 0.7 * point.alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (player.isInvuln && Math.floor(player.invulnTimer * 10) % 2 === 0) {
      return;
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // Outer glow ring
    ctx.shadowBlur = 16;
    ctx.shadowColor = CONFIG.PLAYER_COLOR;
    ctx.fillStyle = CONFIG.PLAYER_COLOR;
    ctx.beginPath();
    ctx.moveTo(player.radius, 0);
    ctx.lineTo(-player.radius * 0.7, -player.radius * 0.7);
    ctx.lineTo(-player.radius * 0.3, 0);
    ctx.lineTo(-player.radius * 0.7, player.radius * 0.7);
    ctx.closePath();
    ctx.fill();

    // Inner bright core
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(player.radius * 0.5, 0);
    ctx.lineTo(-player.radius * 0.3, -player.radius * 0.3);
    ctx.lineTo(-player.radius * 0.1, 0);
    ctx.lineTo(-player.radius * 0.3, player.radius * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  drawFog(player: Player, elapsed: number, mods: GameplayModifiers): void {
    if (!mods.fogEnabled) return;

    const fogRadius = Math.max(
      mods.fogMinRadius,
      mods.fogInitialRadius - mods.fogShrinkRate * elapsed
    );

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = CONFIG.FOG_COLOR;
    ctx.beginPath();
    ctx.rect(0, 0, this.W, this.H);
    ctx.arc(player.x, player.y, fogRadius, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
  }

  drawParticles(particles: Particle[]): void {
    const ctx = this.ctx;
    for (const p of particles) {
      if (!p.alive) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.shadowBlur = 4;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawHud(
    scoring: ScoreTracker,
    player: Player,
    mods: GameplayModifiers,
    mutatorNames: string[]
  ): void {
    const ctx = this.ctx;

    if (mods.showHud) {
      ctx.save();
      ctx.fillStyle = CONFIG.HUD_COLOR;
      ctx.font = CONFIG.HUD_FONT_LARGE;
      ctx.textAlign = 'left';
      ctx.fillText(String(scoring.rawScore), 16, 36);

      ctx.fillStyle = CONFIG.HUD_DIM;
      ctx.font = CONFIG.HUD_FONT_SMALL;
      const mins = Math.floor(scoring.elapsed / 60);
      const secs = Math.floor(scoring.elapsed % 60);
      const ms = Math.floor((scoring.elapsed * 10) % 10);
      ctx.fillText(
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${ms}`,
        16,
        56
      );

      ctx.textAlign = 'right';
      const hpY = 32;
      for (let i = 0; i < player.maxHp; i++) {
        const cx = this.W - 20 - i * 22;
        ctx.beginPath();
        ctx.arc(cx, hpY, 7, 0, Math.PI * 2);
        if (i < player.hp) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = CONFIG.PLAYER_COLOR;
          ctx.fillStyle = CONFIG.PLAYER_COLOR;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = CONFIG.HUD_DIM;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      if (mutatorNames.length > 0) {
        ctx.fillStyle = CONFIG.HUD_DIM;
        ctx.font = CONFIG.HUD_FONT_SMALL;
        ctx.textAlign = 'right';
        for (let i = 0; i < mutatorNames.length; i++) {
          ctx.fillText(mutatorNames[i]!, this.W - 16, 56 + i * 18);
        }
      }
      ctx.restore();
    }

    // Near-miss popup with scale animation
    if (scoring.recentNearMiss && scoring.recentNearMissAge < 1.2) {
      const nm = scoring.recentNearMiss;
      const age = scoring.recentNearMissAge;
      const fadeAlpha = Math.max(0, 1 - age / 1.2);
      const rise = age * 40;

      // Scale: pop in fast then shrink
      const popScale = age < 0.08 ? age / 0.08 * 1.4 :
                        age < 0.2 ? 1.4 - (age - 0.08) / 0.12 * 0.4 : 1.0;

      ctx.save();
      ctx.globalAlpha = fadeAlpha;
      ctx.translate(nm.x, nm.y - 30 - rise);
      ctx.scale(popScale, popScale);

      // Glow behind text
      ctx.shadowBlur = 12;
      ctx.shadowColor = CONFIG.BOLT_COLOR;
      ctx.fillStyle = CONFIG.BOLT_COLOR;
      ctx.font = nm.combo > 2 ? CONFIG.HUD_FONT_LARGE : CONFIG.HUD_FONT_MEDIUM;
      ctx.textAlign = 'center';

      const comboText =
        nm.combo > 1 ? `+${nm.points} x${nm.combo}` : `+${nm.points}`;
      ctx.fillText(comboText, 0, 0);

      ctx.restore();
    }
  }

  drawReadyScreen(bestScore: number, level: number): void {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = 'rgba(6, 6, 18, 0.6)';
    ctx.fillRect(0, 0, this.W, this.H);

    // Title with glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = CONFIG.ACCENT;
    ctx.fillStyle = CONFIG.ACCENT;
    ctx.font = CONFIG.HUD_FONT_TITLE;
    ctx.textAlign = 'center';
    ctx.fillText('RIFT RELAY', this.W / 2, this.H * 0.35);
    ctx.shadowBlur = 0;

    const pulse = 0.7 + Math.sin(Date.now() / 400) * 0.3;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffffff';
    ctx.font = CONFIG.HUD_FONT_MEDIUM;
    ctx.fillText('TAP TO PLAY', this.W / 2, this.H * 0.5);
    ctx.globalAlpha = 1;

    ctx.fillStyle = CONFIG.HUD_DIM;
    ctx.font = CONFIG.HUD_FONT_SMALL;
    if (bestScore > 0) {
      ctx.fillText(`Best: ${bestScore}`, this.W / 2, this.H * 0.6);
    }
    if (level > 0) {
      ctx.fillText(`Level ${level}`, this.W / 2, this.H * 0.65);
    }

    ctx.restore();
  }

  drawCountdown(step: number, stepProgress: number): void {
    const ctx = this.ctx;
    const num = 3 - step;
    if (num <= 0) return;

    const scale = 1 + stepProgress * 0.5;
    const alpha = 1 - stepProgress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 16;
    ctx.shadowColor = CONFIG.ACCENT;
    ctx.fillStyle = CONFIG.ACCENT;
    ctx.font = CONFIG.HUD_FONT_COUNTDOWN;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(this.W / 2, this.H / 2);
    ctx.scale(scale, scale);
    ctx.fillText(String(num), 0, 0);
    ctx.restore();
  }

  drawDeathFlash(progress: number): void {
    const ctx = this.ctx;
    // Initial bright flash, then fade
    const flash = progress < 0.1 ? (progress / 0.1) * 0.6 :
                   0.6 * Math.pow(1 - (progress - 0.1) / 0.9, 2);
    ctx.save();
    ctx.globalAlpha = flash;
    ctx.fillStyle = CONFIG.DEATH_COLOR;
    ctx.fillRect(-20, -20, this.W + 40, this.H + 40);
    ctx.restore();

    // Vignette during death
    ctx.save();
    ctx.globalAlpha = 0.4 * (1 - progress);
    const vignette = ctx.createRadialGradient(
      this.W / 2, this.H / 2, this.W * 0.2,
      this.W / 2, this.H / 2, this.W * 0.7
    );
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, '#000000');
    ctx.fillStyle = vignette;
    ctx.fillRect(-20, -20, this.W + 40, this.H + 40);
    ctx.restore();
  }

  drawResults(
    scoring: ScoreTracker,
    result: RunCompleteResponse | null,
    mutatorNames: string[]
  ): void {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = 'rgba(6, 6, 18, 0.85)';
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.shadowBlur = 12;
    ctx.shadowColor = CONFIG.DEATH_COLOR;
    ctx.fillStyle = CONFIG.DEATH_COLOR;
    ctx.font = CONFIG.HUD_FONT_TITLE;
    ctx.textAlign = 'center';
    ctx.fillText('RIFT CLOSED', this.W / 2, this.H * 0.18);
    ctx.shadowBlur = 0;

    let y = this.H * 0.28;
    const lineHeight = 26;

    ctx.fillStyle = '#ffffff';
    ctx.font = CONFIG.HUD_FONT_MEDIUM;

    const drawLine = (label: string, value: string): void => {
      ctx.textAlign = 'left';
      ctx.fillStyle = CONFIG.HUD_DIM;
      ctx.fillText(label, this.W * 0.15, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(value, this.W * 0.85, y);
      y += lineHeight;
    };

    const mins = Math.floor(scoring.elapsed / 60);
    const secs = Math.floor(scoring.elapsed % 60);
    drawLine('Survival', `${mins}m ${secs}s`);
    drawLine('Time Score', String(scoring.timeScore));
    drawLine('Near Misses', String(scoring.nearMissCount));
    drawLine('Near Miss Bonus', `+${scoring.nearMissTotal}`);
    drawLine('Milestones', `+${scoring.milestoneTotal}`);

    y += 8;
    ctx.shadowBlur = 8;
    ctx.shadowColor = CONFIG.ACCENT;
    ctx.fillStyle = CONFIG.ACCENT;
    ctx.font = CONFIG.HUD_FONT_LARGE;
    ctx.textAlign = 'center';
    ctx.fillText(`Raw Score: ${scoring.rawScore}`, this.W / 2, y);
    ctx.shadowBlur = 0;
    y += lineHeight + 4;

    if (mutatorNames.length > 0) {
      ctx.fillStyle = CONFIG.HUD_DIM;
      ctx.font = CONFIG.HUD_FONT_SMALL;
      ctx.fillText(`Mutators: ${mutatorNames.join(', ')}`, this.W / 2, y);
      y += lineHeight;
    }

    if (result) {
      y += 8;
      ctx.font = CONFIG.HUD_FONT_MEDIUM;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(
        `Final Score: ${result.score} (${result.reward.scoreMultiplier}x)`,
        this.W / 2,
        y
      );
      y += lineHeight;

      ctx.fillStyle = CONFIG.ACCENT;
      ctx.fillText(
        `+${result.reward.xpGained} XP    +${result.reward.currencyGained} Currency`,
        this.W / 2,
        y
      );
      y += lineHeight;

      if (result.reward.levelUps > 0) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = CONFIG.BOLT_COLOR;
        ctx.fillStyle = CONFIG.BOLT_COLOR;
        ctx.fillText(`LEVEL UP! (${result.profile.level})`, this.W / 2, y);
        ctx.shadowBlur = 0;
        y += lineHeight;
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = CONFIG.HUD_FONT_SMALL;
      ctx.fillText(`Best: ${result.bestScore}`, this.W / 2, y);
      y += lineHeight;
    }

    y = Math.max(y + 20, this.H * 0.82);
    const pulse = 0.7 + Math.sin(Date.now() / 400) * 0.3;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffffff';
    ctx.font = CONFIG.HUD_FONT_MEDIUM;
    ctx.fillText('TAP TO PLAY AGAIN', this.W / 2, y);
    ctx.globalAlpha = 1;

    ctx.restore();
  }
}
