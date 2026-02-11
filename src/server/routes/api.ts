import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  ChallengeMode,
  ChallengeSnapshot,
  EquippedPerk,
  GameplayCatalog,
  InitResponse,
  LeaderboardEntry,
  LeaderboardResponse,
  MetaResponse,
  MutatorDefinition,
  PerkDefinition,
  PerkEquipRequest,
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
} from '../../shared/api';

type ErrorResponse = {
  status: 'error';
  message: string;
};

type SimpleErrorResponse = {
  error: string;
};

type StoredQuestProgress = {
  key: string;
  progress: number;
  claimed: boolean;
};

type StoredMeta = {
  username: string;
  level: number;
  xp: number;
  currency: number;
  streak: number;
  equippedPerks: EquippedPerk[];
  unlockedPerkIds: string[];
  lifetimeRuns: number;
  lifetimeBestScore: number;
  lastPlayedDay?: string;
  questProgress: Record<string, StoredQuestProgress>;
  challengeClaims: Record<string, boolean>;
  updatedAt: number;
};

type StoredRunSession = {
  ticket: string;
  mode: ChallengeMode;
  seed: number;
  offeredMutatorIds: string[];
  defaultMutatorIds: string[];
  selectedPerkIds: string[];
  challengeKey?: string;
  startedAt: number;
  expiresAt: number;
};

type QuestTemplate = {
  id: string;
  scope: 'daily' | 'weekly';
  title: string;
  description: string;
  target: number;
  rewardCurrency: number;
  metric: 'runs' | 'score';
};

export const api = new Hono();

const stateKey = (postId: string, username: string) =>
  `state:${postId}:${username}`;
const leaderboardKey = (postId: string) => `lb:${postId}`;
const metaKey = (postId: string, username: string) => `meta:${postId}:${username}`;
const runSessionKey = (postId: string, username: string, ticket: string) =>
  `run:${postId}:${username}:${ticket}`;
const challengeLeaderboardKey = (
  postId: string,
  mode: Exclude<ChallengeMode, 'normal'>,
  key: string
) => `lb:${postId}:${mode}:${key}`;

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

const getUsername = async (): Promise<string> => {
  const username = await reddit.getCurrentUsername();
  return username ?? 'anonymous';
};

const parseStoredState = (raw: string | undefined): StoredState | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isJsonRecord(parsed)) {
      return null;
    }
    if (typeof parsed.username !== 'string') {
      return null;
    }
    if (typeof parsed.updatedAt !== 'number' || !Number.isFinite(parsed.updatedAt)) {
      return null;
    }

    const next: StoredState = {
      username: parsed.username,
      updatedAt: parsed.updatedAt,
    };

    if (typeof parsed.level === 'number' && Number.isFinite(parsed.level)) {
      next.level = parsed.level;
    }
    if (typeof parsed.bestScore === 'number' && Number.isFinite(parsed.bestScore)) {
      next.bestScore = parsed.bestScore;
    }
    if (isJsonRecord(parsed.data)) {
      next.data = parsed.data;
    }

    return next;
  } catch (error) {
    console.error('Failed to parse stored state:', error);
    return null;
  }
};

const getLeaderboardSnapshot = async (
  postId: string,
  username: string,
  limit: number
): Promise<LeaderboardResponse> => {
  const lbKey = leaderboardKey(postId);
  const entries = await redis.zRange(lbKey, 0, Math.max(0, limit - 1), {
    by: 'rank',
    reverse: true,
  });

  const top: LeaderboardEntry[] = entries.map((entry, index) => ({
    rank: index + 1,
    username: entry.member,
    score: Number(entry.score ?? 0),
  }));

  const ascRank = await redis.zRank(lbKey, username);
  const total = Number((await redis.zCard(lbKey)) ?? 0);

  let me: LeaderboardEntry | null = null;
  if (ascRank !== undefined && ascRank !== null && total > 0) {
    const score = await redis.zScore(lbKey, username);
    me = {
      rank: total - Number(ascRank),
      username,
      score: Number(score ?? 0),
    };
  }

  return {
    top,
    me,
    totalPlayers: total,
    generatedAt: Date.now(),
  };
};

const PERK_CATALOG: PerkDefinition[] = [
  {
    id: 'arc_synth',
    name: 'Arc Synth',
    description: '+12% XP from every completed run.',
    unlockLevel: 1,
    maxLevel: 1,
  },
  {
    id: 'volatile_matrix',
    name: 'Volatile Matrix',
    description: '+6% reward scaling per high-risk mutator (difficulty >= 2).',
    unlockLevel: 2,
    maxLevel: 1,
  },
  {
    id: 'streak_resonator',
    name: 'Streak Resonator',
    description: '+10% currency when streak is 3 or higher.',
    unlockLevel: 3,
    maxLevel: 1,
  },
  {
    id: 'tempo_core',
    name: 'Tempo Core',
    description: '+8% reward scaling when surviving at least 120 seconds.',
    unlockLevel: 4,
    maxLevel: 1,
  },
];

