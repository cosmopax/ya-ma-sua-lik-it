import type {
  ChallengeMode,
  InitResponse,
  LeaderboardResponse,
  MetaResponse,
  PerkEquipResponse,
  RunCompleteRequest,
  RunCompleteResponse,
  RunStartResponse,
  ScoreSubmitResponse,
  StateUpsertRequest,
  StoredState,
} from '../shared/api';
import {
  completeRun,
  equipPerk,
  fetchLeaderboard,
  fetchMeta,
  fetchState,
  startRun,
  submitScore,
  upsertState,
} from './devvit-api';

const getElement = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
};

const getOptionalElement = (id: string): HTMLElement | null => {
  const element = document.getElementById(id);
  if (!element) {
    return null;
  }
  return element instanceof HTMLElement ? element : null;
};

const getButton = (id: string): HTMLButtonElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing required button #${id}`);
  }
  return element;
};

const getOptionalButton = (id: string): HTMLButtonElement | null => {
  const element = document.getElementById(id);
  if (!element) {
    return null;
  }
  return element instanceof HTMLButtonElement ? element : null;
};

const getInput = (id: string): HTMLInputElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing required input #${id}`);
  }
  return element;
};

const getOptionalInput = (id: string): HTMLInputElement | null => {
  const element = document.getElementById(id);
  if (!element) {
    return null;
  }
  return element instanceof HTMLInputElement ? element : null;
};

const getOptionalSelect = (id: string): HTMLSelectElement | null => {
  const element = document.getElementById(id);
  if (!element) {
    return null;
  }
  return element instanceof HTMLSelectElement ? element : null;
};

const getList = (id: string): HTMLUListElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLUListElement)) {
    throw new Error(`Missing required list #${id}`);
  }
  return element;
};

const getOptionalList = (id: string): HTMLUListElement | null => {
  const element = document.getElementById(id);
  if (!element) {
    return null;
  }
  return element instanceof HTMLUListElement ? element : null;
};

const extractNote = (state: StoredState | null): string => {
  if (!state?.data) {
    return '';
  }
  const note = state.data.note;
  return typeof note === 'string' ? note : '';
};

const emitEvent = <T>(name: string, detail: T): void => {
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
};

const normalizeMode = (value: string | undefined): ChallengeMode => {
  if (value === 'daily' || value === 'weekly' || value === 'normal') {
    return value;
  }
  return 'normal';
};

const shouldPreloadMeta = (): boolean => {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent.toLowerCase().includes('jsdom')
  ) {
    return false;
  }

  const protocol = window.location.protocol;
  return protocol === 'http:' || protocol === 'https:';
};

const parseSelectedMutators = (list: HTMLUListElement | null): string[] => {
  if (!list) {
    return [];
  }
  const checked = list.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"][data-mutator-id]:checked'
  );
  const selected: string[] = [];
  checked.forEach((checkbox) => {
    const id = checkbox.dataset.mutatorId;
    if (id && !selected.includes(id)) {
      selected.push(id);
    }
  });
  return selected;
};

class CompanionPanel {
  private readonly panel = getElement('devvit-panel');
  private readonly toggleButton = getButton('panel-toggle');
  private readonly status = getElement('panel-status');
  private readonly user = getElement('panel-user');
  private readonly best = getElement('panel-best');
  private readonly levelInput = getInput('panel-level');
  private readonly noteInput = getInput('panel-note');
  private readonly scoreInput = getInput('panel-score');
  private readonly saveButton = getButton('panel-save-state');
  private readonly loadButton = getButton('panel-load-state');
  private readonly submitButton = getButton('panel-submit-score');
  private readonly refreshButton = getButton('panel-refresh-lb');
  private readonly leaderboard = getList('panel-leaderboard');
  private readonly runModeSelect = getOptionalSelect('panel-run-mode');
  private readonly runStartButton = getOptionalButton('panel-start-run');
  private readonly runCompleteButton = getOptionalButton('panel-complete-run');
  private readonly survivalInput = getOptionalInput('panel-survival-seconds');
  private readonly runTicket = getOptionalElement('panel-run-ticket');
  private readonly profileLevel = getOptionalElement('panel-profile-level');
  private readonly profileXp = getOptionalElement('panel-profile-xp');
  private readonly profileCurrency = getOptionalElement('panel-profile-currency');
  private readonly profileStreak = getOptionalElement('panel-profile-streak');
  private readonly questsList = getOptionalList('panel-quests');
  private readonly challengesList = getOptionalList('panel-challenges');
  private readonly perksList = getOptionalList('panel-perks');
  private readonly mutatorsList = getOptionalList('panel-run-mutators');
  private currentState: StoredState | null;
  private currentLeaderboard: LeaderboardResponse;
  private currentMeta: MetaResponse | null = null;
  private activeRun: RunStartResponse | null = null;
  private readonly initData: InitResponse;

