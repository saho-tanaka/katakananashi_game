import { getPrompts, validatePrompts } from "./prompts.js";
import { GameTimer } from "./timer.js";
import { createGame, getCurrentPrompt, getJudgeTeamIndex, applyJudgement, advanceTurn, finishGame, makeHistoryEntry } from "./game.js";
import { loadGameState, saveGameState, clearGameState, appendHistory, loadHistory, validateGameState } from "./storage.js";
import { downloadGame, downloadHistory } from "./export.js";
import { renderHistory } from "./history.js";
import { showScreen, showToast, showSaveWarning, hideSaveWarning, renderScores, focusSafely } from "./ui.js";

const $ = s => document.querySelector(s);
const screens = { setup: "#setup-screen", game: "#game-screen", results: "#results-screen", history: "#history-screen" };
let prompts = [], promptMap = new Map(), state = null, timer = null, dirty = false, savedSnapshot = "", previousFocus = null, pendingConfirm = null, pauseFromRules = false;
let saveRetryTimer = null, finalHistoryWritten = false;

try {
  prompts = getPrompts(); promptMap = new Map(prompts.map(p => [p.id,p]));
  $("#prompt-count").textContent = prompts.length;
} catch (error) { console.error("[app] お題データの読み込みに失敗", error); showSaveWarning("お題データを読み込めません。JSONを確認してください。", () => location.reload()); }

