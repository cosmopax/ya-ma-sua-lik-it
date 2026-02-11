import { context, requestExpandedMode } from '@devvit/web/client';
import { fetchInit, fetchMeta } from './devvit-api';

const getElement = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
};

const getButton = (id: string): HTMLButtonElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing required button #${id}`);
  }
  return element;
};

const getHeading = (id: string): HTMLHeadingElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLHeadingElement)) {
    throw new Error(`Missing required heading #${id}`);
  }
  return element;
};

const getParagraph = (id: string): HTMLParagraphElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLParagraphElement)) {
    throw new Error(`Missing required paragraph #${id}`);
  }
  return element;
};

const getList = (id: string): HTMLUListElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLUListElement)) {
    throw new Error(`Missing required list #${id}`);
  }
  return element;
};

const startButton = getButton('start-button');

startButton.addEventListener('click', (event) => {
  requestExpandedMode(event, 'game');
});

const titleElement = getHeading('title');
const subtitleElement = getParagraph('subtitle');
const bestScoreElement = getElement('best-score');
const savedLevelElement = getElement('saved-level');
const metaLevelElement = getElement('meta-level');
const metaStreakElement = getElement('meta-streak');
const topPlayersElement = getList('top-players');
const challengeListElement = getList('challenge-list');

const setTopPlayers = (
  entries: Array<{ rank: number; username: string; score: number }>
) => {
  topPlayersElement.innerHTML = '';
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No scores yet';
    topPlayersElement.append(empty);
    return;
  }

  for (const entry of entries.slice(0, 5)) {
    const item = document.createElement('li');
    item.textContent = `${entry.rank}. ${entry.username} - ${entry.score}`;
    topPlayersElement.append(item);
  }
};

const setChallenges = (
  entries: Array<{ title: string; targetScore: number; completed?: boolean }>
) => {
  challengeListElement.innerHTML = '';
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No active challenges';
    challengeListElement.append(empty);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement('li');
    const state = entry.completed ? 'done' : 'open';
    item.textContent = `${entry.title} - target ${entry.targetScore} (${state})`;
    challengeListElement.append(item);
  }
};

async function init() {
  titleElement.textContent = `Rift Relay online for ${context.username ?? 'user'}`;
  subtitleElement.textContent = 'Tap Play to start your next run.';

  try {
    const initData = await fetchInit();
    const meta = await fetchMeta();
    titleElement.textContent = `Rift Relay: ${initData.username}`;
    subtitleElement.textContent = `Post ${initData.postId}`;
    bestScoreElement.textContent =
      initData.state?.bestScore !== undefined
        ? String(initData.state.bestScore)
        : initData.leaderboard.me
          ? String(initData.leaderboard.me.score)
          : '-';
    savedLevelElement.textContent =
      initData.state?.level !== undefined ? String(initData.state.level) : '-';
    metaLevelElement.textContent = String(meta.profile.level);
    metaStreakElement.textContent = String(meta.profile.streak);
    setChallenges(meta.activeChallenges);
    setTopPlayers(initData.leaderboard.top);
  } catch (error) {
    console.error('Failed to load splash data:', error);
    subtitleElement.textContent = 'Unable to load stats right now.';
  }
}

void init();