  constructor(initData: InitResponse) {
    this.initData = initData;
    this.currentState = initData.state;
    this.currentLeaderboard = initData.leaderboard;

    this.bindEvents();
    this.render();
    if (shouldPreloadMeta()) {
      void this.refreshMeta().catch((error: unknown) => {
        console.warn('Meta preload failed:', error);
      });
    }
  }

  getInitData(): InitResponse {
    return this.initData;
  }

  async refreshLeaderboard(limit = 10): Promise<LeaderboardResponse> {
    const leaderboard = await fetchLeaderboard(limit);
    this.currentLeaderboard = leaderboard;
    this.renderLeaderboard();
    emitEvent('devvit:leaderboard', leaderboard);
    return leaderboard;
  }

  async saveState(payload: StateUpsertRequest): Promise<StoredState> {
    const state = await upsertState(payload);
    this.currentState = state;
    this.renderState();
    emitEvent('devvit:state', state);
    return state;
  }

  async loadState(): Promise<StoredState | null> {
    const state = await fetchState();
    this.currentState = state;
    this.renderState();
    if (state) {
      emitEvent('devvit:state', state);
    }
    return state;
  }

  async postScore(score: number): Promise<ScoreSubmitResponse> {
    const result = await submitScore(score);
    this.best.textContent = String(result.score);
    emitEvent('devvit:score', result);
    return result;
  }

  async refreshMeta(): Promise<MetaResponse> {
    const meta = await fetchMeta();
    this.currentMeta = meta;
    this.renderMeta();
    emitEvent('devvit:meta', meta);
    return meta;
  }

  async togglePerk(perkId: string): Promise<PerkEquipResponse> {
    const result = await equipPerk(perkId);
    if (this.currentMeta) {
      this.currentMeta.profile = result.profile;
    }
    await this.refreshMeta();
    return result;
  }

  async startGameplayRun(mode: ChallengeMode): Promise<RunStartResponse> {
    const selectedPerkIds =
      this.currentMeta?.profile.equippedPerks.map((perk) => perk.id) ?? [];
    const run = await startRun({
      mode,
      selectedPerkIds,
    });
    this.activeRun = run;
    this.renderActiveRun();
    emitEvent('devvit:run_started', run);
    return run;
  }

  async completeGameplayRun(
    score: number,
    survivedSeconds?: number,
    selectedMutatorIds?: string[]
  ): Promise<RunCompleteResponse> {
    if (!this.activeRun) {
      const mode = normalizeMode(this.runModeSelect?.value);
      await this.startGameplayRun(mode);
    }

    if (!this.activeRun) {
      throw new Error('No active run session');
    }

    const payload: RunCompleteRequest = {
      ticket: this.activeRun.ticket,
      score,
      ...(survivedSeconds !== undefined ? { survivedSeconds } : {}),
      ...(selectedMutatorIds && selectedMutatorIds.length > 0
        ? { selectedMutatorIds }
        : {}),
    };
    const result = await completeRun(payload);
    this.activeRun = null;

    this.currentLeaderboard = result.leaderboard;
    this.currentState = {
      username: result.profile.username,
      bestScore: result.bestScore,
      updatedAt: result.completedAt,
    };
    this.renderState();
    this.renderLeaderboard();
    this.renderActiveRun();
    await this.refreshMeta();
    emitEvent('devvit:run_completed', result);
    return result;
  }

