import { setupCompanionPanel } from './companion-panel';
import { fetchInit } from './devvit-api';
import { Game } from './game/engine';

class RiftRelayLoader {
  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const loading = document.getElementById('loading') as HTMLElement;
    const status = document.getElementById('status') as HTMLElement;

    try {
      status.textContent = 'Connecting...';
      const initData = await fetchInit();
      setupCompanionPanel(initData);

      loading.style.display = 'none';
      canvas.style.display = 'block';
      canvas.classList.add('active');

      const game = new Game(canvas, initData);
      game.start();
    } catch (error) {
      console.error('Failed to initialize:', error);
      status.textContent = 'Failed to connect';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new RiftRelayLoader());
} else {
  new RiftRelayLoader();
}