const MUTATOR_CATALOG: MutatorDefinition[] = [
  {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    description: 'Enemies hit harder, but score rewards are amplified.',
    scoreMultiplier: 1.35,
    difficulty: 2,
    theme: 'risk',
  },
  {
    id: 'fog_protocol',
    name: 'Fog Protocol',
    description: 'Visibility shrinks over time; precision is rewarded.',
    scoreMultiplier: 1.22,
    difficulty: 1,
    theme: 'precision',
  },
  {
    id: 'turbo_swarm',
    name: 'Turbo Swarm',
    description: 'Faster enemy spawns for an aggressive run pace.',
    scoreMultiplier: 1.3,
    difficulty: 2,
    theme: 'speed',
  },
  {
    id: 'sudden_death',
    name: 'Sudden Death',
    description: 'No recovery margin. Execute a clean run for huge payoff.',
    scoreMultiplier: 1.55,
    difficulty: 3,
    theme: 'risk',
  },
  {
    id: 'endless_echo',
    name: 'Endless Echo',
    description: 'Long-form pressure curve that rewards endurance.',
    scoreMultiplier: 1.28,
    difficulty: 2,
    theme: 'endurance',
  },
  {
    id: 'micro_hud',
    name: 'Micro HUD',
    description: 'Minimal information; better intuition yields better score.',
    scoreMultiplier: 1.2,
    difficulty: 1,
    theme: 'precision',
  },
];

const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    id: 'daily_runs',
    scope: 'daily',
    title: 'Daily Cadence',
    description: 'Complete 3 runs today.',
    target: 3,
    rewardCurrency: 35,
    metric: 'runs',
  },
  {
    id: 'daily_score',
    scope: 'daily',
    title: 'Daily Spike',
    description: 'Accumulate 10,000 score today.',
    target: 10_000,
    rewardCurrency: 50,
    metric: 'score',
  },
  {
    id: 'weekly_runs',
    scope: 'weekly',
    title: 'Weekly Grinder',
    description: 'Complete 15 runs this week.',
    target: 15,
    rewardCurrency: 180,
    metric: 'runs',
  },
  {
    id: 'weekly_score',
    scope: 'weekly',
    title: 'Weekly Peak',
    description: 'Accumulate 75,000 score this week.',
    target: 75_000,
    rewardCurrency: 250,
    metric: 'score',
  },
];

const catalog: GameplayCatalog = {
  perks: PERK_CATALOG,
  mutators: MUTATOR_CATALOG,
};

const mutatorById = new Map<string, MutatorDefinition>(
  MUTATOR_CATALOG.map((mutator) => [mutator.id, mutator])
);
const perkById = new Map<string, PerkDefinition>(
  PERK_CATALOG.map((perk) => [perk.id, perk])
);

const xpToNextLevel = (level: number): number => level * 120 + 180;

const getDayKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);

  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayDiff = Math.floor(
    (date.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000)
  );
  const week = Math.ceil((dayDiff + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const dayKeyToTimestamp = (key: string): number => {
  const parsed = new Date(`${key}T00:00:00.000Z`).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const addDaysToDayKey = (key: string, days: number): string => {
  const start = dayKeyToTimestamp(key);
  return getDayKey(start + days * 24 * 60 * 60 * 1000);
};

const weekKeyToTimestamp = (key: string): number => {
  const [yearPart, weekPartRaw] = key.split('-W');
  const year = Number(yearPart);
  const week = Number(weekPartRaw);

  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    return Date.now();
  }

  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const day = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - day + 1 + (week - 1) * 7);
  return monday.getTime();
};

const hashString = (input: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pickUniqueMutators = (seed: number, count: number): string[] => {
  const pool = MUTATOR_CATALOG.map((mutator) => mutator.id);
  const picked: string[] = [];
  let cursor = seed >>> 0;

  const next = (): number => {
    cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
    return cursor;
  };

  while (picked.length < count && pool.length > 0) {
    const index = next() % pool.length;
    const [selected] = pool.splice(index, 1);
    if (selected) {
      picked.push(selected);
    }
  }

  return picked;
};

const getDailyChallenge = (timestamp: number): ChallengeSnapshot => {
  const dayKey = getDayKey(timestamp);
  const seed = hashString(`daily:${dayKey}`);
  const mutatorIds = pickUniqueMutators(seed, 2);
  return {
    mode: 'daily',
    key: dayKey,
    title: `Daily Rift ${dayKey}`,
    description:
      'Fixed mutators for all players today. Beat the target score to secure the bonus.',
    mutatorIds,
    targetScore: 9000 + (seed % 4000),
    rewardBonus: 90 + (seed % 40),
    expiresAt: dayKeyToTimestamp(addDaysToDayKey(dayKey, 1)),
  };
};

const getWeeklyChallenge = (timestamp: number): ChallengeSnapshot => {
  const weekKey = getWeekKey(timestamp);
  const seed = hashString(`weekly:${weekKey}`);
  const mutatorIds = pickUniqueMutators(seed, 3);
  return {
    mode: 'weekly',
    key: weekKey,
    title: `Weekly Gauntlet ${weekKey}`,
    description:
      'Three mutators, one week. Score above target once to lock in the seasonal bonus.',
    mutatorIds,
    targetScore: 22000 + (seed % 8000),
    rewardBonus: 220 + (seed % 90),
    expiresAt: weekKeyToTimestamp(getWeekKey(timestamp + 8 * 24 * 60 * 60 * 1000)),
  };
};

const getQuestCycleKey = (
  scope: 'daily' | 'weekly',
  timestamp: number
): string => (scope === 'daily' ? getDayKey(timestamp) : getWeekKey(timestamp));

const getDefaultUnlockedPerkIds = (level: number): string[] =>
  PERK_CATALOG.filter((perk) => perk.unlockLevel <= level).map((perk) => perk.id);

const normalizeEquippedPerks = (
  unlockedPerkIds: string[],
  equippedPerks: EquippedPerk[]
): EquippedPerk[] => {
  const unlockedSet = new Set(unlockedPerkIds);
  const next: EquippedPerk[] = [];

  for (const perk of equippedPerks) {
    const definition = perkById.get(perk.id);
    if (!definition) {
      continue;
    }
    if (!unlockedSet.has(perk.id)) {
      continue;
    }
    const normalizedLevel = clampNumber(
      Math.trunc(perk.level),
      1,
      definition.maxLevel
    );
    if (next.some((existing) => existing.id === perk.id)) {
      continue;
    }
    next.push({ id: perk.id, level: normalizedLevel });
    if (next.length >= 3) {
      break;
    }
  }

  return next;
};

const createDefaultMeta = (username: string): StoredMeta => {
  const level = 1;
  return {
    username,
    level,
    xp: 0,
    currency: 0,
    streak: 0,
    equippedPerks: [],
    unlockedPerkIds: getDefaultUnlockedPerkIds(level),
    lifetimeRuns: 0,
    lifetimeBestScore: 0,
    questProgress: {},
    challengeClaims: {},
    updatedAt: Date.now(),
  };
};

const parseStoredQuestProgress = (value: unknown): StoredQuestProgress | null => {
  if (!isJsonRecord(value)) {
    return null;
  }
  if (typeof value.key !== 'string') {
    return null;
  }
  if (typeof value.progress !== 'number' || !Number.isFinite(value.progress)) {
    return null;
  }
  if (typeof value.claimed !== 'boolean') {
    return null;
  }

  return {
    key: value.key,
    progress: value.progress,
    claimed: value.claimed,
  };
};

const parseStoredMeta = (
  raw: string | undefined,
  username: string
): StoredMeta => {
  if (!raw) {
    return createDefaultMeta(username);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isJsonRecord(parsed)) {
      return createDefaultMeta(username);
    }

    const base = createDefaultMeta(username);

    if (typeof parsed.username === 'string') {
      base.username = parsed.username;
    }
    if (typeof parsed.level === 'number' && Number.isFinite(parsed.level)) {
      base.level = clampNumber(Math.trunc(parsed.level), 1, 999);
    }
    if (typeof parsed.xp === 'number' && Number.isFinite(parsed.xp)) {
      base.xp = Math.max(0, Math.trunc(parsed.xp));
    }
    if (typeof parsed.currency === 'number' && Number.isFinite(parsed.currency)) {
      base.currency = Math.max(0, Math.trunc(parsed.currency));
    }
    if (typeof parsed.streak === 'number' && Number.isFinite(parsed.streak)) {
      base.streak = Math.max(0, Math.trunc(parsed.streak));
    }
    if (
      typeof parsed.lifetimeRuns === 'number' &&
      Number.isFinite(parsed.lifetimeRuns)
    ) {
      base.lifetimeRuns = Math.max(0, Math.trunc(parsed.lifetimeRuns));
    }
    if (
      typeof parsed.lifetimeBestScore === 'number' &&
      Number.isFinite(parsed.lifetimeBestScore)
    ) {
      base.lifetimeBestScore = Math.max(0, Math.trunc(parsed.lifetimeBestScore));
    }
    if (typeof parsed.lastPlayedDay === 'string') {
      base.lastPlayedDay = parsed.lastPlayedDay;
    }
    if (typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)) {
      base.updatedAt = parsed.updatedAt;
    }

    if (isStringArray(parsed.unlockedPerkIds)) {
      base.unlockedPerkIds = Array.from(
        new Set(
          parsed.unlockedPerkIds.filter((perkId) => perkById.has(perkId))
        )
      );
    }

    if (Array.isArray(parsed.equippedPerks)) {
      const loaded: EquippedPerk[] = [];
      for (const item of parsed.equippedPerks) {
        if (!isJsonRecord(item)) {
          continue;
        }
        if (typeof item.id !== 'string') {
          continue;
        }
        if (typeof item.level !== 'number' || !Number.isFinite(item.level)) {
          continue;
        }
        loaded.push({ id: item.id, level: item.level });
      }
      base.equippedPerks = loaded;
    }

    if (isJsonRecord(parsed.questProgress)) {
      const nextQuestProgress: Record<string, StoredQuestProgress> = {};
      for (const [key, value] of Object.entries(parsed.questProgress)) {
        const entry = parseStoredQuestProgress(value);
        if (!entry) {
          continue;
        }
        nextQuestProgress[key] = entry;
      }
      base.questProgress = nextQuestProgress;
    }

    if (isJsonRecord(parsed.challengeClaims)) {
      const nextChallengeClaims: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(parsed.challengeClaims)) {
        if (typeof value === 'boolean') {
          nextChallengeClaims[key] = value;
        }
      }
      base.challengeClaims = nextChallengeClaims;
    }

    const defaultUnlocked = getDefaultUnlockedPerkIds(base.level);
    base.unlockedPerkIds = Array.from(
      new Set([...base.unlockedPerkIds, ...defaultUnlocked])
    );
    base.equippedPerks = normalizeEquippedPerks(
      base.unlockedPerkIds,
      base.equippedPerks
    );

    return base;
  } catch (error) {
    console.error('Failed to parse stored meta:', error);
    return createDefaultMeta(username);
  }
};

