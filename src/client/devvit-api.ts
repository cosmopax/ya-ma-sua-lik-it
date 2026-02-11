import type {
  ChallengeSnapshot,
  EquippedPerk,
  GameplayCatalog,
  InitResponse,
  LeaderboardEntry,
  LeaderboardResponse,
  MetaResponse,
  MutatorDefinition,
  PerkDefinition,
  PerkEquipResponse,
  PlayerMetaState,
  PlayerQuest,
  RunCompleteRequest,
  RunCompleteResponse,
  RunRewardBreakdown,
  RunStartRequest,
  RunStartResponse,
  ScoreSubmitResponse,
  StateUpsertRequest,
  StoredState,
} from '../shared/api';

type JsonRecord = Record<string, unknown>;

export class ApiClientError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isLeaderboardEntry = (value: unknown): value is LeaderboardEntry => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.rank) &&
    typeof value.username === 'string' &&
    isFiniteNumber(value.score)
  );
};

const isLeaderboardResponse = (value: unknown): value is LeaderboardResponse => {
  if (!isJsonRecord(value)) {
    return false;
  }

  const meValid =
    value.me === null || value.me === undefined || isLeaderboardEntry(value.me);

  return (
    Array.isArray(value.top) &&
    value.top.every((entry) => isLeaderboardEntry(entry)) &&
    meValid &&
    isFiniteNumber(value.totalPlayers) &&
    isFiniteNumber(value.generatedAt)
  );
};

const isStoredState = (value: unknown): value is StoredState => {
  if (!isJsonRecord(value)) {
    return false;
  }

  const levelValid = value.level === undefined || isFiniteNumber(value.level);
  const bestScoreValid =
    value.bestScore === undefined || isFiniteNumber(value.bestScore);
  const dataValid = value.data === undefined || isJsonRecord(value.data);

  return (
    typeof value.username === 'string' &&
    isFiniteNumber(value.updatedAt) &&
    levelValid &&
    bestScoreValid &&
    dataValid
  );
};

const isInitResponse = (value: unknown): value is InitResponse => {
  if (!isJsonRecord(value)) {
    return false;
  }

  const stateValid = value.state === null || isStoredState(value.state);

  return (
    value.type === 'init' &&
    typeof value.postId === 'string' &&
    typeof value.username === 'string' &&
    typeof value.snoovatarUrl === 'string' &&
    typeof value.previousTime === 'string' &&
    stateValid &&
    isLeaderboardResponse(value.leaderboard)
  );
};

const isScoreSubmitResponse = (value: unknown): value is ScoreSubmitResponse => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    typeof value.username === 'string' &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.updatedAt)
  );
};

const isEquippedPerk = (value: unknown): value is EquippedPerk => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return typeof value.id === 'string' && isFiniteNumber(value.level);
};

const isPlayerMetaState = (value: unknown): value is PlayerMetaState => {
  if (!isJsonRecord(value)) {
    return false;
  }

  const lastPlayedValid =
    value.lastPlayedDay === undefined || typeof value.lastPlayedDay === 'string';

  return (
    typeof value.username === 'string' &&
    isFiniteNumber(value.level) &&
    isFiniteNumber(value.xp) &&
    isFiniteNumber(value.xpToNextLevel) &&
    isFiniteNumber(value.currency) &&
    isFiniteNumber(value.streak) &&
    Array.isArray(value.equippedPerks) &&
    value.equippedPerks.every((perk) => isEquippedPerk(perk)) &&
    isStringArray(value.unlockedPerkIds) &&
    isFiniteNumber(value.lifetimeRuns) &&
    isFiniteNumber(value.lifetimeBestScore) &&
    lastPlayedValid &&
    isFiniteNumber(value.updatedAt)
  );
};

