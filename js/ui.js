export function showScreen(id) {
  const screenId = id.endsWith("-screen") ? id : `${id}-screen`;
  document.querySelectorAll(".screen").forEach(el => {
    el.hidden = el.id !== screenId;
  });

  // 履歴ボタンはゲーム画面中（ポーズ・ルール表示中を含む）は表示しない。
  const historyButton = document.querySelector("#history-open");
  if (historyButton) {
    historyButton.hidden = screenId === "game-screen" || screenId === "history-screen";
  }
}
export function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2000);
}
export function showSaveWarning(message, onRetry) {
  const banner = document.querySelector("#save-banner");
  document.querySelector("#save-message").textContent = message;
  banner.hidden = false;
  document.querySelector("#save-retry").onclick = onRetry;
}
export function hideSaveWarning() {
  document.querySelector("#save-banner").hidden = true;
}
export function renderScores(teams) {
  const board = document.querySelector("#scoreboard");
  board.replaceChildren();
  teams.forEach(team => {
    const pill = document.createElement("div");
    pill.className = "score-pill";
    const name = document.createElement("span");
    name.textContent = team.name;
    const score = document.createElement("strong");
    score.textContent = team.score;
    pill.append(name, score);
    board.append(pill);
  });
}
export function focusSafely(element) {
  requestAnimationFrame(() => element?.focus());
}
