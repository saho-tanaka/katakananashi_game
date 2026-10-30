import { loadHistory } from "./storage.js";

export function renderHistory(container, promptMap = new Map()) {
  const history = loadHistory();
  container.replaceChildren();

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "ゲーム履歴はありません。";
    container.append(empty);
    return history;
  }

  history.forEach(item => {
    const wrapper = document.createElement("article");
    wrapper.className = "history-entry";

    const row = document.createElement("div");
    row.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-item-main";
    const title = document.createElement("strong");
    title.textContent = (item.teams || []).map(t => t.name).join(" ／ ");
    const date = document.createElement("small");
    date.textContent = item.completedAt ? new Date(item.completedAt).toLocaleString("ja-JP") : "日時不明";
    main.append(title, date);

    const score = document.createElement("div");
    score.className = "history-score";
    score.textContent = (item.teams || []).map(t => t.score).join(" : ");

    const toggle = document.createElement("button");
    toggle.className = "button button-secondary history-detail-toggle";
    toggle.type = "button";
    toggle.textContent = "問題・解説を見る";
    toggle.setAttribute("aria-expanded", "false");

    row.append(main, score);
    wrapper.append(row, toggle);

    const details = document.createElement("div");
    details.className = "history-question-list";
    details.hidden = true;

    (item.records || []).forEach((record, index) => {
      const prompt = promptMap.get(record.promptId) || {};
      const term = record.term || prompt.term || "お題情報なし";
      const description = record.description || prompt.description || "この履歴には当時の解説が保存されていません。";
      const card = document.createElement("details");
      card.className = "question-detail";
      const summary = document.createElement("summary");
      const status = record.result === "correct" ? "正解" : record.result === "skip" ? "スキップ" : "違反";
      summary.textContent = `${index + 1}. ${term} — ${status}`;
      const body = document.createElement("div");
      body.className = "question-detail-body";
      const category = document.createElement("p");
      category.className = "question-detail-category";
      category.textContent = record.category || prompt.category || "分類なし";
      const explanation = document.createElement("p");
      explanation.textContent = description;
      body.append(category, explanation);
      card.append(summary, body);
      details.append(card);
    });

    toggle.addEventListener("click", () => {
      details.hidden = !details.hidden;
      toggle.setAttribute("aria-expanded", String(!details.hidden));
      toggle.textContent = details.hidden ? "問題・解説を見る" : "問題・解説を閉じる";
    });

    wrapper.append(details);
    container.append(wrapper);
  });

  return history;
}
