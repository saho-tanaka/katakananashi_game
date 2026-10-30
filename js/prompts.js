import promptData from "../data/prompts.json" with { type: "json" };
export function validatePrompts(data) {
  const errors = [];
  if (!data || typeof data !== "object" || data.schemaVersion !== 1 || !Array.isArray(data.prompts)) return ["お題JSONの形式が正しくありません。"];
  const ids = new Set();
  data.prompts.forEach((p, i) => {
    if (!p || typeof p.id !== "string" || typeof p.term !== "string" || typeof p.description !== "string" || typeof p.category !== "string") errors.push(`prompts[${i}] の必須項目が不足しています。`);
    if (p?.id && ids.has(p.id)) errors.push(`お題IDが重複しています: ${p.id}`);
    if (p?.id) ids.add(p.id);
  });
  return errors;
}
export function getPrompts() {
  const errors = validatePrompts(promptData);
  if (errors.length) {
    console.error("[prompts] お題データの検証に失敗しました", errors);
    throw new Error(errors.join("\n"));
  }
  return promptData.prompts;
}
export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}