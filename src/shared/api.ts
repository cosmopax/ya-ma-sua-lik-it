export type StoredState = {
  username: string;
  level?: number;
  bestScore?: number;
  data?: Record<string, unknown>;
  updatedAt: number;
};

export type StateUpsertRequest = {
  level?: number;
  data?: Record<string, unknown>;
};

export type ScoreSubmitRequest = {
  score: number;
};

export type ScoreSubmitResponse = {
  username: string;
  score: number;
  updatedAt: number;
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
};

export type LeaderboardResponse = {
  top: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  totalPlayers: number;
  generatedAt: number;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
  snoovatarUrl: string;
  previousTime: string;
  state: StoredState | null;
  leaderboard: LeaderboardResponse;
};

export type ChallengeMode = 'normal' | 'daily' | 'weekly';

export type MutatorDefinition = {
  id: string;
  name: string;
  description: string;
  scoreMultiplier: number;
  difficulty: number;
  theme: 'risk' | 'speed' | 'precision' | 'endurance';
};

export type PerkDefinition = {
  id: string;
  name: string;
  description: string;
  unlockLevel: number;
  maxLevel: number;
};

export type EquippedPerk = {
  id: string;
  level: number;
};

export type PlayerMetaState = {
  username: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  currency: number;
  streak: number;
  equippedPerks: EquippedPerk[];
  unlockedPerkIds: string[];
  lifetimeRuns: number;
  lifetimeBestScore: number;
  lastPlayedDay?: string;
  updatedAt: number;
};

export type PlayerQuest = {
  id: string;
  scope: 'daily' | 'weekly';
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardCurrency: number;
  completed: boolean;
  claimable: boolean;
};

export type ChallengeSnapshot = {
  mode: Exclude<ChallengeMode, 'normal'>;
  key: string;
  title: string;
  description: string;
  mutatorIds: string[];
  targetScore: number;
  rewardBonus: number;
  expiresAt: number;
  completed?: boolean;
};

export type GameplayCatalog = {
  mutators: MutatorDefinition[];
  perks: PerkDefinition[];
};

export type MetaResponse = {
  profile: PlayerMetaState;
  quests: PlayerQuest[];
  activeChallenges: ChallengeSnapshot[];
  catalog: GameplayCatalog;
  leaderboard: LeaderboardResponse;
  generatedAt: number;
};

export type RunStartRequest = {
  mode?: ChallengeMode;
  selectedPerkIds?: string[];
};

export type RunStartResponse = {
  ticket: string;
  mode: ChallengeMode;
  seed: number;
  offeredMutatorIds: string[];
  defaultMutatorIds: string[];
  challenge?: ChallengeSnapshot;
  startedAt: number;
  expiresAt: number;
  profile: PlayerMetaState;
};

export type RunCompleteRequest = {
  ticket: string;
  score: number;
  survivedSeconds?: number;
  selectedMutatorIds?: string[];
  stats?: Record<string, unknown>;
};

export type RunRewardBreakdown = {
  xpGained: number;
  currencyGained: number;
  scoreMultiplier: number;
  streakBonus: number;
  challengeBonus: number;
  perkBonus: number;
  levelUps: number;
};

export type RunCompleteResponse = {
  mode: ChallengeMode;
  score: number;
  bestScore: number;
  reward: RunRewardBreakdown;
  profile: PlayerMetaState;
  leaderboard: LeaderboardResponse;
  quests: PlayerQuest[];
  runSummary: {
    mutatorIds: string[];
    completedChallenges: string[];
  };
  completedAt: number;
};

export type PerkEquipRequest = {
  perkId: string;
};

export type PerkEquipResponse = {
  profile: PlayerMetaState;
  equippedPerks: EquippedPerk[];
};