  private bindEvents(): void {
    this.toggleButton.addEventListener('click', () => {
      this.panel.classList.toggle('collapsed');
      const expanded = !this.panel.classList.contains('collapsed');
      this.toggleButton.textContent = expanded ? 'Hide' : 'Show';
    });

    this.saveButton.addEventListener('click', () => {
      void this.handleSaveState();
    });

    this.loadButton.addEventListener('click', () => {
      void this.handleLoadState();
    });

    this.submitButton.addEventListener('click', () => {
      void this.handleSubmitScore();
    });

    this.refreshButton.addEventListener('click', () => {
      void this.handleRefreshLeaderboard();
    });

    this.runStartButton?.addEventListener('click', () => {
      void this.handleRunStart();
    });

    this.runCompleteButton?.addEventListener('click', () => {
      void this.handleRunComplete();
    });
  }

  private render(): void {
    this.user.textContent = this.initData.username;
    this.best.textContent =
      this.currentState?.bestScore !== undefined
        ? String(this.currentState.bestScore)
        : this.currentLeaderboard.me
          ? String(this.currentLeaderboard.me.score)
          : '-';
    this.renderState();
    this.renderLeaderboard();
    this.renderActiveRun();
    this.setStatus('Ready');
  }

  private renderState(): void {
    this.levelInput.value =
      this.currentState?.level !== undefined ? String(this.currentState.level) : '';
    this.noteInput.value = extractNote(this.currentState);
    if (this.currentState?.bestScore !== undefined) {
      this.best.textContent = String(this.currentState.bestScore);
    }
  }

  private renderLeaderboard(): void {
    this.leaderboard.innerHTML = '';

    if (this.currentLeaderboard.top.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = 'No scores yet';
      this.leaderboard.append(emptyItem);
      return;
    }

    for (const entry of this.currentLeaderboard.top) {
      const item = document.createElement('li');
      item.textContent = `${entry.rank}. ${entry.username} - ${entry.score}`;
      this.leaderboard.append(item);
    }
  }

  private renderMeta(): void {
    if (!this.currentMeta) {
      return;
    }

    if (this.profileLevel) {
      this.profileLevel.textContent = String(this.currentMeta.profile.level);
    }
    if (this.profileXp) {
      this.profileXp.textContent = `${this.currentMeta.profile.xp}/${this.currentMeta.profile.xpToNextLevel}`;
    }
    if (this.profileCurrency) {
      this.profileCurrency.textContent = String(this.currentMeta.profile.currency);
    }
    if (this.profileStreak) {
      this.profileStreak.textContent = String(this.currentMeta.profile.streak);
    }

    if (this.questsList) {
      this.questsList.innerHTML = '';
      for (const quest of this.currentMeta.quests) {
        const item = document.createElement('li');
        const state = quest.completed ? 'completed' : 'in progress';
        item.textContent = `${quest.title}: ${quest.progress}/${quest.target} (${state})`;
        this.questsList.append(item);
      }
    }

    if (this.challengesList) {
      this.challengesList.innerHTML = '';
      for (const challenge of this.currentMeta.activeChallenges) {
        const item = document.createElement('li');
        const status = challenge.completed ? 'done' : 'open';
        item.textContent = `${challenge.title} (${status}) target ${challenge.targetScore}`;
        this.challengesList.append(item);
      }
    }

    if (this.perksList) {
      const equipped = new Set(
        this.currentMeta.profile.equippedPerks.map((perk) => perk.id)
      );
      this.perksList.innerHTML = '';

      for (const perk of this.currentMeta.catalog.perks) {
        if (!this.currentMeta.profile.unlockedPerkIds.includes(perk.id)) {
          continue;
        }

        const item = document.createElement('li');
        const button = document.createElement('button');
        const isEquipped = equipped.has(perk.id);
        button.type = 'button';
        button.textContent = isEquipped
          ? `Unequip ${perk.name}`
          : `Equip ${perk.name}`;
        button.dataset.perkId = perk.id;
        button.addEventListener('click', () => {
          void this.handleTogglePerk(perk.id);
        });

        const label = document.createElement('span');
        label.textContent = perk.description;

        item.append(button, label);
        this.perksList.append(item);
      }
    }
  }

