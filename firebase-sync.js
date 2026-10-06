/**
 * LOGIN E SINCRONIZAÇÃO COM O FIREBASE
 *
 * - Firebase Authentication (e-mail e senha), sessão persistente no aparelho.
 * - Estatísticas em Firestore, documento users/{uid}.
 * - SDK modular carregado sob demanda da CDN (gstatic), sem etapa de build.
 * - Sem login (ou sem configuração) o simulado funciona normalmente; os resultados
 *   ficam no localStorage e são enviados quando a usuária entrar.
 *
 * Formato de users/{uid} (e do localStorage):
 * {
 *   version: 1,
 *   updatedAt: "ISO",
 *   sessions: [ { id, date, device, filter, durationSec, results: { "<idQuestão>": 1 | 0 | -1 } } ],
 *   totals:   { "<idQuestão>": { area, isBlumenau, hits, miss, skip } }
 * }
 * 1 = acerto, 0 = erro, -1 = em branco. "totals" é recalculado a partir de "sessions";
 * a gravação usa transação do Firestore e une as sessões pelo id, então PC e celular
 * nunca sobrescrevem nem contam em dobro os resultados um do outro.
 */
(function () {
  'use strict';

  const SDK_VERSION = '12.19.0';
  const SDK = (name) => `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${name}.js`;

  const KEY_DATA = 'simulado_user_data';
  const KEY_PENDING = 'simulado_sync_pending';
  const KEY_LAST_SYNC = 'simulado_last_sync';
  const KEY_DEVICE = 'simulado_device_id';
  const KEY_OWNER = 'simulado_data_owner';

  const config = window.FIREBASE_CONFIG || {};
  const options = window.FIREBASE_OPTIONS || {};

  // Estados: unconfigured, loading, local (sem login), syncing, ok, pending, error
  let state = { status: 'loading', message: '' };
  let fb = null;          // { auth, db, api }
  let initPromise = null;
  let currentUser = null;
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

  function isPending() {
    return localStorage.getItem(KEY_PENDING) === '1';
  }

  function setPending(v) {
    if (v) localStorage.setItem(KEY_PENDING, '1');
    else localStorage.removeItem(KEY_PENDING);
  }

  function randomId(len) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function getDeviceId() {
    let id = localStorage.getItem(KEY_DEVICE);
    if (!id) {
      id = (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'celular-' : 'pc-') + randomId(6);
      localStorage.setItem(KEY_DEVICE, id);
    }
    return id;
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

  // ── Firebase ────────────────────────────────────────────────
  function isConfigured() {
    return !!(config.apiKey && config.projectId && config.appId &&
      !/^COLE_AQUI/i.test(config.apiKey) && !/SEU-PROJETO/i.test(config.projectId));
  }

  function initFirebase() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([import(SDK('app')), import(SDK('auth')), import(SDK('firestore'))]);
      const app = appMod.initializeApp(config);
      const auth = authMod.getAuth(app);
      await authMod.setPersistence(auth, authMod.browserLocalPersistence);
      const db = fsMod.getFirestore(app);
      fb = { auth, db, auth$: authMod, fs$: fsMod };
      authMod.onAuthStateChanged(auth, onUserChanged);
    })().catch(err => {
      initPromise = null;
      throw err;
    });
    return initPromise;
  }

  function onUserChanged(user) {
    currentUser = user || null;
    renderAuth();
    if (!currentUser) {
      setState('local');
      return;
    }
    // Dados locais de outra conta não podem ir para esta.
    const owner = localStorage.getItem(KEY_OWNER);
    if (owner && owner !== currentUser.uid) {
      saveLocal(emptyDoc());
      setPending(false);
    }
    localStorage.setItem(KEY_OWNER, currentUser.uid);
    syncNow();
    userWaiters.splice(0).forEach(resolve => resolve());
  }

  const userWaiters = [];
  function waitForUser() {
    return currentUser ? Promise.resolve() : new Promise(resolve => userWaiters.push(resolve));
  }

  const AUTH_ERRORS = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-email': 'Digite o e-mail.',
    'auth/missing-password': 'Digite a senha.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/operation-not-allowed': 'Login por e-mail e senha não está ativado no Firebase.',
    'auth/unauthorized-domain': 'Este domínio não está autorizado no Firebase (Authorized domains).',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
    'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.',
    'auth/admin-restricted-operation': 'Cadastro desativado. A conta deve ser criada no console do Firebase.'
  };

  const FS_ERRORS = {
    'permission-denied': 'Sem permissão no Firestore. Confira se as regras (firestore.rules) foram publicadas.',
    'unauthenticated': 'Sessão expirada. Entre novamente.',
    'not-found': 'Banco Firestore não encontrado. Confira se o Firestore foi criado no projeto.',
    'resource-exhausted': 'Limite do Firestore atingido. Tente mais tarde.'
  };

  function friendlyError(e) {
    if (!e) return 'Erro desconhecido.';
    return AUTH_ERRORS[e.code] || FS_ERRORS[e.code] || e.message || String(e);
  }

  function isOfflineError(e) {
    return !navigator.onLine || (e && (e.code === 'unavailable' || e.code === 'auth/network-request-failed'));
  }

  // ── Sincronização ───────────────────────────────────────────
  function setState(status, message) {
    state = { status, message: message || '' };
    renderStatus();
    if (typeof window.onSyncDataUpdated === 'function') window.onSyncDataUpdated();
  }

  const OFFLINE_MSG = 'Sem internet. Os resultados ficam salvos neste aparelho e serão enviados depois.';

  async function doSync() {
    if (!fb || !currentUser) return;
    if (!navigator.onLine) {
      setState(isPending() ? 'pending' : 'ok', OFFLINE_MSG);
      return;
    }
    setState('syncing');
    try {
      const { fs$, db } = fb;
      const ref = fs$.doc(db, 'users', currentUser.uid);
      const merged = await fs$.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const remote = normalizeDoc(snap.exists() ? snap.data() : null);
        const result = mergeDocs(loadLocal(), remote);
        const remoteIds = new Set(remote.sessions.map(s => s.id));
        if (result.sessions.some(s => !remoteIds.has(s.id))) {
          // JSON remove valores undefined, que o Firestore não aceita.
          tx.set(ref, JSON.parse(JSON.stringify(result)));
        }
        return result;
      });
      // Uma prova pode ter terminado durante a transação: preserva e mantém pendente.
      const local = loadLocal();
      const mergedIds = new Set(merged.sessions.map(s => s.id));
      const stillPending = local.sessions.some(s => !mergedIds.has(s.id));
      saveLocal(mergeDocs(local, merged));
      setPending(stillPending);
      if (stillPending) resyncRequested = true;
      localStorage.setItem(KEY_LAST_SYNC, new Date().toISOString());
      setState('ok');
    } catch (e) {
      console.warn('[sync]', e);
      if (isOfflineError(e)) {
        setState(isPending() ? 'pending' : 'ok', OFFLINE_MSG);
      } else {
        const msg = friendlyError(e);
        setState('error', isPending() ? msg + ' Os resultados continuam salvos neste aparelho.' : msg);
      }
    }
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
      } while (resyncRequested && navigator.onLine && currentUser);
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  /**
   * Registra um simulado finalizado. Grava primeiro no localStorage e depois,
   * se houver login, envia ao Firestore.
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
    if (currentUser) syncNow();
    else renderStatus();
    return full;
  }

  // ── Ações de login ──────────────────────────────────────────
  async function ensureReady() {
    if (!isConfigured()) throw new Error('Firebase ainda não configurado: preencha o arquivo firebase-config.js.');
    try {
      await initFirebase();
    } catch (e) {
      throw new Error('Não foi possível carregar o Firebase. Verifique a internet.');
    }
  }

  async function signIn(email, password) {
    await ensureReady();
    await fb.auth$.signInWithEmailAndPassword(fb.auth, (email || '').trim(), password || '');
    await waitForUser();
  }

  async function signUp(email, password) {
    if (!options.allowSignup) throw new Error('Cadastro desativado.');
    await ensureReady();
    await fb.auth$.createUserWithEmailAndPassword(fb.auth, (email || '').trim(), password || '');
    await waitForUser();
  }

  async function resetPassword(email) {
    email = (email || '').trim();
    if (!email) throw new Error('Digite o seu e-mail no campo acima para receber o link.');
    await ensureReady();
    await fb.auth$.sendPasswordResetEmail(fb.auth, email);
  }

  async function signOutUser() {
    if (fb) await fb.auth$.signOut(fb.auth);
  }

  // ── Interface ───────────────────────────────────────────────
  const LABELS = {
    unconfigured: '💾 Só neste aparelho',
    loading: '⏳ Carregando…',
    local: '🔐 Entrar',
    syncing: '🔄 Sincronizando…',
    ok: '☁️ Sincronizado',
    pending: '⏳ Pendente',
    error: '⚠️ Erro na sincronização'
  };

  function statusText() {
    switch (state.status) {
      case 'unconfigured': return 'Login ainda não configurado (firebase-config.js). Os resultados ficam só neste aparelho.';
      case 'loading': return 'Carregando login…';
      case 'local': return state.message || ('Sem login: os resultados ficam só neste aparelho' + (isPending() ? ' e serão enviados quando você entrar.' : '.'));
      case 'syncing': return 'Sincronizando com a nuvem…';
      case 'ok': {
        if (state.message) return state.message;
        const last = localStorage.getItem(KEY_LAST_SYNC);
        return 'Tudo sincronizado' + (last ? ' em ' + new Date(last).toLocaleString('pt-BR') : '') + '.';
      }
      default: return state.message || (state.status === 'pending' ? 'Há resultados aguardando envio.' : 'Erro ao sincronizar.');
    }
  }

  function $(id) { return document.getElementById(id); }

  function renderStatus() {
    const btn = $('sync-status-btn');
    if (btn) {
      let label = LABELS[state.status] || LABELS.local;
      if (state.status === 'local' && isPending()) label = '🔐 Entrar (⏳ pendente)';
      btn.textContent = label;
      btn.dataset.status = state.status;
      btn.title = statusText();
    }
    const detail = $('sync-status-detail');
    if (detail) detail.textContent = statusText();
  }

  function renderAuth() {
    const loggedIn = !!currentUser;
    const out = $('auth-logged-out');
    const inn = $('auth-logged-in');
    if (out) out.classList.toggle('hidden', loggedIn || !isConfigured());
    if (inn) inn.classList.toggle('hidden', !loggedIn);
    const who = $('auth-user-email');
    if (who) who.textContent = loggedIn ? (currentUser.email || '') : '';
    const signup = $('auth-signup-btn');
    if (signup) signup.classList.toggle('hidden', !options.allowSignup);
    const unconf = $('auth-unconfigured');
    if (unconf) unconf.classList.toggle('hidden', isConfigured());
  }

  function setMsg(text, isError) {
    const el = $('auth-modal-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--error)' : 'var(--success)';
  }

  function openModal() {
    const modal = $('auth-modal');
    if (!modal) return;
    setMsg('');
    renderAuth();
    renderStatus();
    modal.classList.remove('hidden');
    const email = $('auth-email');
    if (email && !currentUser && isConfigured()) email.focus();
  }

  function closeModal() {
    const modal = $('auth-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function withBusy(btn, fn) {
    if (btn) btn.disabled = true;
    try { await fn(); } finally { if (btn) btn.disabled = false; }
  }

  function bindUI() {
    const form = $('auth-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy($('auth-login-btn'), async () => {
        setMsg('Entrando…', false);
        try {
          await signIn($('auth-email').value, $('auth-password').value);
          $('auth-password').value = '';
          setMsg('✅ Login feito. Sincronizando…', false);
          await syncNow();
          setMsg(state.status === 'error' ? statusText() : '✅ Login feito e dados sincronizados.', state.status === 'error');
        } catch (err) {
          setMsg(friendlyError(err), true);
        }
      });
    });

    const reset = $('auth-reset-btn');
    if (reset) reset.addEventListener('click', () => withBusy(reset, async () => {
      try {
        await resetPassword($('auth-email').value);
        setMsg('📧 Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.', false);
      } catch (err) {
        setMsg(friendlyError(err), true);
      }
    }));

    const signup = $('auth-signup-btn');
    if (signup) signup.addEventListener('click', () => withBusy(signup, async () => {
      try {
        await signUp($('auth-email').value, $('auth-password').value);
        setMsg('✅ Conta criada.', false);
      } catch (err) {
        setMsg(friendlyError(err), true);
      }
    }));

    const logout = $('auth-logout-btn');
    if (logout) logout.addEventListener('click', () => withBusy(logout, async () => {
      await signOutUser();
      setMsg('Você saiu. Os resultados continuam salvos neste aparelho.', false);
    }));

    const syncBtn = $('sync-now-btn');
    if (syncBtn) syncBtn.addEventListener('click', () => withBusy(syncBtn, async () => {
      setMsg('');
      await syncNow();
      setMsg(statusText(), state.status === 'error');
    }));

    const close = $('auth-close-btn');
    if (close) close.addEventListener('click', closeModal);
    const modal = $('auth-modal');
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    const statusBtn = $('sync-status-btn');
    if (statusBtn) statusBtn.addEventListener('click', openModal);
  }

  function startFirebase() {
    setState('loading');
    initFirebase().catch((e) => {
      console.warn('[firebase]', e);
      setState(isPending() ? 'pending' : 'error', 'Não foi possível carregar o login (sem internet?). Os resultados ficam salvos neste aparelho.');
    });
  }

  function init() {
    getDeviceId();
    bindUI();
    renderAuth();
    if (!isConfigured()) {
      setState('unconfigured');
      return;
    }
    startFirebase();
    window.addEventListener('online', () => {
      if (!fb) startFirebase();
      else if (currentUser) syncNow();
    });
    window.addEventListener('offline', () => {
      if (currentUser && isPending()) setState('pending', OFFLINE_MSG);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentUser && isPending()) syncNow();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CloudSync = {
    addSession,
    syncNow,
    getData: loadLocal,
    getStatus: () => Object.assign({}, state),
    isLoggedIn: () => !!currentUser,
    openModal,
    closeModal,
    _mergeDocs: mergeDocs
  };
})();