const toPlayerMetaState = (meta: StoredMeta): PlayerMetaState => ({
  username: meta.username,
  level: meta.level,
  xp: meta.xp,
  xpToNextLevel: xpToNextLevel(meta.level),
  currency: meta.currency,
  streak: meta.streak,
  equippedPerks: meta.equippedPerks,
  unlockedPerkIds: meta.unlockedPerkIds,
  lifetimeRuns: meta.lifetimeRuns,
  lifetimeBestScore: meta.lifetimeBestScore,
  ...(meta.lastPlayedDay ? { lastPlayedDay: meta.lastPlayedDay } : {}),
  updatedAt: meta.updatedAt,
});

const normalizeQuestProgress = (meta: StoredMeta, timestamp: number): void => {
  for (const template of QUEST_TEMPLATES) {
    const cycleKey = getQuestCycleKey(template.scope, timestamp);
    const current = meta.questProgress[template.id];

    if (!current || current.key !== cycleKey) {
      meta.questProgress[template.id] = {
        key: cycleKey,
        progress: 0,
        claimed: false,
      };
    }
  }
};

const buildQuestSnapshot = (meta: StoredMeta, timestamp: number): PlayerQuest[] => {
  normalizeQuestProgress(meta, timestamp);

  return QUEST_TEMPLATES.map((template) => {
    const progressState = meta.questProgress[template.id];
    const progress = progressState ? progressState.progress : 0;
    const completed = progress >= template.target;
    const claimable = completed && progressState ? !progressState.claimed : false;
    return {
      id: template.id,
      scope: template.scope,
      title: template.title,
      description: template.description,
      target: template.target,
      progress,
      rewardCurrency: template.rewardCurrency,
      completed,
      claimable,
    };
  });
};

const saveMeta = async (
  postId: string,
  username: string,
  meta: StoredMeta
): Promise<void> => {
  meta.updatedAt = Date.now();
  await redis.set(metaKey(postId, username), JSON.stringify(meta));
};

const getMeta = async (postId: string, username: string): Promise<StoredMeta> => {
  const raw = await redis.get(metaKey(postId, username));
  return parseStoredMeta(raw, username);
};

const ensureLeaderboardBest = async (
  postId: string,
  username: string,
  score: number
): Promise<number> => {
  const lbKey = leaderboardKey(postId);
  const existing = await redis.zScore(lbKey, username);
  const best =
    existing !== undefined && existing !== null
      ? Math.max(Number(existing), score)
      : score;
  await redis.zAdd(lbKey, { score: best, member: username });
  return best;
};

const buildMetaResponse = async (
  postId: string,
  username: string,
  limit = 10
): Promise<MetaResponse> => {
  const meta = await getMeta(postId, username);
  const now = Date.now();
  normalizeQuestProgress(meta, now);
  meta.unlockedPerkIds = Array.from(
    new Set([...meta.unlockedPerkIds, ...getDefaultUnlockedPerkIds(meta.level)])
  );
  meta.equippedPerks = normalizeEquippedPerks(
    meta.unlockedPerkIds,
    meta.equippedPerks
  );
  await saveMeta(postId, username, meta);

  const dailyChallenge = getDailyChallenge(now);
  const weeklyChallenge = getWeeklyChallenge(now);

  const activeChallenges: ChallengeSnapshot[] = [
    {
      ...dailyChallenge,
      completed: meta.challengeClaims[`daily:${dailyChallenge.key}`] ?? false,
    },
    {
      ...weeklyChallenge,
      completed: meta.challengeClaims[`weekly:${weeklyChallenge.key}`] ?? false,
    },
  ];

  return {
    profile: toPlayerMetaState(meta),
    quests: buildQuestSnapshot(meta, now),
    activeChallenges,
    catalog,
    leaderboard: await getLeaderboardSnapshot(postId, username, limit),
    generatedAt: now,
  };
};

const createTicket = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const randomPart = Math.random().toString(16).slice(2);
  return `ticket-${Date.now().toString(16)}-${randomPart}`;
};

const parseRunSession = (raw: string | undefined): StoredRunSession | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isJsonRecord(parsed)) {
      return null;
    }

    if (
      typeof parsed.ticket !== 'string' ||
      typeof parsed.mode !== 'string' ||
      !isStringArray(parsed.offeredMutatorIds) ||
      !isStringArray(parsed.defaultMutatorIds) ||
      !isStringArray(parsed.selectedPerkIds) ||
      typeof parsed.seed !== 'number' ||
      typeof parsed.startedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }

    if (
      parsed.mode !== 'normal' &&
      parsed.mode !== 'daily' &&
      parsed.mode !== 'weekly'
    ) {
      return null;
    }

    const next: StoredRunSession = {
      ticket: parsed.ticket,
      mode: parsed.mode,
      seed: parsed.seed,
      offeredMutatorIds: parsed.offeredMutatorIds,
      defaultMutatorIds: parsed.defaultMutatorIds,
      selectedPerkIds: parsed.selectedPerkIds,
      startedAt: parsed.startedAt,
      expiresAt: parsed.expiresAt,
      ...(typeof parsed.challengeKey === 'string'
        ? { challengeKey: parsed.challengeKey }
        : {}),
    };

    return next;
  } catch (error) {
    console.error('Failed to parse run session:', error);
    return null;
  }
};