  private renderActiveRun(): void {
    if (this.runTicket) {
      this.runTicket.textContent = this.activeRun
        ? `Run: ${this.activeRun.mode} (${this.activeRun.ticket.slice(0, 8)}...)`
        : 'Run: none';
    }

    if (!this.mutatorsList) {
      return;
    }

    this.mutatorsList.innerHTML = '';
    if (!this.activeRun) {
      const empty = document.createElement('li');
      empty.textContent = 'Start a run to get mutators.';
      this.mutatorsList.append(empty);
      return;
    }

    const defaultSet = new Set(this.activeRun.defaultMutatorIds);
    for (const mutatorId of this.activeRun.offeredMutatorIds) {
      const item = document.createElement('li');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.mutatorId = mutatorId;
      checkbox.checked = defaultSet.has(mutatorId);

      const label = document.createElement('label');
      label.textContent = mutatorId.replaceAll('_', ' ');
      item.append(checkbox, label);
      this.mutatorsList.append(item);
    }
  }

  private setStatus(message: string, isError = false): void {
    this.status.textContent = message;
    this.status.dataset.state = isError ? 'error' : 'ok';
  }

  private async handleSaveState(): Promise<void> {
    const levelText = this.levelInput.value.trim();
    const note = this.noteInput.value.trim();
    const payload: StateUpsertRequest = {};

    if (levelText) {
      const level = Number(levelText);
      if (!Number.isFinite(level)) {
        this.setStatus('Level must be a number', true);
        return;
      }
      payload.level = level;
    }

    if (note) {
      payload.data = { note };
    }

    if (payload.level === undefined && payload.data === undefined) {
      this.setStatus('Add a level or note before saving', true);
      return;
    }

    try {
      await this.saveState(payload);
      this.setStatus('Checkpoint saved');
    } catch (error) {
      this.setStatus('Failed to save checkpoint', true);
      console.error('Save state failed:', error);
    }
  }

  private async handleLoadState(): Promise<void> {
    try {
      const state = await this.loadState();
      if (!state) {
        this.setStatus('No checkpoint found yet');
        return;
      }
      this.setStatus('Checkpoint loaded');
    } catch (error) {
      this.setStatus('Failed to load checkpoint', true);
      console.error('Load state failed:', error);
    }
  }

  private async handleSubmitScore(): Promise<void> {
    const scoreText = this.scoreInput.value.trim();
    const score = Number(scoreText);
    if (!scoreText || !Number.isFinite(score)) {
      this.setStatus('Score must be a number', true);
      return;
    }

    try {
      const result = await this.postScore(score);
      this.setStatus(`Score saved (${result.score})`);
      await this.refreshLeaderboard();
    } catch (error) {
      this.setStatus('Failed to submit score', true);
      console.error('Submit score failed:', error);
    }
  }

  private async handleRefreshLeaderboard(): Promise<void> {
    try {
      await this.refreshLeaderboard();
      this.setStatus('Leaderboard refreshed');
    } catch (error) {
      this.setStatus('Failed to refresh leaderboard', true);
      console.error('Refresh leaderboard failed:', error);
    }
  }

  private async handleTogglePerk(perkId: string): Promise<void> {
    try {
      await this.togglePerk(perkId);
      this.setStatus(`Perk updated: ${perkId}`);
    } catch (error) {
      this.setStatus('Failed to update perk', true);
      console.error('Toggle perk failed:', error);
    }
  }

  private async handleRunStart(): Promise<void> {
    try {
      const mode = normalizeMode(this.runModeSelect?.value);
      const run = await this.startGameplayRun(mode);
      this.setStatus(`Run started (${run.mode})`);
    } catch (error) {
      this.setStatus('Failed to start run', true);
      console.error('Run start failed:', error);
    }
  }

