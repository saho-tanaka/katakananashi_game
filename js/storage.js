const STORAGE_KEY = "engineer-katakanashi:v1";
const HISTORY_KEY = "engineer-katakanashi:history:v1";
const SCHEMA_VERSION = 1;

export function safeRead(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? { exists: false, value: null } : { exists: true, value: JSON.parse(raw) };
  } catch (error) {
    console.error("[storage] JSONの読み込みに失敗しました", error);
    return { exists: true, corrupt: true, error, value: null };
  }
}
export function validateGameState(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["保存データはオブジェクトではありません。"];
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push("対応していない保存データの版です。");
  if (!Array.isArray(value.teams) || value.teams.length < 2 || value.teams.length > 4) errors.push("チーム数は2〜4である必要があります。");
  if (!Number.isInteger(value.roundCount) || value.roundCount < 1 || value.roundCount > 5) errors.push("巡数が範囲外です。");
  if (![30,60,90].includes(value.turnDuration)) errors.push("制限時間が不正です。");
  if (!Array.isArray(value.promptOrder) || !Array.isArray(value.records)) errors.push("お題順または判定記録が配列ではありません。");
  if (!Number.isInteger(value.currentTeamIndex) || value.currentTeamIndex < 0 || value.currentTeamIndex > 3) errors.push("現在のチーム番号が不正です。");
  if (!Number.isInteger(value.currentRound) || value.currentRound < 1) errors.push("現在の巡数が不正です。");
  if (!Number.isFinite(value.remainingSeconds) || value.remainingSeconds < 0 || value.remainingSeconds > 90) errors.push("残り時間が不正です。");
  if (Array.isArray(value.teams)) {
    value.teams.forEach((team, i) => {
      if (!team || typeof team.name !== "string" || !team.name.trim()) errors.push(`チーム${i+1}の名前が不正です。`);
      if (!Number.isInteger(team.score) || team.score < 0) errors.push(`チーム${i+1}の得点が不正です。`);
    });
  }
  if (Array.isArray(value.records)) {
    value.records.forEach((record, i) => {
      if (!record || typeof record.promptId !== "string" || !["correct","skip","violation"].includes(record.result)) errors.push(`判定記録${i+1}の形式が不正です。`);
      if (record.initialResult !== undefined && !["correct","skip","violation"].includes(record.initialResult)) errors.push(`判定記録${i+1}の初期判定が不正です。`);
    });
  }
  if (Array.isArray(value.promptOrder) && new Set(value.promptOrder).size !== value.promptOrder.length) errors.push("お題の重複があります。");
  return errors;
}
export function saveGameState(state) {
  try {
    const payload = { ...state, schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    console.error("[storage] 保存に失敗しました", error);
    return { ok: false, error };
  }
}
export function loadGameState() {
  const result = safeRead(STORAGE_KEY);
  if (!result.exists) return { status: "empty" };
  if (result.corrupt) return { status: "corrupt", error: result.error };
  const errors = validateGameState(result.value);
  if (errors.length) return { status: "unsupported", errors, value: result.value };
  return { status: "ok", value: result.value };
}
export function clearGameState() {
  try { localStorage.removeItem(STORAGE_KEY); return true; }
  catch (error) { console.error("[storage] 保存データの削除に失敗しました", error); return false; }
}
export function appendHistory(entry) {
  try {
    const old = safeRead(HISTORY_KEY);
    const history = old.exists && !old.corrupt && Array.isArray(old.value) ? old.value : [];
    history.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    return { ok: true };
  } catch (error) {
    console.error("[storage] 履歴保存に失敗しました", error);
    return { ok: false, error };
  }
}
export function loadHistory() {
  const result = safeRead(HISTORY_KEY);
  if (!result.exists) return [];
  if (result.corrupt || !Array.isArray(result.value)) {
    console.error("[storage] 履歴データの形式が不正です", result.error || result.value);
    return [];
  }
  return result.value;
}
export function exportPayload(data) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, ...data }, null, 2);
}
export function storageKey() { return STORAGE_KEY; }