const calculatePerkBonus = (
  selectedPerkIds: string[],
  streak: number,
  mutatorIds: string[],
  survivedSeconds?: number
): number => {
  let bonus = 0;
  const riskCount = mutatorIds.reduce((count, id) => {
    const definition = mutatorById.get(id);
    if (definition && definition.difficulty >= 2) {
      return count + 1;
    }
    return count;
  }, 0);

  for (const perkId of selectedPerkIds) {
    switch (perkId) {
      case 'arc_synth':
        bonus += 0.12;
        break;
      case 'volatile_matrix':
        bonus += 0.06 * riskCount;
        break;
      case 'streak_resonator':
        if (streak >= 3) {
          bonus += 0.1;
        }
        break;
      case 'tempo_core':
        if (survivedSeconds !== undefined && survivedSeconds >= 120) {
          bonus += 0.08;
        }
        break;
      default:
        break;
    }
  }

  return clampNumber(bonus, 0, 0.75);
};

const mergeMutatorSelection = (
  offeredMutatorIds: string[],
  fallbackMutatorIds: string[],
  requestedMutatorIds: string[] | undefined
): string[] => {
  const offeredSet = new Set(offeredMutatorIds);
  const selectedFromRequest: string[] = [];
  if (requestedMutatorIds) {
    for (const mutatorId of requestedMutatorIds) {
      if (offeredSet.has(mutatorId) && !selectedFromRequest.includes(mutatorId)) {
        selectedFromRequest.push(mutatorId);
      }
    }
  }

  if (selectedFromRequest.length > 0) {
    return selectedFromRequest;
  }

  return fallbackMutatorIds;
};

const applyQuestProgressAndRewards = (
  meta: StoredMeta,
  timestamp: number,
  adjustedScore: number
): { quests: PlayerQuest[]; questCurrencyBonus: number; completedQuestIds: string[] } => {
  normalizeQuestProgress(meta, timestamp);
  let questCurrencyBonus = 0;
  const completedQuestIds: string[] = [];

  for (const template of QUEST_TEMPLATES) {
    const progressState = meta.questProgress[template.id];
    if (!progressState) {
      continue;
    }

    const delta = template.metric === 'score' ? adjustedScore : 1;
    progressState.progress += delta;

    if (!progressState.claimed && progressState.progress >= template.target) {
      progressState.claimed = true;
      questCurrencyBonus += template.rewardCurrency;
      completedQuestIds.push(template.id);
    }
  }

  return {
    quests: buildQuestSnapshot(meta, timestamp),
    questCurrencyBonus,
    completedQuestIds,
  };
};

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const username = await reddit.getCurrentUsername();
    const currentUsername = username ?? 'anonymous';

    let snoovatarUrl = '';
    if (username && context.userId) {
      const user = await reddit.getUserById(context.userId);
      if (user) {
        snoovatarUrl = (await user.getSnoovatarUrl()) ?? '';
      }
    }

    const state = parseStoredState(
      await redis.get(stateKey(postId, currentUsername))
    );
    const previousTime = state
      ? new Date(state.updatedAt).toISOString()
      : ((await redis.get(`${postId}:${currentUsername}`)) ?? '');
    const leaderboard = await getLeaderboardSnapshot(
      postId,
      currentUsername,
      10
    );

    return c.json<InitResponse>({
      type: 'init',
      postId,
      username: currentUsername,
      snoovatarUrl,
      previousTime,
      state,
      leaderboard,
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

api.get('/state', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<SimpleErrorResponse>(
        { error: 'Missing postId in context' },
        400
      );
    }

    const username = await getUsername();
    const key = stateKey(postId, username);
    const state = parseStoredState(await redis.get(key));
    if (!state) {
      return c.json<SimpleErrorResponse>({ error: 'No state found' }, 404);
    }

    return c.json<StoredState>(state);
  } catch (error) {
    console.error('GET /api/state error:', error);
    return c.json<SimpleErrorResponse>({ error: 'Failed to fetch state' }, 500);
  }
});

api.post('/state', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<SimpleErrorResponse>(
        { error: 'Missing postId in context' },
        400
      );
    }

    const username = await getUsername();
    if (username === 'anonymous') {
      return c.json<SimpleErrorResponse>({ error: 'Login required' }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      console.error('Invalid JSON body for state', error);
      return c.json<SimpleErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    if (!isJsonRecord(body)) {
      return c.json<SimpleErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    const payload: StateUpsertRequest = {};
    if (body.level !== undefined) {
      if (typeof body.level !== 'number' || !Number.isFinite(body.level)) {
        return c.json<SimpleErrorResponse>(
          { error: 'level must be a finite number' },
          400
        );
      }
      payload.level = body.level;
    }
    if (body.data !== undefined) {
      if (!isJsonRecord(body.data)) {
        return c.json<SimpleErrorResponse>(
          { error: 'data must be an object' },
          400
        );
      }
      payload.data = body.data;
    }
    if (payload.level === undefined && payload.data === undefined) {
      return c.json<SimpleErrorResponse>(
        { error: 'Provide at least one of level or data' },
        400
      );
    }

    const key = stateKey(postId, username);
    const prev = parseStoredState(await redis.get(key));
    const next: StoredState = {
      username,
      updatedAt: Date.now(),
      ...(typeof payload.level === 'number'
        ? { level: payload.level }
        : prev?.level !== undefined
          ? { level: prev.level }
          : {}),
      ...(payload.data !== undefined
        ? { data: payload.data }
        : prev?.data !== undefined
          ? { data: prev.data }
          : {}),
      ...(prev?.bestScore !== undefined ? { bestScore: prev.bestScore } : {}),
    };

    await redis.set(key, JSON.stringify(next));
    return c.json<StoredState>(next);
  } catch (error) {
    console.error('POST /api/state error:', error);
    return c.json<SimpleErrorResponse>({ error: 'Failed to save state' }, 500);
  }
});

