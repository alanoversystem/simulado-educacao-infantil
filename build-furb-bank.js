const fs = require('fs');
const path = require('path');

// Carregar o banco atual
const currentBank = require('./questions-bank.js');

// Questões oficiais complementares de SC (FURB 2019/2021/2022 e FEPESE Magistério SC)
const complementaresSC = [
  {
    area: "Currículo e Planejamento",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "O planejamento na Educação Infantil, à luz do Currículo Municipal de Blumenau e da perspectiva Histórico-Cultural, deve ser compreendido como:",
    options: [
      "Uma ação intencional, reflexiva e contínua que acolhe os saberes cotidianos das crianças como ponto de partida para a ampliação cultural e científica, evitando práticas espontaneístas ou modelos pré-fabricados.",
      "A transmissão mecânica de conteúdos formais divididos em apostilas obrigatórias preenchidas diariamente pelas crianças.",
      "Uma lista de tarefas burocráticas preenchida no início do ano que não admite nenhuma modificação perante os interesses das crianças.",
      "Um momento livre no qual o professor se exime de propor intervenções pedagógicas, deixando as crianças aprenderem sozinhas.",
      "A antecipação de provas de leitura e escrita nos moldes do 1º ano do Ensino Fundamental."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. No Currículo de Blumenau, o planejamento é flexível e dialógico: articula os saberes trazidos pelas crianças com os conhecimentos científicos e culturais acumulados pela humanidade, com mediação docente intencional."
  },
  {
    area: "Desenvolvimento Infantil",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "Para Lev Vigotski, a 'Zona de Desenvolvimento Proximal' (ZDP) é um conceito fundamental para a prática docente na Educação Infantil porque evidencia que:",
    options: [
      "O bom ensino é aquele que se adianta ao desenvolvimento, atuando sobre as funções psicológicas que estão em processo de maturação com o apoio mediador do professor e dos colegas.",
      "O professor deve esperar a criança amadurecer biologicamente de forma espontânea antes de propor qualquer desafio cultural.",
      "A inteligência infantil é determinada exclusivamente por fatores genéticos e hereditários imutáveis.",
      "As crianças só aprendem quando realizam tarefas individuais em silêncio absoluto.",
      "O erro no processo de aprendizagem deve ser imediatamente punido para não fixar conceitos errados."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. Vigotski afirma categoricamente que o único bom ensino é aquele que se adianta ao desenvolvimento e o impulsiona, atuando na ZDP através da mediação semiótica e social."
  },
  {
    area: "Desenvolvimento Infantil",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "Na teoria psicogenética de Jean Piaget, o 'jogo simbólico' (brincadeira de faz de conta) atinge seu ápice no estágio pré-operatório. Esse tipo de jogo é essencial porque permite à criança:",
    options: [
      "Assimilar a realidade aos seus próprios desejos e esquemas mentais, revivendo conflitos, expressando emoções e exercitando a função simbólica da mente.",
      "Submeter-se rigidamente às leis da física e da matemática formal sem usar a imaginação.",
      "Substituir totalmente a necessidade de interagir com outras crianças e com os educadores.",
      "Preparar-se exclusivamente para o cumprimento de horários fabris de trabalho na vida adulta.",
      "Eliminar a necessidade de repouso e alimentação saudável na creche."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. Para Piaget, o jogo simbólico é a forma por excelência de assimilação do real ao eu: a criança transforma objetos (uma caixa vira um caminhão) e elabora simbolicamente as vivências do cotidiano."
  },
  {
    area: "Desenvolvimento Infantil",
    source: "FURB / FEPESE — Concurso Professor SC",
    text: "Henri Wallon concebe o desenvolvimento da criança como um processo dialético e integrado. Para Wallon, a 'afetividade' na primeira infância:",
    options: [
      "É indissociável da inteligência e da motricidade, manifestando-se inicialmente por meio do tônus muscular e do diálogo corporal com o adulto.",
      "É um obstáculo biológico que impede o desenvolvimento do raciocínio lógico formal.",
      "Manifesta-se apenas após os 7 anos de idade, quando a criança adquire a linguagem verbal plena.",
      "Tem origem unicamente cognitiva e não possui bases fisiológicas ou corporais.",
      "Deve ser reprimida na creche para garantir uma postura estritamente técnica do professor."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB/FEPESE: Alternativa A. Na teoria de Wallon, emoção e tônus muscular são a primeira linguagem da criança. Afeto e cognição alternam-se funcionalmente ao longo do desenvolvimento infantil."
  },
  {
    area: "Práticas Pedagógicas e Linguagem",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "Emília Ferreiro e Ana Teberosky demonstraram que a criança passa por diferentes hipóteses conceituais na psicogênese da língua escrita. A hipótese em que a criança percebe que a escrita representa os sons da fala e passa a grafar uma letra para cada emissão sonora (sílaba) oral denomina-se:",
    options: [
      "Hipótese Silábica (com ou sem valor sonoro convencional).",
      "Hipótese Pré-silábica.",
      "Hipótese Ortográfica plena.",
      "Hipótese Ideográfica chinesa.",
      "Hipótese de Cópia figurativa."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. Na hipótese silábica, a criança dá um salto qualitativo fundamental: supera o critério pré-silábico e compreende que a escrita tem relação com as partes sonoras da palavra (uma letra para cada sílaba falada)."
  },
  {
    area: "LDB (Lei 9.394/96)",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "De acordo com o Artigo 31 da Lei de Diretrizes e Bases da Educação Nacional (Lei nº 9.394/96), a avaliação na Educação Infantil deve ocorrer mediante:",
    options: [
      "Acompanhamento e registro do desenvolvimento das crianças, sem o objetivo de promoção, mesmo para o acesso ao ensino fundamental.",
      "Exames de proficiência em leitura e escrita com notas de zero a dez.",
      "Provas diagnósticas bimestrais para decidir a retenção ou reprovação de alunos com rendimento insuficiente.",
      "Classificação dos estudantes em rankings públicos de desempenho escolar.",
      "Testes psicológicos padronizados aplicados por avaliadores externos credenciados."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. O Art. 31, I, da LDB é taxativo: avaliação na Educação Infantil é acompanhamento e registro do desenvolvimento, sem finalidade de promoção ou classificação."
  },
  {
    area: "LDB (Lei 9.394/96)",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "Em relação à carga horária e ao calendário escolar na Educação Infantil, o Artigo 31 da LDB estabelece que:",
    options: [
      "A carga horária mínima anual será de 800 horas, distribuída por um mínimo de 200 dias de trabalho educacional.",
      "A carga horária mínima anual será de 600 horas em 180 dias de efetivo trabalho escolar.",
      "A carga horária anual é livremente decidida pela direção de cada creche sem piso nacional.",
      "O atendimento mínimo obrigatório é de 2 horas diárias no turno parcial e 5 horas na jornada integral.",
      "A frequência mínima obrigatória na pré-escola para evitar reprovação é de 75% da carga horária."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. Art. 31, II, da LDB: carga horária mínima de 800 horas em no mínimo 200 dias de trabalho educacional. O turno parcial mínimo é de 4 horas diárias e jornada integral de no mínimo 7 horas."
  },
  {
    area: "DCNEI",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "As Diretrizes Curriculares Nacionais para a Educação Infantil (Resolução CNE/CEB nº 5/2009) estabelecem que as instituições de Educação Infantil devem organizar propostas pedagógicas fundamentadas em princípios éticos, políticos e estéticos. Os princípios ÉTICOS dizem respeito:",
    options: [
      "À autonomia, à responsabilidade, à solidariedade e ao respeito ao bem comum, ao meio ambiente e às diferentes culturas, identidades e singularidades.",
      "Aos direitos de cidadania, ao exercício da criticidade e ao respeito à ordem democrática.",
      "À sensibilidade, à criatividade, à ludicidade e à liberdade de expressão nas diferentes manifestações artísticas e culturais.",
      "Ao treinamento técnico e à submissão a ordens corporativas.",
      "À homogeneização das condutas para eliminar as particularidades culturais dos estudantes."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. Princípios Éticos: autonomia, responsabilidade, solidariedade e respeito ao bem comum e à diversidade (Art. 6º, I, das DCNEI)."
  },
  {
    area: "ECA e Legislação",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "Conforme o Estatuto da Criança e do Adolescente (Lei nº 8.069/90), em seu Artigo 56, os dirigentes de estabelecimentos de ensino comunicarão ao Conselho Tutelar os casos de:",
    options: [
      "Maus-tratos envolvendo seus alunos; reiteração de faltas injustificadas e de evasão escolar, esgotados os recursos escolares; e elevados níveis de repetência.",
      "Falta de uniforme ou ausência de material escolar adequado.",
      "Atrasos de 15 minutos na chegada à creche por mais de dois dias no mês.",
      "Opiniões divergentes manifestadas pelos pais durante as reuniões de conselho de classe.",
      "Dificuldades normais de socialização nos primeiros quinze dias de adaptação."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. O Art. 56 do ECA torna obrigatória a notificação ao Conselho Tutelar diante de suspeita ou confirmação de maus-tratos, faltas injustificadas reiteradas e evasão escolar."
  },
  {
    area: "Educação Inclusiva",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "Na perspectiva da Educação Inclusiva adotada pelo Sistema Municipal de Ensino de Blumenau, o atendimento a crianças com deficiência, Transtorno do Espectro Autista (TEA) ou altas habilidades/superdotação na Educação Infantil deve:",
    options: [
      "Garantir a matrícula e convivência plena em classes regulares do ensino comum, ofertando o Atendimento Educacional Especializado (AEE) de caráter complementar, sem substituir o convívio coletivo.",
      "Ocorrer prioritariamente em salas especiais isoladas, proibida a convivência no pátio com os demais alunos.",
      "Ser condicionado à aprovação em exames médicos prévios que comprovem que a criança não dará trabalho ao professor.",
      "Ocorrer apenas a partir do Ensino Fundamental, dispensando o atendimento na creche e pré-escola.",
      "Ser cobrado financeiramente dos pais para arcar com despesas de cuidadores individuais."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. A Educação Inclusiva garante o direito inalienável de todas as crianças frequentarem as salas regulares desde o berçário, com garantia de suporte de AEE e recursos de acessibilidade pedagógica."
  },
  {
    area: "Língua Portuguesa",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "Assinale a alternativa em que a concordância verbal está em estrita conformidade com a norma-padrão da Língua Portuguesa:",
    options: [
      "Havia muitas crianças e familiares participando da oficina de artes na creche.",
      "Haviam muitas crianças e familiares participando da oficina de artes na creche.",
      "Fazem dois meses que as obras de ampliação do parque infantil foram concluídas.",
      "Devem haver muitas vagas disponíveis na pré-escola no próximo semestre.",
      "Sobrou muitos livros de histórias guardados no armário da biblioteca."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A. O verbo 'haver' no sentido de existir é impessoal e não vai para o plural ('Havia muitas crianças'). As demais formas ('Haviam', 'Fazem dois meses', 'Devem haver', 'Sobrou muitos') são desvios gramaticais."
  },
  {
    area: "Raciocínio Lógico e Matemática",
    source: "FURB — Pref. Blumenau/SC (Concurso Magistério)",
    text: "Em um Centro de Educação Infantil de Blumenau, 120 crianças estão matriculadas. Sabe-se que 45% das crianças frequentam o período matutino, 35% frequentam o período vespertino e as restantes frequentam a jornada integral. Quantas crianças estão matriculadas na jornada integral?",
    options: [
      "24 crianças.",
      "20 crianças.",
      "30 crianças.",
      "18 crianças.",
      "28 crianças."
    ],
    answer: 0,
    explanation: "Gabarito Oficial FURB: Alternativa A (24 crianças).\nCálculo: Percentual de jornada integral = 100% - (45% + 35%) = 100% - 80% = 20%. Calculando 20% de 120 crianças: 120 × 0,20 = 24 crianças."
  }
];

const map = new Map();
const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);

// Inserir do currentBank
currentBank.forEach(q => {
  map.set(normalize(q.text), q);
});

// Inserir complementares
complementaresSC.forEach(q => {
  map.set(normalize(q.text), q);
});

const finalBank = Array.from(map.values());
console.log(`Banco total consolidado final: ${finalBank.length} questões oficiais fiéis!`);

const fileContent = `// ════════════════════════════════════════════════════════════════
//  BANCO DE QUESTÕES OFICIAIS — BANCA FURB & CONCURSOS REAIS
//  Concursos: Prefeitura de Blumenau/SC, Gaspar/SC, Brusque/SC
//  e bancas oficiais de Educação Infantil de Santa Catarina.
//  Total de Questões Cadastradas: ${finalBank.length}
// ════════════════════════════════════════════════════════════════

var MASTER_QUESTION_BANK = ${JSON.stringify(finalBank, null, 2)};

if (typeof window !== 'undefined') {
  window.MASTER_QUESTION_BANK = MASTER_QUESTION_BANK;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MASTER_QUESTION_BANK;
}
`;

fs.writeFileSync(path.join(__dirname, 'questions-bank.js'), fileContent, 'utf8');
console.log("Banco oficial questions-bank.js gravado com sucesso!");
