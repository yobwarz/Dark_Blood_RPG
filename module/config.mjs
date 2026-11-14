/** Constantes do sistema Sangue Escuro, extraídas do DRS (Guia dos Mortos 4). */

export const ATRIBUTOS = {
  for: { sigla: "FOR", nome: "Força" },
  agi: { sigla: "AGI", nome: "Agilidade" },
  con: { sigla: "CON", nome: "Constituição" },
  int: { sigla: "INT", nome: "Inteligência" },
  sab: { sigla: "SAB", nome: "Sabedoria" },
  san: { sigla: "SAN", nome: "Sanidade" },
  car: { sigla: "CAR", nome: "Carisma" }
};

/** Perícias do capítulo 05. attr = atributo padrão; alt = alternativa citada no texto. */
export const PERICIAS = {
  atletismo:        { nome: "Atletismo",          attr: "for", grupo: "fisicas" },
  acrobacia:        { nome: "Acrobacia",          attr: "agi", grupo: "fisicas" },
  furtividade:      { nome: "Furtividade",        attr: "agi", grupo: "fisicas" },
  prestidigitacao:  { nome: "Prestidigitação",    attr: "agi", grupo: "fisicas" },
  resistenciaFisica:{ nome: "Resistência Física", attr: "con", grupo: "fisicas" },

  armasBrancas:     { nome: "Armas Brancas",      attr: "for", alt: "agi", grupo: "combate" },
  armasFogo:        { nome: "Armas de Fogo",      attr: "agi", grupo: "combate" },

  ciencias:         { nome: "Ciências",           attr: "int", grupo: "tecnicas" },
  engenharia:       { nome: "Engenharia",         attr: "int", grupo: "tecnicas" },
  mecanica:         { nome: "Mecânica",           attr: "int", grupo: "tecnicas" },
  eletronica:       { nome: "Eletrônica",         attr: "int", grupo: "tecnicas" },
  medicina:         { nome: "Medicina",           attr: "int", grupo: "tecnicas" },
  investigacao:     { nome: "Investigação",       attr: "int", grupo: "tecnicas" },
  tecnologia:       { nome: "Tecnologia",         attr: "int", grupo: "tecnicas" },
  oficio:           { nome: "Ofício",             attr: "int", alt: "agi", grupo: "tecnicas" },
  conhecimento:     { nome: "Conhecimento",       attr: "int", grupo: "tecnicas" },

  percepcao:        { nome: "Percepção",          attr: "sab", grupo: "sobrevivencia" },
  sobrevivencia:    { nome: "Sobrevivência",      attr: "sab", grupo: "sobrevivencia" },
  rastreamento:     { nome: "Rastreamento",       attr: "sab", grupo: "sobrevivencia" },
  orientacao:       { nome: "Orientação",         attr: "sab", grupo: "sobrevivencia" },
  natureza:         { nome: "Natureza",           attr: "sab", grupo: "sobrevivencia" },
  conducao:         { nome: "Condução",           attr: "agi", grupo: "sobrevivencia" },

  persuasao:        { nome: "Persuasão",          attr: "car", grupo: "sociais" },
  enganacao:        { nome: "Enganação",          attr: "car", grupo: "sociais" },
  intimidacao:      { nome: "Intimidação",        attr: "car", grupo: "sociais" },
  lideranca:        { nome: "Liderança",          attr: "car", grupo: "sociais" }
};

export const GRUPOS_PERICIA = {
  fisicas: "Físicas",
  combate: "Combate",
  tecnicas: "Técnicas e Intelectuais",
  sobrevivencia: "Exploração e Sobrevivência",
  sociais: "Sociais"
};

export const GRAUS = {
  0: { nome: "Destreinado", bonus: 0 },
  1: { nome: "Proficiente", bonus: 2 },
  2: { nome: "Especialista", bonus: 4 }
};

/** Percepção passiva (cap. 13). */
export const PERCEPCAO_PASSIVA = { 0: 8, 1: 10, 2: 14 };

/** Tabela de modificadores de atributo (cap. 03). */
export function modificador(valor) {
  const v = Number(valor) || 0;
  if (v <= 3) return -4;
  if (v <= 5) return -3;
  if (v <= 7) return -2;
  if (v <= 9) return -1;
  if (v <= 11) return 0;
  if (v <= 13) return 1;
  if (v <= 15) return 2;
  if (v <= 17) return 3;
  return 4;
}

/** Condições gerais (cap. 12) e de combate (cap. 07). */
export const CONDICOES = {
  amedrontado:  "Amedrontado",
  atordoado:    "Atordoado",
  amedrontado:  "Amedrontado",
  cego:         "Cego",
  surdo:        "Surdo",
  desorientado: "Desorientado",
  contido:      "Contido",
  paralisado:   "Paralisado",
  incendiado:   "Incendiado",
  eletrificado: "Eletrificado",
  congelado:    "Congelado",
  agarrado:     "Contido por agarrão (legado)",
  caido:        "Caído",
  incapacitado: "Incapacitado",
  surpreendido: "Surpreendido",
  sangramento:  "Sangramento",
  intoxicado:   "Intoxicado",
  desidratado:  "Desidratação",
  contaminado:  "Contaminado",
  infectado:    "Infecção"
};

export const MOCHILAS = {
  basica: { nome: "Básica", compartimentos: 4 },
  media:  { nome: "Média",  compartimentos: 6 },
  grande: { nome: "Grande", compartimentos: 8 },
  tatica: { nome: "Tática", compartimentos: 10 }
};

/** Quantidade por compartimento (cap. 17). */
export const CATEGORIAS_EQUIPAMENTO = {
  comida:      { nome: "Comida",              porCompartimento: 3 },
  agua:        { nome: "Água (500 mL)",       porCompartimento: 2 },
  municao:     { nome: "Munição",             porCompartimento: 50 },
  medico:      { nome: "Suprimentos médicos", porCompartimento: 3 },
  ferramenta:  { nome: "Ferramentas",         porCompartimento: 1 },
  explosivo:   { nome: "Explosivos",          porCompartimento: 1 },
  tecnologia:  { nome: "Tecnologia",          porCompartimento: 1 },
  documento:   { nome: "Documentos",          porCompartimento: 5 },
  diverso:     { nome: "Materiais diversos",  porCompartimento: 3 }
};

export const TENDENCIAS = ["Compassivo", "Leal", "Pragmático", "Individualista", "Protetor", "Dominador"];

export const GRAVIDADES_FERIMENTO = ["Leve", "Moderado", "Grave", "Crítico"];

export const TIPOS_DANO = ["Contundente", "Cortante", "Perfurante", "Fogo", "Elétrico", "Veneno", "Outro"];

export const EFEITOS_CRITICOS = ["", "Perfuração", "Sangramento", "Atordoamento", "Ferimento Profundo", "Incêndio"];

export const SE = {
  ATRIBUTOS, PERICIAS, GRUPOS_PERICIA, GRAUS, PERCEPCAO_PASSIVA, CONDICOES, MOCHILAS,
  CATEGORIAS_EQUIPAMENTO, TENDENCIAS, GRAVIDADES_FERIMENTO, TIPOS_DANO, EFEITOS_CRITICOS
};
