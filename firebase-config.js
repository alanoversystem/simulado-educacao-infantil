/**
 * CONFIGURAÇÃO DO FIREBASE
 *
 * ➜ PREENCHA AQUI com os valores do seu projeto:
 *   Console do Firebase → ⚙️ Configurações do projeto → Geral → "Seus apps" → app da Web → "Configuração do SDK".
 *
 * Esses valores NÃO são segredos: a apiKey do Firebase identifica o projeto e pode ficar pública.
 * Quem protege os dados são o login (Authentication) e as regras do Firestore (firestore.rules).
 *
 * Enquanto os valores de exemplo abaixo não forem trocados, o simulado funciona normalmente,
 * apenas sem login e sem sincronização.
 */
window.FIREBASE_CONFIG = {
  apiKey: 'COLE_AQUI_A_API_KEY',
  authDomain: 'SEU-PROJETO.firebaseapp.com',
  projectId: 'SEU-PROJETO',
  storageBucket: 'SEU-PROJETO.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000'
};

window.FIREBASE_OPTIONS = {
  // Cadastro pelo site desligado: a conta é criada no console do Firebase.
  // Mude para true apenas se quiser mostrar o botão "Criar conta" na tela de login.
  allowSignup: false
};