api.post('/score', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<SimpleErrorResponse>(
        { error: 'Missing postId in context' },
        400
      );
    }

    const username = await getUsername();
    if (username === 'anonymous') {
      return c.json<SimpleErrorResponse>({ error: 'Login required' }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      console.error('Invalid JSON body for score', error);
      return c.json<SimpleErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    if (!isJsonRecord(body)) {
      return c.json<SimpleErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    const { score } = body;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return c.json<SimpleErrorResponse>(
        { error: 'score must be a finite number' },
        400
      );
    }

    const sanitized = clampNumber(score, 0, 1_000_000_000);
    const best = await ensureLeaderboardBest(postId, username, sanitized);

    const sKey = stateKey(postId, username);
    const prev = parseStoredState(await redis.get(sKey));
    const next: StoredState = {
      username,
      updatedAt: Date.now(),
      ...(prev?.level !== undefined ? { level: prev.level } : {}),
      ...(prev?.data !== undefined ? { data: prev.data } : {}),
      bestScore: best,
    };
    await redis.set(sKey, JSON.stringify(next));

    return c.json<ScoreSubmitResponse>({
      username,
      score: best,
      updatedAt: next.updatedAt,
    });
  } catch (error) {
    console.error('POST /api/score error:', error);
    return c.json<SimpleErrorResponse>(
      { error: 'Failed to submit score' },
      500
    );
  }
});

api.get('/leaderboard', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<SimpleErrorResponse>(
        { error: 'Missing postId in context' },
        400
      );
    }

    const username = await getUsername();
    const limitParam = Number(c.req.query('limit') ?? 10);
    const limit = Number.isFinite(limitParam)
      ? clampNumber(limitParam, 1, 100)
      : 10;

    const leaderboard = await getLeaderboardSnapshot(postId, username, limit);
    return c.json<LeaderboardResponse>(leaderboard);
  } catch (error) {
    console.error('GET /api/leaderboard error:', error);
    return c.json<SimpleErrorResponse>(
      { error: 'Failed to fetch leaderboard' },
      500
    );
  }
});

api.get('/meta', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<SimpleErrorResponse>(
        { error: 'Missing postId in context' },
        400
      );
    }

    const username = await getUsername();
    if (username === 'anonymous') {
      const now = Date.now();
      const daily = getDailyChallenge(now);
      const weekly = getWeeklyChallenge(now);
      return c.json<MetaResponse>({
        profile: toPlayerMetaState(createDefaultMeta(username)),
        quests: [],
        activeChallenges: [daily, weekly],
        catalog,
        leaderboard: await getLeaderboardSnapshot(postId, username, 10),
        generatedAt: now,
      });
    }

    return c.json<MetaResponse>(await buildMetaResponse(postId, username, 10));
  } catch (error) {
    console.error('GET /api/meta error:', error);
    return c.json<SimpleErrorResponse>(
      { error: 'Failed to fetch gameplay meta' },
      500
    );
  }
});

api.post('/meta/perk/equip', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<SimpleErrorResponse>(
        { error: 'Missing postId in context' },
        400
      );
    }

    const username = await getUsername();
    if (username === 'anonymous') {
      return c.json<SimpleErrorResponse>({ error: 'Login required' }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      console.error('Invalid JSON body for perk equip', error);
      return c.json<SimpleErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    if (!isJsonRecord(body) || typeof body.perkId !== 'string') {
      return c.json<SimpleErrorResponse>(
        { error: 'perkId is required' },
        400
      );
    }

    const payload: PerkEquipRequest = { perkId: body.perkId };
    const definition = perkById.get(payload.perkId);
    if (!definition) {
      return c.json<SimpleErrorResponse>({ error: 'Unknown perkId' }, 400);
    }

    const meta = await getMeta(postId, username);
    meta.unlockedPerkIds = Array.from(
      new Set([...meta.unlockedPerkIds, ...getDefaultUnlockedPerkIds(meta.level)])
    );

    if (!meta.unlockedPerkIds.includes(payload.perkId)) {
      return c.json<SimpleErrorResponse>(
        { error: `Perk ${payload.perkId} is locked at current level` },
        400
      );
    }

    const alreadyEquippedIndex = meta.equippedPerks.findIndex(
      (perk) => perk.id === payload.perkId
    );
    if (alreadyEquippedIndex >= 0) {
      meta.equippedPerks.splice(alreadyEquippedIndex, 1);
    } else {
      if (meta.equippedPerks.length >= 3) {
        return c.json<SimpleErrorResponse>(
          { error: 'Maximum 3 perks can be equipped' },
          400
        );
      }
      meta.equippedPerks.push({ id: payload.perkId, level: 1 });
    }

    meta.equippedPerks = normalizeEquippedPerks(
      meta.unlockedPerkIds,
      meta.equippedPerks
    );
    await saveMeta(postId, username, meta);

    const response: PerkEquipResponse = {
      profile: toPlayerMetaState(meta),
      equippedPerks: meta.equippedPerks,
    };
    return c.json<PerkEquipResponse>(response);
  } catch (error) {
    console.error('POST /api/meta/perk/equip error:', error);
    return c.json<SimpleErrorResponse>(
      { error: 'Failed to equip perk' },
      500
    );
  }
});

