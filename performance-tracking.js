/**
 * RASTREAMENTO DE DESEMPENHO - FEATURE NOVA
 * Armazena resultados do simulado no localStorage para gerar estatísticas personalizadas
 * Identificação da usuária via URL (?session=unique-id) ou localStorage padrão
 */

// ════════════════════════════════════════════════════════════
//  IDENTIFICAÇÃO DA USUÁRIA (PROJETO PERSONAL)
// ════════════════════════════════════════════════════════════

/**
 * Identifica a usuária do simulado. Para projetos pessoais:
 * - Opção 1: URL com parâmetro de sessão (?session=unique-id)
 * - Opção 2: localStorage sem autenticação (mais simples)
 * 
 * @param {string} [sessionId=null] - Sessão única da URL (ex: ?session=my-wife-session-12345)
 */
function identifyUser(sessionId = null) {
  if (sessionId && sessionId.trim()) {
    // Se a URL tiver parâmetro de sessão, usa-o
    localStorage.setItem('simulado_session_id', sessionId);
    return sessionId;
  }
  
  // Caso contrário, tenta recuperar do localStorage
  const savedSession = localStorage.getItem('simulado_session_id');
  if (savedSession) {
    return savedSession;
  }
  
  // Se não houver sessão salva, usa um ID genérico
  return 'usuaria-padrao';
}

/**
 * Salva o resultado de uma questão individualmente
 * @param {number} questionIndex - Índice da questão no array activeQuestions
 * @param {number} userAnswer - Resposta do usuário (0-4)
 * @param {string} area - Área temática da questão
 */
function saveQuestionResult(questionIndex, userAnswer, area) {
  const sessionData = getSessionData();
  
  if (!sessionData.results[questionIndex]) {
    sessionData.results[questionIndex] = {
      answeredAt: new Date().toISOString(),
      userAnswer: userAnswer,
      correctAnswer: activeQuestions[questionIndex]?.answer || null,
      isCorrect: false,
      area: area
    };
  } else {
    // Atualizar resultado se já respondida
    sessionData.results[questionIndex].userAnswer = userAnswer;
    sessionData.results[questionIndex].correctAnswer = activeQuestions[questionIndex]?.answer || null;
    sessionData.results[questionIndex].isCorrect = (userAnswer === activeQuestions[questionIndex]?.answer);
  }
  
  localStorage.setItem('simulado_performance_data', JSON.stringify(sessionData));
}

/**
 * Carrega todos os dados de desempenho salvos
 */
