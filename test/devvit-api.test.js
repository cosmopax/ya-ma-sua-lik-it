import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchInit, fetchLeaderboard, fetchState, submitScore, upsertState, } from '../src/client/devvit-api';
const originalFetch = globalThis.fetch;
const jsonResponse = (body, status = 200) => {
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
        globalThis.fetch = vi.fn(async () => jsonResponse({
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
        }));
        const init = await fetchInit();
        expect(init.postId).toBe('t3_abc');
        expect(init.username).toBe('alice');
    });
    it('returns null for missing state (404)', async () => {
        globalThis.fetch = vi.fn(async () => jsonResponse({ error: 'No state found' }, 404));
        const state = await fetchState();
        expect(state).toBeNull();
    });
    it('submits score and validates response', async () => {
        globalThis.fetch = vi.fn(async () => jsonResponse({
            username: 'alice',
            score: 123,
            updatedAt: 99,
        }));
        const result = await submitScore(123);
        expect(result.score).toBe(123);
    });
    it('normalizes leaderboard limit query parameter', async () => {
        const fetchMock = vi.fn(async () => jsonResponse({
            top: [],
            me: null,
            totalPlayers: 0,
            generatedAt: 1,
        }));
        globalThis.fetch = fetchMock;
        await fetchLeaderboard(1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/api/leaderboard?limit=100', expect.objectContaining({
            method: 'GET',
        }));
    });
    it('surfaces backend message as ApiClientError', async () => {
        globalThis.fetch = vi.fn(async () => jsonResponse({ error: 'Login required' }, 401));
        await expect(upsertState({ level: 1 })).rejects.toMatchObject({
            name: 'ApiClientError',
            status: 401,
            message: 'Login required',
        });
    });
});
//# sourceMappingURL=devvit-api.test.js.map