api.post('/run/start', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<SimpleErrorResponse>(
        { error: 'Missing postId in context' },
        400
      );
    }

    const username = await getUsername();
    if (username === 'anonymous') {
      return c.json<SimpleErrorResponse>({ error: 'Login required' }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      console.error('Invalid JSON body for run start', error);
      return c.json<SimpleErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    const payload: RunStartRequest = {};
    if (isJsonRecord(body)) {
      if (body.mode === 'normal' || body.mode === 'daily' || body.mode === 'weekly') {
        payload.mode = body.mode;
      }
      if (body.selectedPerkIds !== undefined && isStringArray(body.selectedPerkIds)) {
        payload.selectedPerkIds = body.selectedPerkIds;
      }
    }

    const mode: ChallengeMode = payload.mode ?? 'normal';
    const meta = await getMeta(postId, username);
    const now = Date.now();
    meta.unlockedPerkIds = Array.from(
      new Set([...meta.unlockedPerkIds, ...getDefaultUnlockedPerkIds(meta.level)])
    );
    meta.equippedPerks = normalizeEquippedPerks(
      meta.unlockedPerkIds,
      meta.equippedPerks
    );

    const selectedPerkIds = payload.selectedPerkIds
      ? payload.selectedPerkIds.filter((perkId) =>
          meta.unlockedPerkIds.includes(perkId)
        )
      : meta.equippedPerks.map((perk) => perk.id);

    const challenge =
      mode === 'daily'
        ? getDailyChallenge(now)
        : mode === 'weekly'
          ? getWeeklyChallenge(now)
          : undefined;

    const challengeKey = challenge ? `${challenge.mode}:${challenge.key}` : undefined;
    const seed = hashString(
      `${postId}:${username}:${mode}:${challengeKey ?? 'normal'}:${now}`
    );
    const offeredMutatorIds = pickUniqueMutators(seed, 3);
    const defaultMutatorIds = offeredMutatorIds.slice(0, 2);
    const ticket = createTicket();
    const expiresAt = now + 20 * 60 * 1000;

    const session: StoredRunSession = {
      ticket,
      mode,
      seed,
      offeredMutatorIds,
      defaultMutatorIds,
      selectedPerkIds,
      ...(challengeKey ? { challengeKey } : {}),
      startedAt: now,
      expiresAt,
    };

    await redis.set(runSessionKey(postId, username, ticket), JSON.stringify(session));
    await saveMeta(postId, username, meta);

    const response: RunStartResponse = {
      ticket,
      mode,
      seed,
      offeredMutatorIds,
      defaultMutatorIds,
      ...(challenge ? { challenge } : {}),
      startedAt: now,
      expiresAt,
      profile: toPlayerMetaState(meta),
    };

    return c.json<RunStartResponse>(response);
  } catch (error) {
    console.error('POST /api/run/start error:', error);
    return c.json<SimpleErrorResponse>(
      { error: 'Failed to start run' },
      500
    );
  }
});

