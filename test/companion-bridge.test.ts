// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupCompanionPanel } from '../src/client/companion-panel';
import type { InitResponse } from '../src/shared/api';

const mountDom = (): void => {
  document.body.innerHTML = `
    <aside id="devvit-panel" class="collapsed"></aside>
    <button id="panel-toggle" type="button"></button>
    <p id="panel-status"></p>
    <p id="panel-user"></p>
    <p id="panel-best"></p>
    <input id="panel-level" />
    <input id="panel-note" />
    <input id="panel-score" />
    <button id="panel-save-state" type="button"></button>
    <button id="panel-load-state" type="button"></button>
    <button id="panel-submit-score" type="button"></button>
    <button id="panel-refresh-lb" type="button"></button>
    <ul id="panel-leaderboard"></ul>
  `;
};

const initData: InitResponse = {
  type: 'init',
  postId: 't3_post',
  username: 'alice',
  snoovatarUrl: '',
  previousTime: '',
  state: null,
  leaderboard: {
    top: [],
    me: null,
    totalPlayers: 0,
    generatedAt: 1,
  },
};

describe('companion bridge globals', () => {
  beforeEach(() => {
    mountDom();
  });

  afterEach(() => {
    delete window.DevvitBridge;
    delete window.doGMLCallback;
    delete window.devvit_submit_score;
    delete window.devvit_save_state;
    delete window.devvit_load_state;
    delete window.devvit_refresh_leaderboard;
    vi.restoreAllMocks();
  });

  it('returns score result to GML callback payload', async () => {
    setupCompanionPanel(initData);
    const callback = vi.fn();
    window.doGMLCallback = callback;

    window.DevvitBridge = {
      getInitData: () => initData,
      saveState: vi.fn(),
      loadState: vi.fn(),
      submitScore: vi.fn(async () => ({
        username: 'alice',
        score: 90,
        updatedAt: 10,
      })),
      getLeaderboard: vi.fn(async () => ({
        top: [{ rank: 1, username: 'alice', score: 90 }],
        me: { rank: 1, username: 'alice', score: 90 },
        totalPlayers: 1,
        generatedAt: 11,
      })),
      getMeta: vi.fn(async () => ({
        profile: {
          username: 'alice',
          level: 1,
          xp: 0,
          xpToNextLevel: 300,
          currency: 0,
          streak: 0,
          equippedPerks: [],
          unlockedPerkIds: [],
          lifetimeRuns: 0,
          lifetimeBestScore: 0,
          updatedAt: 1,
        },
        quests: [],
        activeChallenges: [],
        catalog: {
          perks: [],
          mutators: [],
        },
        leaderboard: {
          top: [],
          me: null,
          totalPlayers: 0,
          generatedAt: 1,
        },
        generatedAt: 1,
      })),
      startRun: vi.fn(),
      completeRun: vi.fn(),
      togglePerk: vi.fn(),
      refreshPanel: vi.fn(),
    };

    window.devvit_submit_score?.(90, 42);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(1);
    });

    const [method, payload] = callback.mock.calls[0] as [number, unknown];
    expect(method).toBe(42);
    expect(payload).toMatchObject({
      ok: true,
      action: 'submit_score',
      data: {
        result: { score: 90 },
      },
    });
  });

  it('returns validation error when level is invalid', async () => {
    setupCompanionPanel(initData);
    const callback = vi.fn();
    window.doGMLCallback = callback;

    window.devvit_save_state?.('not-a-number', 'note', 9);

    expect(callback).toHaveBeenCalledTimes(1);
    const [method, payload] = callback.mock.calls[0] as [number, unknown];
    expect(method).toBe(9);
    expect(payload).toMatchObject({
      ok: false,
      action: 'save_state',
      error: 'Level must be a finite number',
    });
  });
});