function currentSnapshot() { return state ? JSON.stringify({ ...state, unsaved: false, lastSavedAt: null }) : ""; }
function markDirty() { dirty = true; if (state) state.unsaved = true; }
function persist({ quiet = false } = {}) {
  if (!state) return false;
  const wasWarningVisible = !$("#save-banner").hidden;
  const result = saveGameState(state);
  if (result.ok) {
    dirty = false; state.unsaved = false; state.lastSavedAt = new Date().toISOString();
    savedSnapshot = currentSnapshot(); hideSaveWarning();
    if (!quiet || wasWarningVisible) showToast("保存に成功しました");
    clearTimeout(saveRetryTimer); return true;
  }
  dirty = true; state.unsaved = true;
  console.error("[app] 保存失敗の詳細", result.error);
  showSaveWarning("保存できていません。端末の空き容量や保存設定を確認し、再保存してください。", () => persist());
  scheduleRetry();
  return false;
}
function scheduleRetry() {
  clearTimeout(saveRetryTimer);
  saveRetryTimer = setTimeout(() => { if (dirty && state) persist({ quiet: true }); }, 5000);
}
function mutateAndSave() { markDirty(); persist({ quiet: true }); }
function setTimerDisplay(seconds) { $("#timer-value").textContent = String(seconds); }
function updateGameView() {
  if (!state) return;
  const prompt = getCurrentPrompt(state, promptMap);
  $("#round-label").textContent = `ROUND ${state.currentRound} / ${state.roundCount}`;
  $("#active-team").textContent = `${state.teams[state.currentTeamIndex].name}のターン`;
  $("#judge-team").textContent = `判定：${state.teams[getJudgeTeamIndex(state)].name}`;
  $("#prompt-progress").textContent = `今回 ${state.turnPromptCount + 1} 問目`;
  $("#prompt-term").textContent = prompt?.term || "お題を読み込めません";
  $("#category-chip").textContent = prompt?.category || "開発";
  $("#prompt-hint").textContent = "この言葉を、カタカナ・英語・略語を使わずに説明しよう！";
  $("#judge-actions").hidden = false;
  $("#final-turn-confirmation").hidden = true;
  renderScores(state.teams);
  setTimerDisplay(state.remainingSeconds);
}
function startTimer(seconds = state.turnDuration) {
  timer?.stop();
  timer = new GameTimer(setTimerDisplay, () => handleTurnEnd("time"));
  timer.start(seconds);
}
function beginGame(config) {
  state = createGame({ ...config, prompts });
  dirty = true; finalHistoryWritten = false;
  showScreen("game"); updateGameView(); startTimer(); persist({ quiet: true });
}
function openPause(reason) {
  if (!state || state.status !== "playing") return;
  previousFocus = document.activeElement;
  state.remainingSeconds = timer?.pause() ?? state.remainingSeconds;
  state.status = "paused"; state.pauseReason = reason;
  $("#prompt-term").textContent = "一時停止中";
  $("#category-chip").textContent = "PAUSED";
  $("#pause-reason").textContent = reason === "hidden" ? "画面が非表示になったため、安全のため一時停止しました。" : "操作により一時停止しました。";
  $("#pause-summary").textContent = `${state.teams[state.currentTeamIndex].name} ／ 残り ${state.remainingSeconds} 秒`;
  $("#pause-overlay").hidden = false;
  mutateAndSave();
  focusSafely($("#resume-button"));
}
function resumeGame() {
  if (!state || state.status !== "paused") return;
  $("#pause-overlay").hidden = true;
  state.status = "playing"; state.pauseReason = null;
  updateGameView(); timer?.stop(); timer = new GameTimer(setTimerDisplay, () => handleTurnEnd("time"));
  timer.start(state.remainingSeconds);
  mutateAndSave();
  if (previousFocus?.isConnected) focusSafely(previousFocus);
}
function openRules(fromSetup = false) {
  pauseFromRules = !fromSetup;
  if (!fromSetup) $("#pause-overlay").hidden = true;
  $("#rules-overlay").hidden = false;
  $("#rules-scroll").scrollTop = 0;
  $("#rules-resume").textContent = fromSetup ? "トップページに戻る" : "一時停止画面に戻る";
  focusSafely($("#rules-title"));
}
function closeRules() {
  $("#rules-overlay").hidden = true;
  if (pauseFromRules) {
    $("#pause-overlay").hidden = false;
    focusSafely($("#resume-button"));
  } else {
    focusSafely($("#setup-rules-open"));
  }
  pauseFromRules = false;
}
function showTurnConfirmation() {
  if (!state) return;

  timer?.stop();
  state.remainingSeconds = 0;
  state.status = "awaiting-turn-confirmation";
  state.pauseReason = "turn-complete";

  const completedTurnCount = Number.isInteger(state.completedTurnCount)
    ? state.completedTurnCount
    : ((state.currentRound - 1) * state.teams.length + state.currentTeamIndex);
  const nextCompletedTurnCount = completedTurnCount + 1;
  const hasNextTurn =
    nextCompletedTurnCount < state.roundCount * state.teams.length &&
    Boolean(state.promptOrder[state.promptIndex]);

  state.completedTurnCount = nextCompletedTurnCount;

  $("#timer-value").textContent = "0";
  $("#prompt-term").textContent = "判定済み";
  $("#category-chip").textContent = "ターン終了";
  $("#prompt-hint").textContent = hasNextTurn
    ? "このターンのお題はすべて終了しました。判定内容を確認して、次のチームへ進んでください。"
    : "最後のお題の判定が完了しました。判定内容を確認して、結果画面へ進んでください。";
  $("#judge-actions").hidden = true;
  $("#final-turn-confirmation").hidden = false;
  $("#confirm-next-turn").textContent = hasNextTurn
    ? "判定を確定して次のチームへ進む"
    : "判定を確定して結果を見る";

  mutateAndSave();
  focusSafely($("#confirm-next-turn"));
}