api.post('/run/complete', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<SimpleErrorResponse>(
        { error: 'Missing postId in context' },
        400
      );
    }

    const username = await getUsername();
    if (username === 'anonymous') {
      return c.json<SimpleErrorResponse>({ error: 'Login required' }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      console.error('Invalid JSON body for run complete', error);
      return c.json<SimpleErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    if (!isJsonRecord(body)) {
      return c.json<SimpleErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }
    if (typeof body.ticket !== 'string') {
      return c.json<SimpleErrorResponse>({ error: 'ticket is required' }, 400);
    }
    if (typeof body.score !== 'number' || !Number.isFinite(body.score)) {
      return c.json<SimpleErrorResponse>(
        { error: 'score must be a finite number' },
        400
      );
    }

    const payload: RunCompleteRequest = {
      ticket: body.ticket,
      score: body.score,
    };
    if (
      body.survivedSeconds !== undefined &&
      typeof body.survivedSeconds === 'number' &&
      Number.isFinite(body.survivedSeconds)
    ) {
      payload.survivedSeconds = body.survivedSeconds;
    }
    if (body.selectedMutatorIds !== undefined && isStringArray(body.selectedMutatorIds)) {
      payload.selectedMutatorIds = body.selectedMutatorIds;
    }
    if (body.stats !== undefined && isJsonRecord(body.stats)) {
      payload.stats = body.stats;
    }

    const sessionKey = runSessionKey(postId, username, payload.ticket);
    const session = parseRunSession(await redis.get(sessionKey));
    if (!session) {
      return c.json<SimpleErrorResponse>(
        { error: 'Run session not found or expired' },
        404
      );
    }

    const now = Date.now();
    if (now > session.expiresAt) {
      await redis.del(sessionKey);
      return c.json<SimpleErrorResponse>({ error: 'Run session expired' }, 410);
    }

    const baseScore = clampNumber(Math.trunc(payload.score), 0, 1_000_000_000);
    const selectedMutatorIds = mergeMutatorSelection(
      session.offeredMutatorIds,
      session.defaultMutatorIds,
      payload.selectedMutatorIds
    );

    const mutatorDefinitions = selectedMutatorIds
      .map((mutatorId) => mutatorById.get(mutatorId))
      .filter((definition): definition is MutatorDefinition => definition !== undefined);

    const mutatorMultiplier = mutatorDefinitions.reduce(
      (multiplier, definition) => multiplier * definition.scoreMultiplier,
      1
    );

    const modeMultiplier = session.mode === 'normal' ? 1 : session.mode === 'daily' ? 1.15 : 1.3;

    const meta = await getMeta(postId, username);
    normalizeQuestProgress(meta, now);
    const dayKey = getDayKey(now);
    if (!meta.lastPlayedDay) {
      meta.streak = 1;
    } else if (meta.lastPlayedDay === dayKey) {
      meta.streak = Math.max(1, meta.streak);
    } else {
      const previousDay = addDaysToDayKey(dayKey, -1);
      meta.streak = meta.lastPlayedDay === previousDay ? meta.streak + 1 : 1;
    }
    meta.lastPlayedDay = dayKey;

    const perkBonus = calculatePerkBonus(
      session.selectedPerkIds,
      meta.streak,
      selectedMutatorIds,
      payload.survivedSeconds
    );
    const streakBonus = meta.streak >= 3 ? 0.1 : 0;

    const adjustedScore = Math.max(
      1,
      Math.trunc(baseScore * mutatorMultiplier * modeMultiplier)
    );

    let challengeBonusCurrency = 0;
    const completedChallenges: string[] = [];

    if (session.mode === 'daily' || session.mode === 'weekly') {
      const challenge =
        session.mode === 'daily' ? getDailyChallenge(now) : getWeeklyChallenge(now);
      const challengeKey = `${challenge.mode}:${challenge.key}`;
      const alreadyClaimed = meta.challengeClaims[challengeKey] ?? false;
      if (!alreadyClaimed && adjustedScore >= challenge.targetScore) {
        meta.challengeClaims[challengeKey] = true;
        challengeBonusCurrency = challenge.rewardBonus;
        completedChallenges.push(challengeKey);
      }
      await redis.zAdd(
        challengeLeaderboardKey(postId, session.mode, challenge.key),
        { score: adjustedScore, member: username }
      );
    }

    const xpBase = Math.max(10, Math.trunc(Math.sqrt(baseScore + 1) * 18));
    const xpGained = Math.max(
      10,
      Math.trunc(xpBase * modeMultiplier * (1 + perkBonus + streakBonus))
    );
    const currencyBase = Math.max(
      5,
      Math.trunc(baseScore / 700 + mutatorDefinitions.length * 4)
    );
    let currencyGained = Math.max(
      5,
      Math.trunc(currencyBase * (1 + streakBonus + perkBonus))
    );

    meta.xp += xpGained;
    let levelUps = 0;
    while (meta.xp >= xpToNextLevel(meta.level)) {
      meta.xp -= xpToNextLevel(meta.level);
      meta.level += 1;
      levelUps += 1;
      meta.currency += 25;
    }

    meta.unlockedPerkIds = Array.from(
      new Set([...meta.unlockedPerkIds, ...getDefaultUnlockedPerkIds(meta.level)])
    );
    meta.equippedPerks = normalizeEquippedPerks(
      meta.unlockedPerkIds,
      meta.equippedPerks
    );

    meta.lifetimeRuns += 1;
    meta.lifetimeBestScore = Math.max(meta.lifetimeBestScore, adjustedScore);

    const questResult = applyQuestProgressAndRewards(meta, now, adjustedScore);
    currencyGained += challengeBonusCurrency + questResult.questCurrencyBonus;
    meta.currency += currencyGained;

    const bestScore = await ensureLeaderboardBest(postId, username, adjustedScore);

    const legacyState = parseStoredState(await redis.get(stateKey(postId, username)));
    const nextState: StoredState = {
      username,
      updatedAt: now,
      ...(legacyState?.level !== undefined ? { level: legacyState.level } : {}),
      ...(legacyState?.data !== undefined ? { data: legacyState.data } : {}),
      bestScore,
    };
    await redis.set(stateKey(postId, username), JSON.stringify(nextState));
    await saveMeta(postId, username, meta);
    await redis.del(sessionKey);

    const reward: RunRewardBreakdown = {
      xpGained,
      currencyGained,
      scoreMultiplier: Number((mutatorMultiplier * modeMultiplier).toFixed(3)),
      streakBonus,
      challengeBonus: challengeBonusCurrency,
      perkBonus,
      levelUps,
    };

    const response: RunCompleteResponse = {
      mode: session.mode,
      score: adjustedScore,
      bestScore,
      reward,
      profile: toPlayerMetaState(meta),
      leaderboard: await getLeaderboardSnapshot(postId, username, 10),
      quests: questResult.quests,
      runSummary: {
        mutatorIds: selectedMutatorIds,
        completedChallenges: [...completedChallenges, ...questResult.completedQuestIds],
      },
      completedAt: now,
    };

    return c.json<RunCompleteResponse>(response);
  } catch (error) {
    console.error('POST /api/run/complete error:', error);
    return c.json<SimpleErrorResponse>(
      { error: 'Failed to complete run' },
      500
    );
  }
});
