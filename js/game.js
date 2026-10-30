import { shuffle } from "./prompts.js";
import { calculateScores } from "./scoring.js";
export function createGame({ teams, roundCount, turnDuration, prompts }) {
  const order = shuffle(prompts).map(p => p.id);
  return {
    schemaVersion: 1, status: "playing", teams: teams.map(t => ({ name: t.name, score: 0 })),
    roundCount, turnDuration, promptOrder: order, promptPool: prompts.map(p => p.id), records: [],
    currentTeamIndex: 0, currentRound: 1, completedTurnCount: 0, remainingSeconds: turnDuration,
    promptIndex: 0, turnPromptCount: 0, currentPromptId: order[0] || null,
    pauseReason: null, startedAt: new Date().toISOString(), completedAt: null,
    unsaved: false, lastSavedAt: null
  };
}
export function getCurrentPrompt(state, promptMap) { return state.currentPromptId ? promptMap.get(state.currentPromptId) || null : null; }
export function getJudgeTeamIndex(state) { return (state.currentTeamIndex + 1) % state.teams.length; }
export function applyJudgement(state, result, prompt = null) {
  if (!["correct","skip","violation"].includes(result) || !state.currentPromptId) return state;
  // 正解の得点は、判定チームではなく出題・説明を担当しているターンのチームに加算する。
  const scoringTeamIndex = state.currentTeamIndex;
  const record = {
    promptId: state.currentPromptId,
    term: prompt?.term || null,
    description: prompt?.description || null,
    category: prompt?.category || null,
    difficulty: prompt?.difficulty || null,
    initialResult: result, result,
    explainingTeamIndex: state.currentTeamIndex,
    judgingTeamIndex: getJudgeTeamIndex(state),
    scoringTeamIndex: result === "correct" ? scoringTeamIndex : null,
    round: state.currentRound, at: new Date().toISOString()
  };
  const records = [...state.records, record];
  const scores = calculateScores(state.teams, records);
  const teams = state.teams.map((team, i) => ({ ...team, score: scores[i] }));
  let nextOrder = state.promptOrder;
  let nextIndex = state.promptIndex + 1;
  let nextPrompt = nextOrder[nextIndex] || null;

  // お題を一巡したら全お題を再度シャッフルし、次の出題を続ける。
  // 一巡の境目で直前のお題が連続しないよう、先頭だけ調整する。
  if (!nextPrompt) {
    const pool = Array.isArray(state.promptPool) && state.promptPool.length
      ? state.promptPool
      : state.promptOrder;
    nextOrder = shuffle(pool);
    const previousPromptId = state.currentPromptId;
    if (nextOrder.length > 1 && nextOrder[0] === previousPromptId) {
      const swapIndex = 1 + Math.floor(Math.random() * (nextOrder.length - 1));
      [nextOrder[0], nextOrder[swapIndex]] = [nextOrder[swapIndex], nextOrder[0]];
    }
    nextIndex = 0;
    nextPrompt = nextOrder[0] || null;
  }

  return {
    ...state,
    teams,
    records,
    promptOrder: nextOrder,
    promptIndex: nextIndex,
    turnPromptCount: state.turnPromptCount + 1,
    currentPromptId: nextPrompt
  };
}
export function advanceTurn(state) {
  const completedTurnCount = Number.isInteger(state.completedTurnCount)
    ? state.completedTurnCount
    : ((state.currentRound - 1) * state.teams.length + state.currentTeamIndex) + 1;

  const totalTurns = state.roundCount * state.teams.length;

  // 巡数は「全チームが1回ずつ担当した状態」を1巡として明示的に管理する。
  if (completedTurnCount >= totalTurns || !state.promptOrder[state.promptIndex]) {
    return {
      ...state,
      completedTurnCount,
      status: "finished",
      completedAt: new Date().toISOString(),
      currentPromptId: null
    };
  }

  const nextTeamIndex = completedTurnCount % state.teams.length;
  const nextRound = Math.floor(completedTurnCount / state.teams.length) + 1;

  return {
    ...state,
    status: "playing",
    completedTurnCount,
    currentTeamIndex: nextTeamIndex,
    currentRound: nextRound,
    remainingSeconds: state.turnDuration,
    turnPromptCount: 0,
    currentPromptId: state.promptOrder[state.promptIndex],
    pauseReason: null
  };
}
export function finishGame(state) { return { ...state, status: "finished", completedAt: new Date().toISOString(), currentPromptId: null }; }
export function makeHistoryEntry(state) {
  return { id: crypto.randomUUID?.() || String(Date.now()), startedAt: state.startedAt, completedAt: state.completedAt || new Date().toISOString(), teams: state.teams, records: state.records, roundCount: state.roundCount, turnDuration: state.turnDuration };
}