function nextPrompt() {
  if (!state) return;

  // 最後のお題を判定した後は、結果画面へ直行せず確定操作を挟む。
  if (state.promptIndex >= state.promptOrder.length || !state.currentPromptId) {
    showTurnConfirmation();
    return;
  }

  updateGameView();
  mutateAndSave();
}
function handleJudgement(result) {
  if (!state || !["playing", "awaiting-final-judgement"].includes(state.status)) return;

  const isFinalJudgement = state.status === "awaiting-final-judgement";
  state.remainingSeconds = isFinalJudgement ? 0 : (timer?.getRemaining() ?? state.remainingSeconds);
  if (isFinalJudgement) timer?.stop();

  const judgedPrompt = promptMap.get(state.currentPromptId) || null;
  state = applyJudgement(state, result, judgedPrompt);
  if (result === "correct") showToast("正解！出題チームに1点");
  else if (result === "violation") showToast("違反：このお題は失格");

  if (isFinalJudgement) {
    // 時間切れ後の最後のお題は、判定を記録しただけでは次のターンへ進めない。
    showTurnConfirmation();
    return;
  }

  nextPrompt();
}
function handleTurnEnd(reason) {
  if (!state || state.status !== "playing") return;
  timer?.stop();
  state.remainingSeconds = 0;
  state.status = "awaiting-final-judgement";
  state.pauseReason = "time";
  $("#timer-value").textContent = "0";
  $("#prompt-hint").textContent = "時間終了！最後のお題を判定してください。正解・スキップ・違反のいずれかを選んでください。";
  $("#judge-actions").hidden = false;
  $("#final-turn-confirmation").hidden = true;
  showToast(reason === "time" ? "時間終了！最後のお題を判定してください" : "ターン終了");
  mutateAndSave();
}
function confirmNextTurn() {
  if (!state || state.status !== "awaiting-turn-confirmation") return;
  $("#final-turn-confirmation").hidden = true;
  $("#judge-actions").hidden = false;
  state = advanceTurn(state);
  if (state.status === "finished") {
    finishGameFlow();
    return;
  }
  updateGameView();
  showToast(`${state.teams[state.currentTeamIndex].name}のターンです`);
  startTimer(state.turnDuration);
  mutateAndSave();
}
function finishGameFlow() {
  timer?.stop();
  state = finishGame(state);
  state.remainingSeconds = 0;
  markDirty();
  if (!finalHistoryWritten) {
    const result = appendHistory(makeHistoryEntry(state));
    finalHistoryWritten = result.ok;
    if (!result.ok) { console.error("[app] 履歴の保存に失敗", result.error); showSaveWarning("結果履歴を保存できませんでした。結果は表示できます。", () => persist()); }
  }
  persist({ quiet: true });
  renderResults();
  showScreen("results");
}
function renderResults() {
  const ranking = [...state.teams].map((team,index)=>({...team,index})).sort((a,b)=>b.score-a.score);
  let lastScore = null, rank = 0;
  const list = $("#final-ranking"); list.replaceChildren();
  ranking.forEach((team,i) => {
    if (lastScore === null || team.score !== lastScore) rank = i+1;
    lastScore = team.score;
    const row = document.createElement("div"); row.className = "rank-row";
    const number = document.createElement("div"); number.className = "rank-number"; number.textContent = `${rank}位`;
    const name = document.createElement("div"); name.className = "rank-team"; name.textContent = team.name;
    const score = document.createElement("div"); score.className = "rank-points"; score.textContent = team.score; const unit = document.createElement("small"); unit.textContent = "点"; score.append(unit);
    row.append(number,name,score); list.append(row);
  });
  $("#results-summary").textContent = `${state.records.length}問に挑戦 ／ 正解 ${state.records.filter(r=>r.result==="correct").length}問 ／ 違反 ${state.records.filter(r=>r.result==="violation").length}問 ／ スキップ ${state.records.filter(r=>r.result==="skip").length}問`;

  const detailList = $("#result-question-details");
  detailList.replaceChildren();
  state.records.forEach((record, index) => {
    const prompt = promptMap.get(record.promptId) || {};
    const term = record.term || prompt.term || "お題情報なし";
    const description = record.description || prompt.description || "この記録には解説が保存されていません。";
    const card = document.createElement("details");
    card.className = "question-detail";
    const summary = document.createElement("summary");
    const status = record.result === "correct" ? "正解" : record.result === "skip" ? "スキップ" : "違反";
    summary.textContent = `${index + 1}. ${term}　—　${status}`;
    const body = document.createElement("div");
    body.className = "question-detail-body";
    const category = document.createElement("p");
    category.className = "question-detail-category";
    category.textContent = record.category || prompt.category || "分類なし";
    const explanation = document.createElement("p");
    explanation.textContent = description;
    body.append(category, explanation);
    card.append(summary, body);
    detailList.append(card);
  });
}
function confirmUnsaved(message, onContinue) {
  if (!dirty) { onContinue(); return; }
  pendingConfirm = onContinue;
  $("#confirm-message").textContent = message;
  $("#confirm-overlay").hidden = false;
  focusSafely($("#confirm-cancel"));
}
function showStoredGame() {
  const loaded = loadGameState();
  const button = $("#resume-game");
  if (loaded.status === "ok" && loaded.value.status !== "finished") {
    button.hidden = false;
    button.onclick = () => {
      state = loaded.value;
      state.status = "paused"; state.pauseReason = "restore";
      dirty = false; savedSnapshot = currentSnapshot();
      showScreen("game"); updateGameView();
      $("#pause-reason").textContent = "保存したゲームを再開できます。";
      $("#pause-summary").textContent = `${state.teams[state.currentTeamIndex].name} ／ 残り ${state.remainingSeconds} 秒`;
      $("#pause-overlay").hidden = false; focusSafely($("#resume-button"));
    };
  } else if (loaded.status === "corrupt" || loaded.status === "unsupported") {
    const detail = loaded.status === "corrupt" ? "保存データを読み取れませんでした。" : `保存データの形式が対応外です。\n${loaded.errors.join("\n")}`;
    console.error("[app] 保存データ検証エラー", loaded.error || loaded.errors);
    alert(`${detail}\n新しいゲームを開始するには、保存データを初期化する必要があります。初期化しますか？`);
    // STEP206: corrupted/unsupported data is not silently deleted.
    if (confirm("保存データを初期化しますか？")) { clearGameState(); showToast("保存データを初期化しました"); }
  }
}
function buildTeams() {
  const count = Number($("#team-count").value);
  const names = [...document.querySelectorAll(".team-name-input")].slice(0,count).map((input,i)=>input.value.trim() || `チーム${String.fromCharCode(65+i)}`);
  return names.map(name => ({name,score:0}));
}
function renderTeamInputs() {
  const count = Number($("#team-count").value), holder = $("#team-fields");
  const previous = [...holder.querySelectorAll("input")].map(x=>x.value);
  holder.replaceChildren();
  for(let i=0;i<count;i++){
    const label=document.createElement("label");label.className="team-name-field";label.textContent=`チーム${i+1}`;
    const input=document.createElement("input");input.className="team-name-input";input.maxLength=20;input.value=previous[i] || `チーム${String.fromCharCode(65+i)}`;input.required=true;input.setAttribute("aria-label",`チーム${i+1}の名前`);
    label.append(input);holder.append(label);
  }
}
$("#team-count").addEventListener("change",renderTeamInputs);
$("#setup-form").addEventListener("submit",event=>{
  event.preventDefault();
  if(prompts.length < 2){alert("お題データが不足しています。");return;}
  confirmUnsaved("未保存のゲーム記録があります。新しいゲームを始めると、未保存データが失われる可能性があります。続行しますか？",()=>{
    const teams=buildTeams(); clearGameState();
    beginGame({teams,roundCount:Number($("#round-count").value),turnDuration:Number($("#turn-duration").value)});
  });
});
$("#correct-button").addEventListener("click",()=>handleJudgement("correct"));
$("#skip-button").addEventListener("click",()=>handleJudgement("skip"));
$("#violation-button").addEventListener("click",()=>handleJudgement("violation"));
$("#confirm-next-turn").addEventListener("click", confirmNextTurn);
$("#pause-button").addEventListener("click",()=>openPause("manual"));
$("#resume-button").addEventListener("click",resumeGame);
$("#quit-game").addEventListener("click", () => {
  if (!state || state.status !== "paused") return;
  $("#pause-overlay").hidden = true;
  $("#quit-overlay").hidden = false;
  focusSafely($("#quit-cancel"));
});
$("#quit-cancel").addEventListener("click", () => {
  $("#quit-overlay").hidden = true;
  $("#pause-overlay").hidden = false;
  focusSafely($("#resume-button"));
});
$("#quit-confirm").addEventListener("click", () => {
  timer?.stop();
  const cleared = clearGameState();
  if (!cleared) {
    $("#quit-overlay").hidden = true;
    $("#pause-overlay").hidden = false;
    showToast("保存データを削除できませんでした。再度お試しください。");
    return;
  }
  $("#quit-overlay").hidden = true;
  $("#pause-overlay").hidden = true;
  $("#rules-overlay").hidden = true;
  state = null;
  timer = null;
  dirty = false;
  finalHistoryWritten = false;
  clearTimeout(saveRetryTimer);
  hideSaveWarning();
  $("#resume-game").hidden = true;
  showScreen("setup");
});

