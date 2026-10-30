import { exportPayload } from "./storage.js";
function download(filename, content, type = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
export function downloadGame(state) {
  download(`engineer-game-${new Date().toISOString().slice(0,10)}.json`, exportPayload({ game: state }));
}
export function downloadHistory(history) {
  download(`engineer-game-history-${new Date().toISOString().slice(0,10)}.json`, exportPayload({ history }));
}