const isPlayerQuest = (value: unknown): value is PlayerQuest => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    (value.scope === 'daily' || value.scope === 'weekly') &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    isFiniteNumber(value.target) &&
    isFiniteNumber(value.progress) &&
    isFiniteNumber(value.rewardCurrency) &&
    typeof value.completed === 'boolean' &&
    typeof value.claimable === 'boolean'
  );
};

const isChallengeSnapshot = (value: unknown): value is ChallengeSnapshot => {
  if (!isJsonRecord(value)) {
    return false;
  }

  const completedValid =
    value.completed === undefined || typeof value.completed === 'boolean';

  return (
    (value.mode === 'daily' || value.mode === 'weekly') &&
    typeof value.key === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    isStringArray(value.mutatorIds) &&
    isFiniteNumber(value.targetScore) &&
    isFiniteNumber(value.rewardBonus) &&
    isFiniteNumber(value.expiresAt) &&
    completedValid
  );
};

const isMutatorDefinition = (value: unknown): value is MutatorDefinition => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    isFiniteNumber(value.scoreMultiplier) &&
    isFiniteNumber(value.difficulty) &&
    (value.theme === 'risk' ||
      value.theme === 'speed' ||
      value.theme === 'precision' ||
      value.theme === 'endurance')
  );
};

const isPerkDefinition = (value: unknown): value is PerkDefinition => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    isFiniteNumber(value.unlockLevel) &&
    isFiniteNumber(value.maxLevel)
  );
};

const isGameplayCatalog = (value: unknown): value is GameplayCatalog => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.mutators) &&
    value.mutators.every((mutator) => isMutatorDefinition(mutator)) &&
    Array.isArray(value.perks) &&
    value.perks.every((perk) => isPerkDefinition(perk))
  );
};

const isMetaResponse = (value: unknown): value is MetaResponse => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    isPlayerMetaState(value.profile) &&
    Array.isArray(value.quests) &&
    value.quests.every((quest) => isPlayerQuest(quest)) &&
    Array.isArray(value.activeChallenges) &&
    value.activeChallenges.every((challenge) => isChallengeSnapshot(challenge)) &&
    isGameplayCatalog(value.catalog) &&
    isLeaderboardResponse(value.leaderboard) &&
    isFiniteNumber(value.generatedAt)
  );
};

const isRunStartResponse = (value: unknown): value is RunStartResponse => {
  if (!isJsonRecord(value)) {
    return false;
  }

  const challengeValid =
    value.challenge === undefined || isChallengeSnapshot(value.challenge);

  return (
    typeof value.ticket === 'string' &&
    (value.mode === 'normal' || value.mode === 'daily' || value.mode === 'weekly') &&
    isFiniteNumber(value.seed) &&
    isStringArray(value.offeredMutatorIds) &&
    isStringArray(value.defaultMutatorIds) &&
    challengeValid &&
    isFiniteNumber(value.startedAt) &&
    isFiniteNumber(value.expiresAt) &&
    isPlayerMetaState(value.profile)
  );
};

const isRunRewardBreakdown = (value: unknown): value is RunRewardBreakdown => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.xpGained) &&
    isFiniteNumber(value.currencyGained) &&
    isFiniteNumber(value.scoreMultiplier) &&
    isFiniteNumber(value.streakBonus) &&
    isFiniteNumber(value.challengeBonus) &&
    isFiniteNumber(value.perkBonus) &&
    isFiniteNumber(value.levelUps)
  );
};

const isRunCompleteResponse = (value: unknown): value is RunCompleteResponse => {
  if (!isJsonRecord(value)) {
    return false;
  }
  if (!isJsonRecord(value.runSummary)) {
    return false;
  }

  return (
    (value.mode === 'normal' || value.mode === 'daily' || value.mode === 'weekly') &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.bestScore) &&
    isRunRewardBreakdown(value.reward) &&
    isPlayerMetaState(value.profile) &&
    isLeaderboardResponse(value.leaderboard) &&
    Array.isArray(value.quests) &&
    value.quests.every((quest) => isPlayerQuest(quest)) &&
    isStringArray(value.runSummary.mutatorIds) &&
    isStringArray(value.runSummary.completedChallenges) &&
    isFiniteNumber(value.completedAt)
  );
};

