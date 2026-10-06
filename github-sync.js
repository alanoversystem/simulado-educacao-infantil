/**
 * SINCRONIZAÇÃO COM O GITHUB
 *
 * Guarda o histórico de simulados em user-data.json no próprio repositório,
 * usando um token pessoal (fine-grained PAT) salvo apenas no localStorage
 * de cada aparelho. Sem token o simulado funciona normalmente, só não sincroniza.
 *
 * Formato de user-data.json:
 * {
 *   "version": 1,
 *   "updatedAt": "ISO",
 *   "sessions": [ { id, date, device, filter, durationSec, results: { "<idQuestão>": 1 | 0 | -1 } } ],
 *   "totals":   { "<idQuestão>": { area, isBlumenau, hits, miss, skip } }
 * }
 * 1 = acerto, 0 = erro, -1 = em branco. "totals" é sempre recalculado a partir de "sessions",
 * o que torna a mesclagem entre aparelhos segura (união das sessões pelo id).
 */
(function () {
  'use strict';

  const OWNER = 'alanoversystem';
  const REPO = 'simulado-educacao-infantil';
  const FILE_PATH = 'user-data.json';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const MAX_ATTEMPTS = 4;

  const KEY_TOKEN = 'simulado_gh_token';
  const KEY_DATA = 'simulado_user_data';
  const KEY_PENDING = 'simulado_sync_pending';
  const KEY_LAST_SYNC = 'simulado_last_sync';
  const KEY_DEVICE = 'simulado_device_id';

  // Estado: 'local' (sem token), 'syncing', 'ok', 'pending', 'error'
  let state = { status: 'local', message: '' };
  let syncPromise = null;
  let resyncRequested = false;

  // ── Armazenamento local ─────────────────────────────────────
  function emptyDoc() {
    return { version: 1, updatedAt: null, sessions: [], totals: {} };
  }

  function normalizeDoc(doc) {
    const d = (doc && typeof doc === 'object') ? doc : {};
    return {
      version: 1,
      updatedAt: d.updatedAt || null,
      sessions: Array.isArray(d.sessions) ? d.sessions.filter(s => s && s.id && s.results) : [],
      totals: (d.totals && typeof d.totals === 'object') ? d.totals : {}
    };
  }

  function loadLocal() {
    try {
      return normalizeDoc(JSON.parse(localStorage.getItem(KEY_DATA) || 'null'));
    } catch (e) {
      return emptyDoc();
    }
  }

  function saveLocal(doc) {
    localStorage.setItem(KEY_DATA, JSON.stringify(doc));
  }

  function getToken() {
    return (localStorage.getItem(KEY_TOKEN) || '').trim();
  }

  function isPending() {
    return localStorage.getItem(KEY_PENDING) === '1';
  }

  function setPending(v) {
    if (v) localStorage.setItem(KEY_PENDING, '1');
    else localStorage.removeItem(KEY_PENDING);
  }

  function getDeviceId() {
    let id = localStorage.getItem(KEY_DEVICE);
    if (!id) {
      id = (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'celular-' : 'pc-') + randomId(6);
      localStorage.setItem(KEY_DEVICE, id);
    }
    return id;
  }

  function randomId(len) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Mesclagem e totais ──────────────────────────────────────
  function questionInfo(id) {
    const bank = (typeof QUESTIONS_BANK !== 'undefined' && Array.isArray(QUESTIONS_BANK)) ? QUESTIONS_BANK : [];
    const q = bank.find(x => String(x.id) === String(id));
    return q ? { area: q.area, isBlumenau: !!q.isBlumenau } : { area: 'Outras', isBlumenau: false };
  }

  function computeTotals(sessions) {
    const totals = {};
    sessions.forEach(s => {
      Object.entries(s.results).forEach(([qid, r]) => {
        if (!totals[qid]) totals[qid] = Object.assign(questionInfo(qid), { hits: 0, miss: 0, skip: 0 });
        if (r === 1) totals[qid].hits++;
        else if (r === 0) totals[qid].miss++;
        else totals[qid].skip++;
      });
    });
    return totals;
  }

  function mergeDocs(a, b) {
    const byId = new Map();
    [...a.sessions, ...b.sessions].forEach(s => { if (!byId.has(s.id)) byId.set(s.id, s); });
    const sessions = [...byId.values()].sort((x, y) => String(x.date).localeCompare(String(y.date)));
    return { version: 1, updatedAt: new Date().toISOString(), sessions, totals: computeTotals(sessions) };
  }

  // ── Base64 seguro para UTF-8 ────────────────────────────────
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ── API do GitHub ───────────────────────────────────────────
  class SyncError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  async function gh(path, token, options = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method: options.method || 'GET',
        cache: 'no-store',
        headers: Object.assign({
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + token,
          'X-GitHub-Api-Version': '2022-11-28'
        }, options.body ? { 'Content-Type': 'application/json' } : {}),
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (e) {
      throw new SyncError('Sem conexão com o GitHub.', 0);
    }
    return res;
  }

  function errorFor(res) {
    if (res.status === 401) return new SyncError('Token inválido ou expirado. Configure um novo token.', 401);
    if (res.status === 403) return new SyncError('Acesso negado (token sem permissão "Contents: Read and write" ou limite da API).', 403);
    if (res.status === 404) return new SyncError('Repositório não encontrado para este token. Verifique se o token tem acesso ao repositório ' + REPO + '.', 404);
    return new SyncError('Erro do GitHub (HTTP ' + res.status + ').', res.status);
  }

  async function readRemote(token) {
    const res = await gh('/contents/' + FILE_PATH, token);
    if (res.status === 404) {
      // Arquivo ainda não existe. Confirma que o repositório é acessível.
      const repoRes = await gh('', token);
      if (!repoRes.ok) throw errorFor(repoRes);
      return { doc: emptyDoc(), sha: null };
    }
    if (!res.ok) throw errorFor(res);
    const meta = await res.json();
    let text;
    if (meta.encoding === 'base64' && meta.content) {
      text = base64ToUtf8(meta.content);
    } else {
      // Arquivos acima de 1 MB não vêm com conteúdo; busca o blob diretamente.
      const blobRes = await gh('/git/blobs/' + meta.sha, token);
      if (!blobRes.ok) throw errorFor(blobRes);
      text = base64ToUtf8((await blobRes.json()).content);
    }
    let doc;
    try {
      doc = normalizeDoc(JSON.parse(text));
    } catch (e) {
      throw new SyncError('user-data.json no repositório está com JSON inválido.', 0);
    }
    return { doc, sha: meta.sha };
  }

  async function writeRemote(token, doc, sha) {
    const body = {
      message: 'Atualiza estatísticas do simulado (' + getDeviceId() + ')',
      content: utf8ToBase64(JSON.stringify(doc, null, 2) + '\n')
    };
    if (sha) body.sha = sha;
    return gh('/contents/' + FILE_PATH, token, { method: 'PUT', body });
  }

  // ── Sincronização ───────────────────────────────────────────
  function setState(status, message) {
    state = { status, message: message || '' };
    renderStatus();
    if (typeof window.onSyncDataUpdated === 'function') window.onSyncDataUpdated();
  }

  async function doSync() {
    const token = getToken();
    if (!token) { setState('local'); return; }
    if (!navigator.onLine) {
      setState(isPending() ? 'pending' : 'ok', 'Sem internet. Os dados ficam salvos neste aparelho e serão enviados depois.');
      return;
    }
    setState('syncing');
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const remote = await readRemote(token);
        const merged = mergeDocs(loadLocal(), remote.doc);
        saveLocal(merged);

        const remoteIds = new Set(remote.doc.sessions.map(s => s.id));
        const needsPush = merged.sessions.some(s => !remoteIds.has(s.id));
        if (!needsPush) {
          finishOk();
          return;
        }

        const res = await writeRemote(token, merged, remote.sha);
        if (res.ok) {
          finishOk();
          return;
        }
        // 409/422: sha desatualizado (outro aparelho gravou antes). Relê, mescla e tenta de novo.
        if (res.status === 409 || res.status === 422) continue;
        throw errorFor(res);
      }
      throw new SyncError('Não foi possível gravar após várias tentativas (conflito de versão).', 409);
    } catch (e) {
      const offline = !navigator.onLine || (e instanceof SyncError && e.status === 0 && /conexão/.test(e.message));
      if (offline) {
        setState(isPending() ? 'pending' : 'ok', 'Sem internet. Os dados ficam salvos neste aparelho e serão enviados depois.');
      } else {
        const msg = (e && e.message) || 'Erro ao sincronizar.';
        setState('error', isPending() ? msg + ' Os resultados continuam salvos neste aparelho.' : msg);
      }
      console.warn('[sync]', e);
    }
  }

  function finishOk() {
    setPending(false);
    localStorage.setItem(KEY_LAST_SYNC, new Date().toISOString());
    setState('ok');
  }

  function syncNow() {
    if (syncPromise) {
      resyncRequested = true;
      return syncPromise;
    }
    syncPromise = (async () => {
      do {
        resyncRequested = false;
        await doSync();
      } while (resyncRequested);
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  /**
   * Registra um simulado finalizado. Sempre grava no localStorage primeiro;
   * depois tenta enviar ao GitHub (se houver token).
   */
  function addSession(session) {
    const doc = loadLocal();
    const full = Object.assign({
      id: new Date().toISOString().replace(/[-:.TZ]/g, '') + '-' + randomId(4),
      date: new Date().toISOString(),
      device: getDeviceId()
    }, session);
    doc.sessions.push(full);
    doc.totals = computeTotals(doc.sessions);
    doc.updatedAt = new Date().toISOString();
    saveLocal(doc);
    setPending(true);
    if (getToken()) syncNow(); else setState('local');
    return full;
  }

  // ── Token ───────────────────────────────────────────────────
  async function validateToken(token) {
    const res = await gh('', token);
    if (!res.ok) throw errorFor(res);
    const repo = await res.json();
    if (repo.permissions && repo.permissions.push === false) {
      throw new SyncError('Este token só tem acesso de leitura. Ative "Contents: Read and write".', 403);
    }
  }

  async function saveToken(token) {
    token = (token || '').trim();
    if (!token) throw new SyncError('Cole o token.', 0);
    if (!navigator.onLine) throw new SyncError('Conecte-se à internet para validar o token.', 0);
    await validateToken(token);
    localStorage.setItem(KEY_TOKEN, token);
    // Conteúdo local ainda não enviado deve subir na primeira sincronização.
    if (loadLocal().sessions.length) setPending(true);
    await syncNow();
  }

  function clearToken() {
    localStorage.removeItem(KEY_TOKEN);
    setState('local');
  }

  // ── Interface ───────────────────────────────────────────────
  const LABELS = {
    local: '💾 Só neste aparelho',
    syncing: '🔄 Sincronizando…',
    ok: '☁️ Sincronizado',
    pending: '⏳ Pendente',
    error: '⚠️ Erro na sincronização'
  };

  function statusText() {
    if (state.status === 'local') return 'Sem token configurado: os resultados ficam apenas neste aparelho.';
    if (state.status === 'ok') {
      const last = localStorage.getItem(KEY_LAST_SYNC);
      return 'Tudo sincronizado' + (last ? ' em ' + new Date(last).toLocaleString('pt-BR') : '') + '.';
    }
    if (state.status === 'syncing') return 'Sincronizando com o GitHub…';
    return state.message || (state.status === 'pending' ? 'Há resultados aguardando envio.' : 'Erro ao sincronizar.');
  }

  function renderStatus() {
    const btn = document.getElementById('sync-status-btn');
    if (btn) {
      btn.textContent = LABELS[state.status] || LABELS.local;
      btn.dataset.status = state.status;
      btn.title = statusText();
    }
    const detail = document.getElementById('sync-status-detail');
    if (detail) detail.textContent = statusText();
    const hasToken = !!getToken();
    const removeBtn = document.getElementById('sync-remove-btn');
    const syncBtn = document.getElementById('sync-now-btn');
    if (removeBtn) removeBtn.classList.toggle('hidden', !hasToken);
    if (syncBtn) syncBtn.classList.toggle('hidden', !hasToken);
    const saveBtn = document.getElementById('sync-save-btn');
    if (saveBtn) saveBtn.textContent = hasToken ? 'Trocar token' : 'Salvar token';
  }

  function setModalMsg(text, isError) {
    const el = document.getElementById('sync-modal-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--error)' : 'var(--success)';
  }

  function openSettings() {
    const modal = document.getElementById('sync-modal');
    if (!modal) return;
    setModalMsg('');
    document.getElementById('sync-token-input').value = '';
    renderStatus();
    modal.classList.remove('hidden');
    document.getElementById('sync-token-input').focus();
  }

  function closeSettings() {
    const modal = document.getElementById('sync-modal');
    if (modal) modal.classList.add('hidden');
  }

  function bindUI() {
    const form = document.getElementById('sync-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('sync-token-input');
        const saveBtn = document.getElementById('sync-save-btn');
        saveBtn.disabled = true;
        setModalMsg('Validando token…', false);
        try {
          await saveToken(input.value);
          input.value = '';
          if (state.status === 'ok') setModalMsg('✅ Token salvo e dados sincronizados.', false);
          else setModalMsg('Token salvo. ' + statusText(), state.status === 'error');
        } catch (err) {
          setModalMsg((err && err.message) || 'Token inválido.', true);
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
    const removeBtn = document.getElementById('sync-remove-btn');
    if (removeBtn) removeBtn.addEventListener('click', () => {
      if (!confirm('Remover o token deste aparelho? Os resultados continuam salvos aqui, mas deixam de sincronizar.')) return;
      clearToken();
      setModalMsg('Token removido deste aparelho.', false);
    });
    const syncBtn = document.getElementById('sync-now-btn');
    if (syncBtn) syncBtn.addEventListener('click', async () => {
      setModalMsg('');
      await syncNow();
      setModalMsg(statusText(), state.status === 'error');
    });
    const closeBtn = document.getElementById('sync-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeSettings);
    const modal = document.getElementById('sync-modal');
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeSettings(); });
    const statusBtn = document.getElementById('sync-status-btn');
    if (statusBtn) statusBtn.addEventListener('click', openSettings);
  }

  function init() {
    getDeviceId();
    bindUI();
    if (getToken()) {
      setState(isPending() ? 'pending' : 'syncing');
      syncNow();
    } else {
      setState('local');
    }
    window.addEventListener('online', () => { if (getToken()) syncNow(); });
    window.addEventListener('offline', () => { if (getToken() && isPending()) setState('pending', 'Sem internet. Os dados serão enviados quando a conexão voltar.'); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && getToken() && isPending()) syncNow();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.GitHubSync = {
    addSession,
    syncNow,
    getData: loadLocal,
    getStatus: () => Object.assign({}, state),
    openSettings,
    closeSettings,
    // Expostos para testes
    _mergeDocs: mergeDocs,
    _utf8ToBase64: utf8ToBase64,
    _base64ToUtf8: base64ToUtf8
  };
})();