  private async handleRunComplete(): Promise<void> {
    const scoreText = this.scoreInput.value.trim();
    const score = Number(scoreText);
    if (!scoreText || !Number.isFinite(score)) {
      this.setStatus('Score must be a number', true);
      return;
    }

    const survivalText = this.survivalInput?.value.trim() ?? '';
    const survivalValue = survivalText ? Number(survivalText) : undefined;
    if (survivalText && (survivalValue === undefined || !Number.isFinite(survivalValue))) {
      this.setStatus('Survival seconds must be numeric', true);
      return;
    }

    const selectedMutatorIds = parseSelectedMutators(this.mutatorsList);
    try {
      const result = await this.completeGameplayRun(
        score,
        survivalValue,
        selectedMutatorIds
      );
      this.setStatus(
        `Run complete. +${result.reward.xpGained} XP, +${result.reward.currencyGained} currency`
      );
    } catch (error) {
      this.setStatus('Failed to complete run', true);
      console.error('Run complete failed:', error);
    }
  }
}

export type DevvitGameBridge = {
  getInitData: () => InitResponse;
  saveState: (payload: StateUpsertRequest) => Promise<StoredState>;
  loadState: () => Promise<StoredState | null>;
  submitScore: (score: number) => Promise<ScoreSubmitResponse>;
  getLeaderboard: (limit?: number) => Promise<LeaderboardResponse>;
  getMeta: () => Promise<MetaResponse>;
  startRun: (mode?: ChallengeMode) => Promise<RunStartResponse>;
  completeRun: (payload: RunCompleteRequest) => Promise<RunCompleteResponse>;
  togglePerk: (perkId: string) => Promise<PerkEquipResponse>;
  refreshPanel: () => Promise<void>;
};

type GameEventAction =
  | 'save_state'
  | 'load_state'
  | 'submit_score'
  | 'refresh_leaderboard'
  | 'get_meta'
  | 'start_run'
  | 'complete_run'
  | 'toggle_perk';

type GameEventSuccess = {
  ok: true;
  action: GameEventAction;
  data: unknown;
  at: number;
};

type GameEventFailure = {
  ok: false;
  action: GameEventAction;
  error: string;
  at: number;
};

type GameEventPayload = GameEventSuccess | GameEventFailure;

type MaybeStringNumber = string | number | undefined;

