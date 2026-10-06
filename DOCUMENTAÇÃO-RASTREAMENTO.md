> ⚠️ **Documento desatualizado.** O rastreamento foi reescrito: não há mais ``?session=`` na URL nem ``simulado_performance_data``. Os resultados agora ficam em ``simulado_user_data`` (localStorage) e, com login, no Firestore (``users/{uid}``) — ver ``firebase-sync.js`` e a seção **🔐 Login e Sincronização (Firebase)** do README.

# 📈 Rastreamento de Desempenho Personalizado - Feature NOVA

## 🎯 Objetivo

Implementar um sistema de rastreamento de desempenho que armazena resultados do simulado no navegador da usuária, permitindo gerar estatísticas personalizadas para identificar pontos fracos e fortes em cada área temática.

---

## 🔧 Como Funciona

### 1. Identificação da Usuária
- **Mecanismo**: O sistema identifica a usuária através de um `session_id` salvo no `localStorage`.
- **Opção 1 (Recomendada)**: URL com parâmetro de sessão (`?session=unique-id`)
- **Opção 2**: `localStorage` sem autenticação (mais simples para projetos pessoais)

### 2. Armazenamento de Resultados
Cada resposta a uma questão é salva individualmente no formato:
```json
{
  "questionIndex": 0,
  "answeredAt": "2026-10-06T07:43:58.863Z",
  "userAnswer": 2,
  "correctAnswer": 4,
  "isCorrect": false,
  "area": "Práticas Pedagógicas e Linguagem"
}
```

### 3. Estatísticas Geradas

#### Dados Gerais
- Total de simulados realizados
- Aproveitamento geral acumulado (%)
- Identificação da sessão/usuária

#### Desempenho por Área Temática
Para cada área:
- Número total de questões respondidas
- Número de acertos
- Porcentagem de aproveitamento

#### Desempenho por Região
Comparativo entre:
- **Blumenau/SC**: Questões com `isBlumenau === true`
- **Santa Catarina**: Questões da FURB (não de Blumenau)

#### Pontos Fracos
Lista das 5 áreas com menor desempenho, ideais para foco nos estudos.

---

## 📁 Arquivos Modificados/Criados

### Criado: `performance-tracking.js`
Contém todas as funções do sistema de rastreamento:
- `identifyUser()` - Identifica a usuária
- `saveQuestionResult()` - Salva resultado individual
- `getSessionData()` - Carrega dados salvos
- `getGeneralStats()` - Estatísticas gerais
- `getAreaStats()` - Desempenho por área
- `getRegionStats()` - Desempenho por região
- `getWeakAreas()` - Pontos fracos
- `getStrongAreas()` - Pontos fortes

### Modificado: `index.html`
1. **Importação do script**: Adiciona `<script src="performance-tracking.js"></script>`
2. **Integração com quiz**: 
   - `selectAnswer()` agora chama `saveQuizResult()` ao responder
   - `confirmFinish()` chama `finalizeWithTracking()` antes de mostrar resultados
3. **Tela de Resultados**: Adiciona novas seções:
   - Caixa "Dados Personalizados" com estatísticas gerais
   - Desempenho por região (Blumenau vs SC)
   - Lista de pontos fracos

### Modificado: `questions-bank.js`
- Nenhuma modificação necessária (o sistema usa o banco existente)

---

## 🚀 Como Usar

1. **Acessar o simulado**: Abra `https://alanoversystem.github.io/simulado-educacao-infantil/` no navegador da usuária.

2. **Identificar a sessão** (opcional):
   - Adicione parâmetro de sessão na URL: `?session=my-wife-session-12345`
   - Ou deixe sem parâmetro (usará um ID genérico)

3. **Realizar o simulado**:
   - Escolher filtro (Blumenau ou Toda SC)
   - Escolher quantidade de questões
   - Responder todas as questões

