/**
 * AUTENTICAÇÃO E CRIPTOGRAFIA - SALVAR NO GITHUB
 * Autentica usuários simples com criptografia AES-256
 * Salva dados persistentemente no GitHub (user-data.json)
 */

// ════════════════════════════════════════════════════════════
//  CRIPTOGRAFIA AES-256 (CLIENT-SIDE)
// ════════════════════════════════════════════════════════════

/**
 * Hash da senha usando SHA-256
 */
function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Criptografar texto com chave (AES-GCM)
 */
function encrypt(text, key) {
  const enc = new TextEncoder();
  const encoded = enc.encode(text);
  
  const keyData = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    keyData,
    encoded
  );
  
  // Adicionar IV ao ciphertext
  const buffer = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  buffer.set(new Uint8Array(iv));
  buffer.set(new Uint8Array(ciphertext), iv.byteLength);
  
  return btoa(String.fromCharCode(...buffer));
}

/**
 * Descriptografar texto com chave (AES-GCM)
 */
function decrypt(encryptedText, key) {
  try {
    const decoded = atob(encryptedText);
    const buffer = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      buffer[i] = decoded.charCodeAt(i);
    }
    
    const ivLength = 12;
    const ciphertext = new Uint8Array(buffer.slice(ivLength));
    const iv = new Uint8Array(buffer.slice(0, ivLength));
    
    const keyData = await crypto.subtle.importKey(
      'raw',
      enc.encode(key),
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const plaintext = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      keyData,
      ciphertext
    );
    
    return new TextDecoder().decode(plaintext);
  } catch (e) {
    console.error('Erro ao descriptografar:', e);
    throw new Error('Senha incorreta');
  }
}

// ════════════════════════════════════════════════════════════
//  GITHUB API - SALVAR/LER DO ARQUIVO
// ════════════════════════════════════════════════════════════

const GITHUB_API_URL = 'https://api.github.com';
const REPO_OWNER = 'alanoversystem';
const REPO_NAME = 'simulado-educacao-infantil';
const FILE_PATH = 'user-data.json';

/**
 * Salvar arquivo no GitHub (PATCH)
 */
