import { CONFIG } from './config';

export class InputManager {
  cursorX: number;
  cursorY: number;
  isDown = false;
  private tapped = false;

  constructor(canvas: HTMLCanvasElement) {
    this.cursorX = CONFIG.GAME_WIDTH / 2;
    this.cursorY = CONFIG.GAME_HEIGHT / 2;

    const toGame = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height),
      };
    };

    canvas.addEventListener('mousemove', (e) => {
      const pos = toGame(e.clientX, e.clientY);
      this.cursorX = pos.x;
      this.cursorY = pos.y;
    });

    canvas.addEventListener('mousedown', (e) => {
      const pos = toGame(e.clientX, e.clientY);
      this.cursorX = pos.x;
      this.cursorY = pos.y;
      this.isDown = true;
      this.tapped = true;
    });

    canvas.addEventListener('mouseup', () => {
      this.isDown = false;
    });

    canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
          const pos = toGame(touch.clientX, touch.clientY);
          this.cursorX = pos.x;
          this.cursorY = pos.y;
        }
        this.isDown = true;
        this.tapped = true;
      },
      { passive: false }
    );

    canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
          const pos = toGame(touch.clientX, touch.clientY);
          this.cursorX = pos.x;
          this.cursorY = pos.y;
        }
      },
      { passive: false }
    );

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.isDown = false;
    });
  }

  consumeTap(): boolean {
    if (this.tapped) {
      this.tapped = false;
      return true;
    }
    return false;
  }
}