4. **Ver resultados personalizados**:
   - Ao finalizar ("✅ Finalizar Simulado e Ver Gabarito"), todos os dados são salvos automaticamente
   - A tela de resultados exibe:
     * Dados gerais da usuária
     * Desempenho por região
     * Pontos fracos (áreas para focar)

5. **Acessar dados históricos**:
   - No navegador, vá em `localStorage` → `simulado_performance_data`
   - Ou no console do navegador (`F12` → `Console`)
   - Digite: `JSON.stringify(getSessionData())`

---

## 🎨 Design da Tela de Resultados

### Caixa "Dados Personalizados" (verde)
```
👤 Dados Personalizados
─────────────────────
Usuária: Sessão: my-wife-session-12345
Total de Simulados: 3
Aproveitamento Geral: 68%
```

### Desempenho por Região
```
🏛️ Desempenho por Região
┌─────────────────────────────────────────────┐
│ Blumenau/SC │ 15/20 acertos │ 75% ✅        │
│ Santa Catarina │ 8/12 acertos │ 67% ⚠️       │
└─────────────────────────────────────────────┘
```

### Pontos Fracos (laranja)
```
⚠️ Pontos Fracos (Áreas para Focar)
┌──────────────────────────────────────────┐
│ 1º Práticas Pedagógicas e Linguagem      │
│    8/15 acertos (53%)                    │
│    ████████░░░░░░░░░░░░░░░░░░░░░░ 53%   │
└──────────────────────────────────────────┘
```

---

## 🔒 Privacidade e Segurança

- **Sem Backend**: Todos os dados ficam salvos no navegador da usuária (`localStorage`)
- **Sem Cadastro**: Não requer login ou registro
- **Acesso Local**: Apenas a usuária que acessa o simulado pode ver seus dados
- **Exportação**: Dados podem ser exportados via console do navegador se necessário

---

## 📊 Exemplo de Uso Real

### Cenário: Primeira Prova da Esposa
```javascript
// URL acessada: https://alanoversystem.github.io/simulado-educacao-infantil/?session=my-wife-session-12345
localStorage.getItem('simulado_session_id') // "my-wife-session-12345"

// Após finalizar simulado de 30 questões:
getGeneralStats() 
// { total: 1, hits: 18, miss: 9, skip: 3, pct: 60 }

getAreaStats()
// {
//   "LDB (Lei 9.394/96)": { hits: 2, total: 3, pct: 67 },
//   "Práticas Pedagógicas e Linguagem": { hits: 5, total: 8, pct: 63 },
//   ...
// }

getWeakAreas()
// [
//   { area: "Linguística Aplicada", pct: 40, hits: 2, total: 5 },
//   { area: "Desenvolvimento Infantil", pct: 50, hits: 3, total: 6 },
//   ...
// ]
```

---

## 🔄 Fluxo Completo

1. Usuária acessa o simulado com URL personalizada
2. Sistema identifica a usuária via `session_id`
3. Usuária realiza um simulado (ex: 30 questões)
4. Ao responder cada questão, resultado é salvo individualmente
5. Ao finalizar, todos os resultados são salvos via `finalizeWithTracking()`
6. Tela de resultados exibe estatísticas personalizadas
7. Próxima vez que a usuária fizer um simulado, dados anteriores serão somados

---

## 🎯 Benefícios para o Projeto

1. **Personalização**: Cada usuária tem seus próprios dados salvos
2. **Progresso**: Possibilita acompanhar evolução ao longo do tempo
3. **Foco nos Estudos**: Identifica automaticamente áreas para melhorar
4. **Simplicidade**: Funciona sem backend ou cadastro
5. **Privacidade**: Dados ficam no navegador da usuária

---

## 📝 Notas de Implementação

- As funções são exportadas globalmente (`window.*`) para serem chamadas pelo `index.html`
- O rastreamento é ativado automaticamente ao responder questões
- Não há impacto na performance do quiz original
- Funciona offline após o primeiro carregamento (gracias ao cache do navegador)