function getSessionData() {
  const saved = localStorage.getItem('simulado_performance_data');
  if (saved) {
    return JSON.parse(saved);
  }
  
  // Estrutura padrão dos dados
  return {
    sessionId: identifyUser(),
    totalSimulated: 0,
    results: {}, // { questionIndex: { answeredAt, userAnswer, correctAnswer, isCorrect, area } }
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Calcula estatísticas gerais de desempenho
 */
function getGeneralStats() {
  const sessionData = getSessionData();
  
  if (sessionData.totalSimulated === 0) return null;
  
  let hits = 0, miss = 0, skip = 0;
  Object.values(sessionData.results).forEach(r => {
    if (r.answeredAt) {
      if (r.isCorrect) hits++;
      else miss++;
    } else {
      skip++;
    }
  });
  
  const pct = Math.round((hits / sessionData.totalSimulated) * 100);
  
  return {
    total: sessionData.totalSimulated,
    hits,
    miss,
    skip,
    pct
  };
}

/**
 * Calcula estatísticas por área temática
 */
function getAreaStats() {
  const sessionData = getSessionData();
  
  if (sessionData.totalSimulated === 0) return {};
  
  const areaMap = {};
  
  Object.values(sessionData.results).forEach(r => {
    if (!r.area || !r.answeredAt) return;
    
    if (!areaMap[r.area]) {
      areaMap[r.area] = { total: 0, hits: 0 };
    }
    areaMap[r.area].total++;
    if (r.isCorrect) areaMap[r.area].hits++;
  });
  
  // Adicionar questões não respondidas
  Object.values(sessionData.results).forEach(r => {
    if (!r.answeredAt && r.area) {
      if (!areaMap[r.area]) areaMap[r.area] = { total: 0, hits: 0 };
      areaMap[r.area].total++;
    }
  });
  
  // Calcular porcentagens e converter para formato compatível com o HTML
  const result = {};
  Object.entries(areaMap).forEach(([area, data]) => {
    const pct = Math.round((data.hits / data.total) * 100);
    result[area] = { hits: data.hits, total: data.total, pct };
  });
  
  return result;
}

/**
 * Calcula estatísticas por município/região (Blumenau vs SC)
 */
function getRegionStats() {
  const sessionData = getSessionData();
  
  if (sessionData.totalSimulated === 0) return {};
  
  const regionMap = {
    'Blumenau/SC': { total: 0, hits: 0 },
    'Santa Catarina': { total: 0, hits: 0 }
  };
  
  Object.values(sessionData.results).forEach(r => {
    if (!r.area || !r.answeredAt) return;
    
    // Verificar se é questão de Blumenau
    const q = activeQuestions.find((q, i) => i === r.questionIndex);
    const isBlumenau = q?.isBlumenau ?? false;
    
    if (isBlumenau) {
      regionMap['Blumenau/SC'].total++;
      if (r.isCorrect) regionMap['Blumenau/SC'].hits++;
    } else {
      regionMap['Santa Catarina'].total++;
      if (r.isCorrect) regionMap['Santa Catarina'].hits++;
    }
  });
  
  // Calcular porcentagens
  const result = {};
  Object.entries(regionMap).forEach(([region, data]) => {
    const pct = Math.round((data.hits / data.total) * 100);
    result[region] = { hits: data.hits, total: data.total, pct };
  });
  
  return result;
}

/**
 * Calcula pontos fracos (áreas com menor desempenho)
 */
function getWeakAreas() {
  const areaStats = getAreaStats();
  
  // Filtrar áreas respondidas
  const answeredAreas = Object.entries(areaStats).filter(([area, data]) => data.total > 0);
  
  if (answeredAreas.length === 0) return [];
  
  // Ordenar por desempenho (menor primeiro)
  answeredAreas.sort((a, b) => a[1].pct - b[1].pct);
  
  // Retornar top 5 áreas com menor desempenho
  const weakAreas = answeredAreas.slice(0, 5).map(([area, data]) => ({
    area,
    pct: data.pct,
    hits: data.hits,
    total: data.total
  }));
  
  return weakAreas;
}

/**
 * Calcula pontos fortes (áreas com maior desempenho)
 */
function getStrongAreas() {
  const areaStats = getAreaStats();
  
  // Filtrar áreas respondidas
  const answeredAreas = Object.entries(areaStats).filter(([area, data]) => data.total > 0);
  
  if (answeredAreas.length === 0) return [];
  
  // Ordenar por desempenho (maior primeiro)
  answeredAreas.sort((a, b) => b[1].pct - a[1].pct);
  
  // Retornar top 5 áreas com maior desempenho
  const strongAreas = answeredAreas.slice(0, 5).map(([area, data]) => ({
    area,
    pct: data.pct,
    hits: data.hits,
    total: data.total
  }));
  
  return strongAreas;
}

/**
 * Atualiza a última atualização dos dados
 */
function updateLastUpdated() {
  const sessionData = getSessionData();
  sessionData.lastUpdated = new Date().toISOString();
  localStorage.setItem('simulado_performance_data', JSON.stringify(sessionData));
}

// ════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO AUTOMÁTICA
// ════════════════════════════════════════════════════════════

// Inicializar rastreamento ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
  const sessionId = identifyUser();
  
  // Adicionar parâmetro de sessão à URL (opcional, para compartilhar resultados)
  if (sessionId && !window.location.search.includes(sessionId)) {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('session', sessionId);
    window.history.replaceState({}, '', '?' + urlParams.toString());
  }
  
  console.log('📊 Rastreamento de desempenho inicializado para:', sessionId);
});

// ════════════════════════════════════════════════════════════
//  EXPORTAÇÃO PARA O QUIZ (INTEGRAR COM index.html)
// ════════════════════════════════════════════════════════════

/**
 * Salva resultado ao responder uma questão
 */
window.saveQuizResult = function(questionIndex, userAnswer) {
  const area = activeQuestions[questionIndex]?.area;
  saveQuestionResult(questionIndex, userAnswer, area);
};

/**
 * Finaliza quiz e salva todos os resultados
 */
window.finalizeWithTracking = function() {
  // Salvar todas as respostas
  activeQuestions.forEach((q, i) => {
    if (answers[i] !== -1) {
      saveQuizResult(i, answers[i]);
    }
  });
  
  updateLastUpdated();
};

// Exportar funções para uso global
window.getGeneralStats = getGeneralStats;
window.getAreaStats = getAreaStats;
window.getRegionStats = getRegionStats;
window.getWeakAreas = getWeakAreas;
window.getStrongAreas = getStrongAreas;
window.getSessionData = getSessionData;
