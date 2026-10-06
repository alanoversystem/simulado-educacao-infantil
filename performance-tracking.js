/**
 * RASTREAMENTO DE DESEMPENHO
 * Calcula estatísticas acumuladas a partir do histórico de simulados mantido
 * por github-sync.js (localStorage + user-data.json no GitHub).
 */

function getTrackingData() {
  return window.GitHubSync ? GitHubSync.getData() : { sessions: [], totals: {} };
}

/**
 * Estatísticas gerais acumuladas de todos os simulados
 */
function getGeneralStats() {
  const data = getTrackingData();
  if (data.sessions.length === 0) return null;

  let hits = 0, miss = 0, skip = 0;
  Object.values(data.totals).forEach(t => {
    hits += t.hits; miss += t.miss; skip += t.skip;
  });
  const answered = hits + miss + skip;

  return {
    total: data.sessions.length,
    questions: answered,
    hits,
    miss,
    skip,
    pct: answered ? Math.round((hits / answered) * 100) : 0
  };
}

function aggregateBy(keyFn) {
  const map = {};
  Object.values(getTrackingData().totals).forEach(t => {
    const key = keyFn(t);
    if (!map[key]) map[key] = { hits: 0, total: 0 };
    map[key].hits += t.hits;
    map[key].total += t.hits + t.miss + t.skip;
  });
  const result = {};
  Object.entries(map).forEach(([key, d]) => {
    if (d.total > 0) result[key] = { hits: d.hits, total: d.total, pct: Math.round((d.hits / d.total) * 100) };
  });
  return result;
}

/**
 * Estatísticas acumuladas por área temática
 */
function getAreaStats() {
  return aggregateBy(t => t.area || 'Outras');
}

/**
 * Estatísticas acumuladas por região (Blumenau vs. demais municípios de SC)
 */
function getRegionStats() {
  return aggregateBy(t => t.isBlumenau ? 'Blumenau/SC' : 'Demais municípios (SC)');
}

function sortedAreas(direction) {
  return Object.entries(getAreaStats())
    .sort((a, b) => direction * (a[1].pct - b[1].pct))
    .map(([area, d]) => ({ area, pct: d.pct, hits: d.hits, total: d.total }));
}

/**
 * Áreas com aproveitamento abaixo de 60% (até 5, piores primeiro)
 */
function getWeakAreas() {
  return sortedAreas(1).filter(a => a.pct < 60).slice(0, 5);
}

/**
 * Áreas com melhor aproveitamento (até 5)
 */
function getStrongAreas() {
  return sortedAreas(-1).slice(0, 5);
}

/**
 * Registra o simulado finalizado (local + GitHub, se houver token)
 */
function finalizeWithTracking() {
  if (!window.GitHubSync || !activeQuestions.length) return;
  const results = {};
  activeQuestions.forEach((q, i) => {
    results[q.id] = answers[i] === -1 ? -1 : (answers[i] === q.answer ? 1 : 0);
  });
  GitHubSync.addSession({
    filter: originFilter,
    durationSec: startTime ? Math.round((Date.now() - startTime) / 1000) : null,
    results
  });
}

window.getGeneralStats = getGeneralStats;
window.getAreaStats = getAreaStats;
window.getRegionStats = getRegionStats;
window.getWeakAreas = getWeakAreas;
window.getStrongAreas = getStrongAreas;
window.finalizeWithTracking = finalizeWithTracking;