$("#pause-close").addEventListener("click",resumeGame);
$("#rules-open").addEventListener("click",()=>openRules(false));
$("#setup-rules-open").addEventListener("click",()=>openRules(true));
$("#rules-close").addEventListener("click",closeRules);
$("#rules-resume").addEventListener("click",closeRules);
$("#history-open").addEventListener("click",()=>{renderHistory($("#history-list"), promptMap);showScreen("history");});
$("#history-close").addEventListener("click",()=>showScreen(state?.status==="finished"?"results":"setup"));
$("#history-export").addEventListener("click",()=>downloadHistory(loadHistory()));
$("#download-json").addEventListener("click",()=>downloadGame(state));
$("#new-game").addEventListener("click",()=>{
  confirmUnsaved("未保存の結果データがあります。新しいゲームを始めると未保存データが失われる可能性があります。続行しますか？",()=>{
    clearGameState(); state=null; dirty=false; finalHistoryWritten=false; hideSaveWarning(); showScreen("setup");
  });
});
$("#confirm-cancel").addEventListener("click",()=>{$("#confirm-overlay").hidden=true;pendingConfirm=null;});
$("#confirm-continue").addEventListener("click",()=>{const action=pendingConfirm;pendingConfirm=null;$("#confirm-overlay").hidden=true;action?.();});
document.addEventListener("keydown",event=>{
  if(!$("#quit-overlay").hidden) return;
  if(!$("#rules-overlay").hidden){
    if(event.key==="Escape"){event.preventDefault();closeRules();}
    return;
  }
  if(!$("#pause-overlay").hidden){
    if(event.key==="Escape"){event.preventDefault();resumeGame();}
    return;
  }
  if(!$("#confirm-overlay").hidden) return;
  if(!state || !["playing", "awaiting-final-judgement"].includes(state.status) || $("#game-screen").hidden) return;
  if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)) return;
  const map={ArrowLeft:"correct",ArrowRight:"skip",ArrowDown:"violation",ArrowUp:"pause"};
  const action=map[event.key];
  if(action){event.preventDefault();if(action==="pause"){if(state.status==="playing") openPause("manual");}else handleJudgement(action);}
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden" && state?.status==="playing") openPause("hidden");
});
window.addEventListener("beforeunload",event=>{
  if(dirty){event.preventDefault();event.returnValue="";}
});
window.addEventListener("pagehide",()=>{if(state && dirty) persist({quiet:true});});

renderTeamInputs();
showStoredGame();
if(!timer) showScreen("setup");
