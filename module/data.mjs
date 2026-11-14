import { ATRIBUTOS, PERICIAS, CONDICOES, MOCHILAS, CATEGORIAS_EQUIPAMENTO, TIPOS_DANO, EFEITOS_CRITICOS,
  GRAVIDADES_FERIMENTO, modificador, PERCEPCAO_PASSIVA, GRAUS } from "./config.mjs";

const f = () => foundry.data.fields;

const int = (initial = 0, extra = {}) =>
  new (f().NumberField)({ required: true, nullable: false, integer: true, initial, ...extra });
const str = (initial = "", extra = {}) =>
  new (f().StringField)({ required: true, blank: true, initial, ...extra });
const bool = (initial = false) => new (f().BooleanField)({ initial });
const html = () => new (f().HTMLField)({ required: true, blank: true, initial: "" });

/** Reserva com valor atual e máximo. */
const reserva = (valor, max, extra = {}) =>
  new (f().SchemaField)({
    value: int(valor, { min: 0, ...extra }),
    max: int(max, { min: 0 })
  });

function schemaCondicoes() {
  const campos = {};
  for (const k of Object.keys(CONDICOES)) campos[k] = bool(false);
  return new (f().SchemaField)(campos);
}

function schemaAtributos(inicial = 10) {
  const campos = {};
  for (const k of Object.keys(ATRIBUTOS)) {
    campos[k] = new (f().SchemaField)({ valor: int(inicial, { min: 1, max: 30 }) });
  }
  return new (f().SchemaField)(campos);
}

/* -------------------------------------------------------------------------- */
/*  ATORES                                                                    */
/* -------------------------------------------------------------------------- */

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const pericias = {};
    for (const [k, def] of Object.entries(PERICIAS)) {
      pericias[k] = new (f().SchemaField)({
        grau: int(0, { min: 0, max: 2 }),
        attr: str(def.attr, { choices: Object.keys(ATRIBUTOS), blank: false })
      });
    }
    return {
      atributos: schemaAtributos(10),
      pericias: new (f().SchemaField)(pericias),

      pv: reserva(10, 10),
      ps: reserva(10, 10),                       // Pontos de Sanidade
      estresse: reserva(0, 6),
      fome: reserva(5, 5),                       // Pontos de Fome
      exposicao: reserva(0, 3),                  // Pontos de Exposição
      exaustao: reserva(0, 6),
      sorte: reserva(1, 3),

      pe: new (f().SchemaField)({ disponivel: int(20, { min: 0 }) }),
      idade: int(25, { min: 0 }),
      deslocamentoBase: new (f().NumberField)({ required: true, nullable: false, initial: 12, min: 0 }),
      modTemporario: int(0),

      turno: new (f().SchemaField)({
        acoes: int(3, { min: 0, max: 6 }),
        reacao: int(1, { min: 0, max: 3 }),
        bonus: int(1, { min: 0, max: 3 }),
        divida: bool(false)                      // Dívida de Ação pendente (próximo turno: 2 ações)
      }),
      infeccaoEstagio: int(0, { min: 0, max: 4 }),
      traumaRegistrado: bool(false),

      morte: new (f().SchemaField)({
        sucessos: int(0, { min: 0, max: 3 }),
        fracassos: int(0, { min: 0, max: 3 })
      }),
      condicoes: schemaCondicoes(),
      ferimentos: new (f().ArrayField)(new (f().SchemaField)({
        gravidade: str("Leve", { choices: GRAVIDADES_FERIMENTO, blank: false }),
        local: str(""),
        nota: str("")
      })),

      mochila: str("basica", { choices: Object.keys(MOCHILAS), blank: false }),

      biografia: new (f().SchemaField)({
        conceito: str(""),
        categoria: str("sobrevivente", { choices: ["civil", "sobrevivente"], blank: false }),
        perfil: str(""),
        motivacao: str(""),
        personalidade: str(""),
        tendencia: str(""),
        principio: str(""),
        limite: str(""),
        notas: html()
      })
    };
  }

  prepareDerivedData() {
    for (const [k, a] of Object.entries(this.atributos)) a.mod = modificador(a.valor);
    for (const p of Object.values(this.pericias)) {
      p.bonus = GRAUS[p.grau]?.bonus ?? 0;
      p.grauNome = GRAUS[p.grau]?.nome ?? "";
    }
    this.percepcaoPassiva = PERCEPCAO_PASSIVA[this.pericias.percepcao.grau] ?? 8;
  }
}

export class CriaturaData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      atributos: schemaAtributos(10),
      pv: reserva(4, 4),
      na: int(9, { min: 0 }),
      pr: int(0, { min: 0 }),
      deslocamento: new (f().NumberField)({ required: true, nullable: false, initial: 9, min: 0 }),
      iniciativa: int(-2),
      ataque: int(2),
      dano: str("1d4"),
      tipoDano: str("Contundente", { choices: TIPOS_DANO, blank: false }),
      integrantes: int(1, { min: 1 }),
      semCirculacao: bool(true),              // imune a Sangramento (mortos-vivos)
      condicoes: schemaCondicoes(),
      notas: html()
    };
  }

  prepareDerivedData() {
    for (const a of Object.values(this.atributos)) a.mod = modificador(a.valor);
  }
}

/* -------------------------------------------------------------------------- */
/*  ITENS                                                                     */
/* -------------------------------------------------------------------------- */

export class ArmaData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      categoria: str("branca", { choices: ["branca", "fogo", "improvisada"], blank: false }),
      subgrupo: str(""),
      dano: str("1d6"),
      tipoDano: str("Contundente", { choices: TIPOS_DANO, blank: false }),
      atributo: str("for", { choices: ["for", "agi"], blank: false }),
      somaAtributoDano: bool(true),
      margemCritico: int(20, { min: 18, max: 20 }),
      bonusCritico: str(""),                                       // ex.: "1d6"
      efeitoCritico: str("", { choices: EFEITOS_CRITICOS }),
      municao: str(""),
      capacidade: int(0, { min: 0 }),
      municaoAtual: new (f().NumberField)({ required: true, nullable: true, integer: true, initial: null, min: 0 }),  // null = carregador cheio
      travada: bool(false),
      durabilidade: reserva(10, 10),
      longa: bool(false),
      acoesPorAtaque: int(1, { min: 1, max: 4 }),     // ex.: armas pesadas custam 2 ações
      equipada: bool(false),
      descricao: html()
    };
  }
}

export class ProtecaoData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      pr: int(0, { min: 0 }),
      compartimentos: int(1, { min: 0 }),
      penalidade: str(""),
      vestida: bool(false),
      durabilidade: reserva(10, 10),
      descricao: html()
    };
  }
}

export class HabilidadeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      grupo: str(""),
      custo: int(5, { min: 0 }),
      prerequisito: str(""),
      usos: new (f().SchemaField)({               // habilidades de uso limitado (ex.: "uma vez entre Descansos Longos")
        value: int(0, { min: 0 }),
        max: int(0, { min: 0 }),
        recarga: str("", { choices: ["", "curto", "longo"] })
      }),
      descricao: html()
    };
  }
}

export class EquipamentoData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      categoria: str("diverso", { choices: Object.keys(CATEGORIAS_EQUIPAMENTO), blank: false }),
      quantidade: int(1, { min: 0 }),
      porCompartimento: int(0, { min: 0 }),     // 0 = usar valor padrão da categoria
      compartimentosFixos: int(0, { min: 0 }),  // use quando o item tiver espaço próprio (ex.: mochila média)
      usos: int(0, { min: 0 }),
      descricao: html()
    };
  }
}