const isPerkEquipResponse = (value: unknown): value is PerkEquipResponse => {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    isPlayerMetaState(value.profile) &&
    Array.isArray(value.equippedPerks) &&
    value.equippedPerks.every((perk) => isEquippedPerk(perk))
  );
};

const parseErrorMessage = (value: unknown): string => {
  if (!isJsonRecord(value)) {
    return 'Request failed';
  }

  if (typeof value.message === 'string') {
    return value.message;
  }

  if (typeof value.error === 'string') {
    return value.error;
  }

  return 'Request failed';
};

const toApiUrl = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (
    typeof globalThis.location !== 'undefined' &&
    typeof globalThis.location.href === 'string'
  ) {
    try {
      return new URL(path, globalThis.location.href).toString();
    } catch {
      return path;
    }
  }

  return path;
};

const request = async <T>(
  path: string,
  init: RequestInit,
  validate: (value: unknown) => value is T
): Promise<T> => {
  const response = await fetch(toApiUrl(path), {
    credentials: 'include',
    ...init,
  });

  let body: unknown = undefined;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    throw new ApiClientError(response.status, parseErrorMessage(body));
  }

  if (!validate(body)) {
    throw new ApiClientError(
      response.status,
      `Unexpected response format from ${path}`
    );
  }

  return body;
};

const requestNoContent = async (path: string, init: RequestInit): Promise<unknown> => {
  const response = await fetch(toApiUrl(path), {
    credentials: 'include',
    ...init,
  });

  let body: unknown = undefined;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    throw new ApiClientError(response.status, parseErrorMessage(body));
  }

  return body;
};

export const fetchInit = async (): Promise<InitResponse> => {
  return await request('/api/init', { method: 'GET' }, isInitResponse);
};

export const fetchState = async (): Promise<StoredState | null> => {
  const response = await fetch(toApiUrl('/api/state'), {
    method: 'GET',
    credentials: 'include',
  });

  if (response.status === 404) {
    return null;
  }

  let body: unknown = undefined;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    throw new ApiClientError(response.status, parseErrorMessage(body));
  }

  if (!isStoredState(body)) {
    throw new ApiClientError(500, 'Unexpected response format from /api/state');
  }

  return body;
};

export const upsertState = async (
  payload: StateUpsertRequest
): Promise<StoredState> => {
  return await request(
    '/api/state',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    isStoredState
  );
};

export const submitScore = async (score: number): Promise<ScoreSubmitResponse> => {
  return await request(
    '/api/score',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ score }),
    },
    isScoreSubmitResponse
  );
};

export const fetchLeaderboard = async (
  limit = 10
): Promise<LeaderboardResponse> => {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(limit, 100))
    : 10;
  const url = `/api/leaderboard?limit=${normalizedLimit}`;
  return await request(url, { method: 'GET' }, isLeaderboardResponse);
};

export const fetchMeta = async (): Promise<MetaResponse> => {
  return await request('/api/meta', { method: 'GET' }, isMetaResponse);
};

export const equipPerk = async (perkId: string): Promise<PerkEquipResponse> => {
  return await request(
    '/api/meta/perk/equip',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ perkId }),
    },
    isPerkEquipResponse
  );
};

export const startRun = async (
  payload: RunStartRequest
): Promise<RunStartResponse> => {
  return await request(
    '/api/run/start',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    isRunStartResponse
  );
};

export const completeRun = async (
  payload: RunCompleteRequest
): Promise<RunCompleteResponse> => {
  return await request(
    '/api/run/complete',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    isRunCompleteResponse
  );
};

export const warmGameplayRoute = async (): Promise<void> => {
  await requestNoContent('/api/meta', { method: 'GET' });
};
