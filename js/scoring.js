export function calculateScores(teams, records) {
  const scores = teams.map(() => 0);
  for (const record of records) {
    if (record.result === "correct" && Number.isInteger(record.scoringTeamIndex) && scores[record.scoringTeamIndex] !== undefined) scores[record.scoringTeamIndex] += 1;
  }
  return scores;
}
export function buildRanking(teams) {
  const sorted = teams.map((team, index) => ({ ...team, index })).sort((a,b) => b.score - a.score);
  let rank = 0, previous = null;
  return sorted.map((team, i) => {
    if (previous === null || team.score !== previous) rank = i + 1;
    previous = team.score;
    return { ...team, rank };
  });
}