async function saveToGitHub(data) {
  try {
    const response = await fetch(`${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        message: `Update user data - ${new Date().toISOString()}`,
        content: JSON.stringify(data),
        sha: null // Salvar novo arquivo
      })
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (e) {
    console.error('Erro ao salvar no GitHub:', e);
    throw e;
  }
}

/**
 * Ler arquivo do GitHub (GET)
 */
async function readFromGitHub() {
  try {
    const response = await fetch(`${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`);
    
    if (!response.ok) {
      // Arquivo não existe, criar com dados padrão
      return createDefaultData();
    }
    
    const content = await response.json();
    
    if (content.download_url) {
      const dataResponse = await fetch(content.download_url);
      return await dataResponse.json();
    }
    
    throw new Error('Não foi possível ler o arquivo');
  } catch (e) {
    console.error('Erro ao ler do GitHub:', e);
    return createDefaultData();
  }
}

/**
 * Criar dados padrão se não existir
 */
function createDefaultData() {
  return {
    users: [
      {
        username: 'taiza',
        passwordHash: null, // Será gerado ao primeiro login
        createdAt: null
      }
    ],
    userData: {},
    lastUpdated: new Date().toISOString()
  };
}

// ════════════════════════════════════════════════════════════
//  AUTENTICAÇÃO DE USUÁRIO
// ════════════════════════════════════════════════════════════

/**
 * Verificar se usuário existe
 */
async function checkUserExists(username) {
  const data = await readFromGitHub();
  return data.users.some(u => u.username === username);
}

/**
 * Criar conta de novo usuário (primeiro login)
 */
async function createAccount(username, password) {
  // Hash da senha
  const passwordHash = sha256(password);
  
  const data = await readFromGitHub();
  const userIndex = data.users.findIndex(u => u.username === username);
  
  if (userIndex >= 0) {
    throw new Error('Usuário já existe');
  }
  
  // Adicionar usuário
  data.users.push({
    username: username,
    passwordHash: passwordHash,
    createdAt: new Date().toISOString()
  });
  
  await saveToGitHub(data);
  return true;
}

/**
 * Autenticar usuário existente
 */
async function authenticate(username, password) {
  const data = await readFromGitHub();
  const userIndex = data.users.findIndex(u => u.username === username && u.passwordHash !== null);
  
  if (userIndex < 0 || !data.users[userIndex].passwordHash) {
    throw new Error('Usuário não encontrado ou senha incorreta');
  }
  
  // Criptografar a senha fornecida com o hash salvo e comparar
  const encryptedPassword = encrypt(password, data.users[userIndex].passwordHash);
  
  if (encryptedPassword !== sha256(password)) {
    throw new Error('Senha incorreta');
  }
  
  return true;
}

/**
 * Salvar dados de desempenho para usuário
 */
async function saveUserData(username, userData) {
  const data = await readFromGitHub();
  
  // Atualizar userData do usuário
  if (!data.userData[username]) {
    data.userData[username] = {};
  }
  
  Object.assign(data.userData[username], userData);
  data.lastUpdated = new Date().toISOString();
  
  await saveToGitHub(data);
}

/**
 * Carregar dados de desempenho do usuário
 */
async function loadUserData(username) {
  const data = await readFromGitHub();
  return data.userData[username] || {};
}

// ════════════════════════════════════════════════════════════
//  SALVAMENTO NO GITHUB
// ════════════════════════════════════════════════════════════

/**
 * Salvar dados de desempenho para usuário no GitHub
 */
async function saveUserDataToGitHub(username, userData) {
  try {
    await saveUserDataToGitHubFile(username, userData);
    
    // Atualizar localStorage para uso imediato
    const existing = JSON.parse(localStorage.getItem('simulado_user_data_' + username) || '{}');
    Object.assign(existing, userData);
    localStorage.setItem('simulado_user_data_' + username, JSON.stringify(existing));
    
    console.log(`💾 Dados salvos no GitHub para ${username}:`, userData);
  } catch (e) {
    console.error('Erro ao salvar dados no GitHub:', e);
  }
}

/**
 * Salvar dados no GitHub
 */
async function saveUserDataToGitHubFile(username, userData) {
  const data = await readFromGitHub();
  
  // Atualizar userData do usuário
  if (!data.userData[username]) {
    data.userData[username] = {};
  }
  
  Object.assign(data.userData[username], userData);
  data.lastUpdated = new Date().toISOString();
  
  await saveToGitHub(data);
}

/**
 * Ler dados do GitHub
 */
async function loadUserDataFromGitHub(username) {
  const data = await readFromGitHub();
  return data.userData[username] || {};
}

// ════════════════════════════════════════════════════════════
//  INTERFACE DE LOGIN/REGISTRO
// ════════════════════════════════════════════════════════════

/**
 * Mostrar tela de login
 */
function showLoginScreen() {
  const loginContainer = document.getElementById('login-container');
  if (loginContainer) {
    loginContainer.style.display = 'block';
    document.body.classList.add('login-mode');
    
    // Esconder elementos do simulado
    document.querySelectorAll('[data-hide-on-login]').forEach(el => {
      el.style.display = 'none';
    });
  }
}

/**
 * Ocultar tela de login
 */
function hideLoginScreen() {
  const loginContainer = document.getElementById('login-container');
  if (loginContainer) {
    loginContainer.style.display = 'none';
    document.body.classList.remove('login-mode');
    
    // Mostrar elementos do simulado
    document.querySelectorAll('[data-hide-on-login]').forEach(el => {
      el.style.display = '';
    });
  }
}

/**
 * Registrar novo usuário (primeiro login)
 */
async function registerUser(username, password) {
  try {
    await createAccount(username, password);
    alert('Conta criada com sucesso! Faça login.');
    showLoginScreen();
  } catch (e) {
    alert(e.message || 'Erro ao criar conta');
  }
}

/**
 * Autenticar usuário existente
 */
async function loginUser(username, password) {
  try {
    await authenticate(username, password);
    
    // Salvar sessão no localStorage
    sessionStorage.setItem('simulado_user', username);
    
    hideLoginScreen();
    return true;
  } catch (e) {
    alert(e.message || 'Erro ao fazer login');
    return false;
  }
}

/**
 * Sair do sistema
 */
function logoutUser() {
  sessionStorage.removeItem('simulado_user');
  hideLoginScreen();
}

// ════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', async () => {
  // Verificar se já existe usuário registrado
  const userExists = await checkUserExists('taiza');
  
  if (!userExists) {
    // Primeiro login - mostrar tela de registro
    showLoginScreen();
    
    // Adicionar formulário de registro
    addRegistrationForm();
  } else {
    // Usuário existe - carregar dados e mostrar simulado
    loadUserData('taiza');
  }
});

/**
 * Adicionar formulário de registro (primeiro login)
 */
function addRegistrationForm() {
  const form = document.createElement('form');
  form.id = 'registration-form';
  form.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
  `;
  
  const container = document.createElement('div');
  container.style.cssText = `
    background: white; padding: 30px; border-radius: 12px;
    text-align: center; max-width: 400px; width: 90%;
  `;
  
  const title = document.createElement('h2');
  title.textContent = '🔐 Primeiro Login';
  title.style.cssText = `margin-bottom: 16px; color: var(--primary);`;
  
  const usernameInput = document.createElement('input');
  usernameInput.type = 'text';
  usernameInput.id = 'reg-username';
  usernameInput.placeholder = 'Seu nome de usuário';
  usernameInput.style.cssText = `width: 100%; padding: 12px; margin-bottom: 8px; border: 2px solid var(--border); border-radius: 6px; box-sizing: border-box;`;
  
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.id = 'reg-password';
  passwordInput.placeholder = 'Sua senha (mínimo 8 caracteres)';
  passwordInput.style.cssText = `width: 100%; padding: 12px; margin-bottom: 8px; border: 2px solid var(--border); border-radius: 6px; box-sizing: border-box;`;
  
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Criar Conta';
  submitBtn.style.cssText = `width: 100%; padding: 12px; margin-top: 8px; background: var(--primary); color: white; border: none; border-radius: 6px; font-size: 1rem; font-weight: bold; cursor: pointer`;
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.style.cssText = `width: 100%; padding: 12px; margin-top: 8px; background: transparent; color: var(--text-muted); border: none; border-radius: 6px; font-size: 1rem; cursor: pointer`;
  
  form.appendChild(container);
  container.appendChild(title);
  container.appendChild(usernameInput);
  container.appendChild(passwordInput);
  container.appendChild(submitBtn);
  container.appendChild(cancelBtn);
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
      alert('Preencha todos os campos');
      return;
    }
    
    if (password.length < 8) {
      alert('A senha deve ter pelo menos 8 caracteres');
      return;
    }
    
    try {
      await registerUser(username, password);
      
      // Redirecionar para o simulado
      hideLoginScreen();
      window.location.href = '?session=' + username;
    } catch (e) {
      alert(e.message || 'Erro ao registrar');
    }
  });
  
  cancelBtn.addEventListener('click', () => {
    form.remove();
    showLoginScreen();
  });
  
  document.body.appendChild(form);
}
