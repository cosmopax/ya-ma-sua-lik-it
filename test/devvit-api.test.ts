import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMeta,
  fetchInit,
  fetchLeaderboard,
  fetchState,
  startRun,
  submitScore,
  upsertState,
} from '../src/client/devvit-api';

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
};

describe('devvit-api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads init payload', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        type: 'init',
        postId: 't3_abc',
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
      })
    ) as typeof fetch;

    const init = await fetchInit();
    expect(init.postId).toBe('t3_abc');
    expect(init.username).toBe('alice');
  });

  it('returns null for missing state (404)', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: 'No state found' }, 404)) as
      typeof fetch;

    const state = await fetchState();
    expect(state).toBeNull();
  });

  it('submits score and validates response', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        username: 'alice',
        score: 123,
        updatedAt: 99,
      })
    ) as typeof fetch;

    const result = await submitScore(123);
    expect(result.score).toBe(123);
  });

  it('normalizes leaderboard limit query parameter', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        top: [],
        me: null,
        totalPlayers: 0,
        generatedAt: 1,
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchLeaderboard(1000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/leaderboard?limit=100',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('surfaces backend message as ApiClientError', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: 'Login required' }, 401)
    ) as typeof fetch;

    await expect(upsertState({ level: 1 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 401,
      message: 'Login required',
    });
  });

  it('loads gameplay meta payload', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        profile: {
          username: 'alice',
          level: 2,
          xp: 90,
          xpToNextLevel: 420,
          currency: 75,
          streak: 3,
          equippedPerks: [{ id: 'arc_synth', level: 1 }],
          unlockedPerkIds: ['arc_synth'],
          lifetimeRuns: 10,
          lifetimeBestScore: 12000,
          lastPlayedDay: '2026-02-11',
          updatedAt: 1,
        },
        quests: [],
        activeChallenges: [],
        catalog: {
          perks: [
            {
              id: 'arc_synth',
              name: 'Arc Synth',
              description: '+xp',
              unlockLevel: 1,
              maxLevel: 1,
            },
          ],
          mutators: [
            {
              id: 'fog_protocol',
              name: 'Fog',
              description: 'desc',
              scoreMultiplier: 1.2,
              difficulty: 1,
              theme: 'precision',
            },
          ],
        },
        leaderboard: {
          top: [],
          me: null,
          totalPlayers: 0,
          generatedAt: 1,
        },
        generatedAt: 1,
      })
    ) as typeof fetch;

    const meta = await fetchMeta();
    expect(meta.profile.level).toBe(2);
    expect(meta.catalog.perks[0]?.id).toBe('arc_synth');
  });

  it('starts a run and validates response', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        ticket: 'abc',
        mode: 'daily',
        seed: 1,
        offeredMutatorIds: ['fog_protocol', 'turbo_swarm'],
        defaultMutatorIds: ['fog_protocol'],
        challenge: {
          mode: 'daily',
          key: '2026-02-11',
          title: 'Daily',
          description: 'desc',
          mutatorIds: ['fog_protocol'],
          targetScore: 9000,
          rewardBonus: 100,
          expiresAt: 2,
        },
        startedAt: 1,
        expiresAt: 2,
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
      })
    ) as typeof fetch;

    const run = await startRun({ mode: 'daily' });
    expect(run.mode).toBe('daily');
    expect(run.ticket).toBe('abc');
  });
});