const normalizeNumber = (value: MaybeStringNumber): number | null => {
  if (value === undefined) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const callbackToMethodId = (value: MaybeStringNumber): number | null => {
  const parsed = normalizeNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.trunc(parsed);
};

const errorMessageFromUnknown = (error: unknown): string => {
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown bridge error';
};

const emitToGame = (
  callbackMethod: number | null,
  payload: GameEventPayload
): void => {
  const callback = window.doGMLCallback;
  if (!callback || callbackMethod === null) {
    return;
  }
  callback(callbackMethod, payload);
};

const successPayload = (
  action: GameEventAction,
  data: unknown
): GameEventSuccess => ({
  ok: true,
  action,
  data,
  at: Date.now(),
});

const errorPayload = (
  action: GameEventAction,
  error: unknown
): GameEventFailure => ({
  ok: false,
  action,
  error: errorMessageFromUnknown(error),
  at: Date.now(),
});

declare global {
  interface Window {
    DevvitBridge?: DevvitGameBridge;
    doGMLCallback?: (methodToCall: number, payload: unknown) => void;
    devvit_submit_score?: (
      score: number | string,
      callbackMethod?: number | string
    ) => void;
    devvit_save_state?: (
      level?: number | string,
      note?: string,
      callbackMethod?: number | string
    ) => void;
    devvit_load_state?: (callbackMethod?: number | string) => void;
    devvit_refresh_leaderboard?: (
      limit?: number | string,
      callbackMethod?: number | string
    ) => void;
    devvit_get_meta?: (callbackMethod?: number | string) => void;
    devvit_start_run?: (
      mode?: string,
      callbackMethod?: number | string
    ) => void;
    devvit_complete_run?: (
      score: number | string,
      survivedSeconds?: number | string,
      callbackMethod?: number | string
    ) => void;
    devvit_toggle_perk?: (
      perkId: string,
      callbackMethod?: number | string
    ) => void;
  }
}

export const setupCompanionPanel = (initData: InitResponse): CompanionPanel => {
  const panel = new CompanionPanel(initData);

  window.DevvitBridge = {
    getInitData: () => panel.getInitData(),
    saveState: async (payload) => await panel.saveState(payload),
    loadState: async () => await panel.loadState(),
    submitScore: async (score) => await panel.postScore(score),
    getLeaderboard: async (limit) => await panel.refreshLeaderboard(limit),
    getMeta: async () => await panel.refreshMeta(),
    startRun: async (mode) => await panel.startGameplayRun(mode ?? 'normal'),
    completeRun: async (payload) =>
      await panel.completeGameplayRun(
        payload.score,
        payload.survivedSeconds,
        payload.selectedMutatorIds
      ),
    togglePerk: async (perkId) => await panel.togglePerk(perkId),
    refreshPanel: async () => {
      await panel.loadState();
      await panel.refreshLeaderboard();
      await panel.refreshMeta();
    },
  };

  window.devvit_submit_score = (score, callbackMethod) => {
    const normalizedScore = normalizeNumber(score);
    const callbackMethodId = callbackToMethodId(callbackMethod);
    const bridge = window.DevvitBridge;

    if (normalizedScore === null) {
      emitToGame(
        callbackMethodId,
        errorPayload('submit_score', 'Score must be a finite number')
      );
      return;
    }
    if (!bridge) {
      emitToGame(
        callbackMethodId,
        errorPayload('submit_score', 'DevvitBridge is unavailable')
      );
      return;
    }

    void bridge
      .submitScore(normalizedScore)
      .then(async (result) => {
        const leaderboard = await bridge.getLeaderboard(10);
        emitToGame(
          callbackMethodId,
          successPayload('submit_score', { result, leaderboard })
        );
      })
      .catch((error: unknown) => {
        emitToGame(callbackMethodId, errorPayload('submit_score', error));
      });
  };

  window.devvit_save_state = (level, note, callbackMethod) => {
    const callbackMethodId = callbackToMethodId(callbackMethod);
    const payload: StateUpsertRequest = {};
    const normalizedLevel = normalizeNumber(level);
    const trimmedNote = typeof note === 'string' ? note.trim() : '';
    const bridge = window.DevvitBridge;

    if (level !== undefined && normalizedLevel === null) {
      emitToGame(
        callbackMethodId,
        errorPayload('save_state', 'Level must be a finite number')
      );
      return;
    }

    if (normalizedLevel !== null) {
      payload.level = normalizedLevel;
    }
    if (trimmedNote.length > 0) {
      payload.data = { note: trimmedNote };
    }

    if (payload.level === undefined && payload.data === undefined) {
      emitToGame(
        callbackMethodId,
        errorPayload('save_state', 'Provide a level or note to save')
      );
      return;
    }
    if (!bridge) {
      emitToGame(
        callbackMethodId,
        errorPayload('save_state', 'DevvitBridge is unavailable')
      );
      return;
    }

    void bridge
      .saveState(payload)
      .then((state) => {
        emitToGame(callbackMethodId, successPayload('save_state', state));
      })
      .catch((error: unknown) => {
        emitToGame(callbackMethodId, errorPayload('save_state', error));
      });
  };

  window.devvit_load_state = (callbackMethod) => {
    const callbackMethodId = callbackToMethodId(callbackMethod);
    const bridge = window.DevvitBridge;
    if (!bridge) {
      emitToGame(
        callbackMethodId,
        errorPayload('load_state', 'DevvitBridge is unavailable')
      );
      return;
    }

    void bridge
      .loadState()
      .then((state) => {
        emitToGame(callbackMethodId, successPayload('load_state', state));
      })
      .catch((error: unknown) => {
        emitToGame(callbackMethodId, errorPayload('load_state', error));
      });
  };

  window.devvit_refresh_leaderboard = (limit, callbackMethod) => {
    const callbackMethodId = callbackToMethodId(callbackMethod);
    const normalizedLimit = normalizeNumber(limit);
    const limitToUse = normalizedLimit === null ? 10 : normalizedLimit;
    const bridge = window.DevvitBridge;

    if (!bridge) {
      emitToGame(
        callbackMethodId,
        errorPayload('refresh_leaderboard', 'DevvitBridge is unavailable')
      );
      return;
    }

    void bridge
      .getLeaderboard(limitToUse)
      .then((leaderboard) => {
        emitToGame(
          callbackMethodId,
          successPayload('refresh_leaderboard', leaderboard)
        );
      })
      .catch((error: unknown) => {
        emitToGame(callbackMethodId, errorPayload('refresh_leaderboard', error));
      });
  };

  window.devvit_get_meta = (callbackMethod) => {
    const callbackMethodId = callbackToMethodId(callbackMethod);
    const bridge = window.DevvitBridge;
    if (!bridge) {
      emitToGame(
        callbackMethodId,
        errorPayload('get_meta', 'DevvitBridge is unavailable')
      );
      return;
    }

    void bridge
      .getMeta()
      .then((meta) => {
        emitToGame(callbackMethodId, successPayload('get_meta', meta));
      })
      .catch((error: unknown) => {
        emitToGame(callbackMethodId, errorPayload('get_meta', error));
      });
  };

  window.devvit_start_run = (mode, callbackMethod) => {
    const callbackMethodId = callbackToMethodId(callbackMethod);
    const bridge = window.DevvitBridge;
    if (!bridge) {
      emitToGame(
        callbackMethodId,
        errorPayload('start_run', 'DevvitBridge is unavailable')
      );
      return;
    }

    void bridge
      .startRun(normalizeMode(mode))
      .then((run) => {
        emitToGame(callbackMethodId, successPayload('start_run', run));
      })
      .catch((error: unknown) => {
        emitToGame(callbackMethodId, errorPayload('start_run', error));
      });
  };

  window.devvit_complete_run = (score, survivedSeconds, callbackMethod) => {
    const callbackMethodId = callbackToMethodId(callbackMethod);
    const normalizedScore = normalizeNumber(score);
    const normalizedSurvival = normalizeNumber(survivedSeconds);
    const bridge = window.DevvitBridge;

    if (normalizedScore === null) {
      emitToGame(
        callbackMethodId,
        errorPayload('complete_run', 'Score must be a finite number')
      );
      return;
    }
    if (survivedSeconds !== undefined && normalizedSurvival === null) {
      emitToGame(
        callbackMethodId,
        errorPayload('complete_run', 'Survival seconds must be a finite number')
      );
      return;
    }
    if (!bridge) {
      emitToGame(
        callbackMethodId,
        errorPayload('complete_run', 'DevvitBridge is unavailable')
      );
      return;
    }

    void bridge
      .completeRun({
        ticket: '',
        score: normalizedScore,
        ...(normalizedSurvival !== null
          ? { survivedSeconds: normalizedSurvival }
          : {}),
      })
      .then((result) => {
        emitToGame(callbackMethodId, successPayload('complete_run', result));
      })
      .catch((error: unknown) => {
        emitToGame(callbackMethodId, errorPayload('complete_run', error));
      });
  };

  window.devvit_toggle_perk = (perkId, callbackMethod) => {
    const callbackMethodId = callbackToMethodId(callbackMethod);
    const bridge = window.DevvitBridge;

    if (typeof perkId !== 'string' || perkId.trim().length === 0) {
      emitToGame(
        callbackMethodId,
        errorPayload('toggle_perk', 'perkId is required')
      );
      return;
    }
    if (!bridge) {
      emitToGame(
        callbackMethodId,
        errorPayload('toggle_perk', 'DevvitBridge is unavailable')
      );
      return;
    }

    void bridge
      .togglePerk(perkId.trim())
      .then((result) => {
        emitToGame(callbackMethodId, successPayload('toggle_perk', result));
      })
      .catch((error: unknown) => {
        emitToGame(callbackMethodId, errorPayload('toggle_perk', error));
      });
  };

  return panel;
};
