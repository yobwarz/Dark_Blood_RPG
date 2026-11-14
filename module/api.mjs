/**
 * API de extensões do Sangue Escuro (versão 1).
 *
 * Módulos de cenário usam `game.sangueEscuro.api`. O registro de cenários, regras, listas e conteúdo deve ser
 * feito dentro do gancho `sangueEscuro.api`, que o sistema dispara uma única vez durante o `init`:
 *
 *   Hooks.once("sangueEscuro.api", (api) => {
 *     api.registrarCenario({ id: "meu-cenario", nome: "Meu Cenário", modulo: "meu-modulo" });
 *     api.definirRegras("meu-cenario", { maxAtaquesPorTurno: 2 });
 *   });
 *
 * Veja API.md para a documentação completa.
 */
import { ATRIBUTOS, PERICIAS, GRUPOS_PERICIA, CONDICOES, TIPOS_DANO, EFEITOS_CRITICOS, CATEGORIAS_EQUIPAMENTO } from "./config.mjs";

import { cenariosHabilitados } from "./cenarios.mjs";

const SISTEMA = "sangue-escuro";
const PAGINAS_RESERVADAS = ["ficha", "combate", "inventario", "habilidades", "condicoes", "historia"];
const PAGINAS_PAINEL = [...PAGINAS_RESERVADAS, "criatura"];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Valores das regras base. Módulos podem sobrescrever por cenário com `definirRegras`. */
export const REGRAS_PADRAO = Object.freeze({
  acoesPorTurno: 3,                    // ações no início do turno (a Dívida de Ação reduz em 1)
  reacoesPorRodada: 1,
  acoesBonusPorTurno: 1,
  limiteExaustao: 6,                   // nível de Exaustão que causa morte
  penalidadePorNivelExaustao: 2,       // penalidade em todo d20, por nível
  deslocamentoPorNivelExaustao: 1.5,   // metros perdidos por nível
  naBase: 10,
  infeccaoZumbi: true                 // cenários com outro agente infeccioso podem desligar os efeitos base
});

/**
 * Distribui grupos de perícias em colunas equilibradas pelo número de linhas.
 * @param {{nome:string, pericias:any[]}[]} grupos
 * @param {number} colunas
 */
export function distribuirColunas(grupos, colunas = 3) {
  const saida = Array.from({ length: colunas }, () => ({ linhas: 0, grupos: [] }));
  const ordenados = [...grupos].sort((a, b) => b.pericias.length - a.pericias.length);
  for (const g of ordenados) {
    const alvo = saida.reduce((menor, c) => (c.linhas < menor.linhas ? c : menor), saida[0]);
    alvo.grupos.push(g);
    alvo.linhas += g.pericias.length + 1.5;   // o título do grupo ocupa cerca de 1,5 linha
  }
  return saida.map((c) => c.grupos);
}

export class SEApi {
  constructor() {
    this.versao = 1;
    this.revisao = "1.4";
    this.capacidades = Object.freeze({ selecaoCompendios: true, exclusividadeCenarios: true, infeccaoZumbiConfiguravel: true, criacaoItensPersonalizada: true, drsConsolidado: "1.2-2026-11-13", penalidadesPorGrupo: true, danoComZeroPV: true, contextoDeReacao: true, controleDeAtaquePorModulo: true });
    this._cenarios = new Map([["base", { id: "base", nome: "Sangue Escuro (regras base)", descricao: "", modulo: null }]]);
    this._regras = {};
    this._paginas = [];
    this._paineis = [];
    this._paineisItem = [];
    this._conteudos = [];
    this._criacaoItens = new Map();
    this._acoes = new Map();
    this._condicoesVisiveis = {};
    this._congelado = false;
  }

  /* ------------------------------ utilitários ----------------------------- */

  _exigirAbertura(nome) {
    if (this._congelado) {
      console.error(`Sangue Escuro | ${nome}() só pode ser chamado dentro do gancho "sangueEscuro.api". Ignorado.`);
      return false;
    }
    return true;
  }

  _visivel(def) {
    // `visivel`: função opcional (ex.: depende de uma configuração do módulo).
    if (typeof def.visivel === "function" && !def.visivel()) return false;
    if (!def.cenario) return true;
    const lista = Array.isArray(def.cenario) ? def.cenario : [def.cenario];
    return lista.includes(this.cenarioAtivo);
  }

  /** Chamado pelo sistema logo após o gancho de registro. */
  _congelar() { this._congelado = true; }

  /* -------------------------------- cenário -------------------------------- */

  registrarCenario({ id, nome, descricao = "", modulo = null } = {}) {
    if (!this._exigirAbertura("registrarCenario")) return;
    if (!SLUG.test(id ?? "")) return console.error("Sangue Escuro | registrarCenario: id inválido (use letras minúsculas, números e hífen).");
    if (id === "base") return console.error("Sangue Escuro | O id “base” é reservado.");
    if (!nome) return console.error("Sangue Escuro | registrarCenario: informe o nome.");
    this._cenarios.set(id, { id, nome, descricao, modulo });
  }

  get cenarios() { return [...this._cenarios.values()]; }

  /** Id do cenário escolhido no mundo ("base" se não houver ou se o módulo do cenário estiver desativado). */
  get cenarioAtivo() {
    let id = "base";
    try { id = game.settings.get(SISTEMA, "cenario") ?? "base"; } catch { /* ainda sem configurações */ }
    const config = Object.fromEntries(Array.from(game.modules?.values?.() ?? []).map(m => [m.id, m.active]));
    if (cenariosHabilitados(config, this).length > 1) return "base";
    const cenario = this._cenarios.get(id);
    if (!cenario || (cenario.modulo && !game.modules?.get(cenario.modulo)?.active)) return "base";
    return id;
  }

  cenarioEh(id) { return this.cenarioAtivo === id; }

  /* --------------------------------- regras -------------------------------- */

  /** Define valores de regras que valem somente enquanto o cenário estiver ativo. */
  definirRegras(cenarioId, regras) {
    this._regras[cenarioId] = { ...(this._regras[cenarioId] ?? {}), ...regras };
  }

  /** Lê uma regra: cenário ativo → padrão do sistema → `fallback`. */
  regra(chave, fallback = undefined) {
    const doCenario = this._regras[this.cenarioAtivo]?.[chave];
    return doCenario ?? REGRAS_PADRAO[chave] ?? fallback;
  }

  /* --------------------------- páginas e painéis --------------------------- */

  /**
   * Nova página nas abas laterais da ficha do sobrevivente.
   * @param {object} def  { id, nome, template, contexto?, ordem?, cenario?, acoes? }
   *  - template: caminho de um .hbs; recebe { actor, system, editable, ...contexto }
   *  - contexto: async (actor, ctxDaFicha) => objeto extra
   *  - acoes: { nome: (info) => void } chamadas por botões `data-action="extensao" data-ext="id" data-acao="nome"`
   */
  registrarPagina(def) {
    if (!this._exigirAbertura("registrarPagina")) return;
    const { id, nome, template } = def ?? {};
    if (!SLUG.test(id ?? "") || PAGINAS_RESERVADAS.includes(id)) return console.error(`Sangue Escuro | registrarPagina: id inválido ou reservado (“${id}”).`);
    if (!nome || !template) return console.error("Sangue Escuro | registrarPagina: informe nome e template.");
    this._paginas.push({ ordem: 100, ...def });
    if (def.acoes) this.registrarAcoes(id, def.acoes);
  }

  paginasVisiveis() {
    return this._paginas.filter((p) => this._visivel(p)).sort((a, b) => a.ordem - b.ordem);
  }

  /**
   * Painel extra no fim de uma página da ficha (`pagina`: ficha, combate, inventario, habilidades, condicoes, historia ou criatura).
   * @param {object} def  { id, pagina, template, contexto?, ordem?, cenario?, acoes? }
   */
  registrarPainel(def) {
    if (!this._exigirAbertura("registrarPainel")) return;
    if (!SLUG.test(def?.id ?? "") || !PAGINAS_PAINEL.includes(def?.pagina) || !def?.template) {
      return console.error("Sangue Escuro | registrarPainel: informe id, pagina válida e template.");
    }
    this._paineis.push({ ordem: 100, ...def });
    if (def.acoes) this.registrarAcoes(def.id, def.acoes);
  }

  paineisPara(pagina) {
    return this._paineis.filter((p) => p.pagina === pagina && this._visivel(p)).sort((a, b) => a.ordem - b.ordem);
  }

  /** Painel extra no fim da ficha de item. `tipos`: lista de tipos de item (arma, protecao, habilidade, equipamento). */
  registrarPainelItem(def) {
    if (!this._exigirAbertura("registrarPainelItem")) return;
    if (!SLUG.test(def?.id ?? "") || !def?.template) return console.error("Sangue Escuro | registrarPainelItem: informe id e template.");
    this._paineisItem.push({ ordem: 100, tipos: [], ...def });
    if (def.acoes) this.registrarAcoes(def.id, def.acoes);
  }

  paineisItemPara(tipo) {
    return this._paineisItem
      .filter((p) => (!p.tipos.length || p.tipos.includes(tipo)) && this._visivel(p))
      .sort((a, b) => a.ordem - b.ordem);
  }

  /** Funções chamadas por botões `data-action="extensao"`. Pode ser usado em qualquer momento. */
  registrarAcoes(id, acoes) {
    this._acoes.set(id, { ...(this._acoes.get(id) ?? {}), ...acoes });
  }

  async executarAcao(id, nome, info) {
    const fn = this._acoes.get(id)?.[nome];
    if (typeof fn !== "function") return console.warn(`Sangue Escuro | Ação não registrada: ${id}.${nome}`);
    return fn(info);
  }

  /* ----------------------- listas que formam a ficha ----------------------- */
  // Mudam o formato dos dados; por isso só valem durante o gancho de registro.

  registrarAtributo(chave, { sigla, nome } = {}) {
    if (!this._exigirAbertura("registrarAtributo")) return;
    if (!SLUG.test(chave ?? "") || !sigla || !nome) return console.error("Sangue Escuro | registrarAtributo: informe chave, sigla e nome.");
    if (!(chave in ATRIBUTOS)) ATRIBUTOS[chave] = { sigla, nome };
  }

  registrarGrupoPericia(chave, nome) {
    if (!this._exigirAbertura("registrarGrupoPericia")) return;
    if (!SLUG.test(chave ?? "") || !nome) return console.error("Sangue Escuro | registrarGrupoPericia: informe chave e nome.");
    if (!(chave in GRUPOS_PERICIA)) GRUPOS_PERICIA[chave] = nome;
  }

  registrarPericia(chave, { nome, attr, alt, grupo } = {}) {
    if (!this._exigirAbertura("registrarPericia")) return;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(chave ?? "") || !nome || !(attr in ATRIBUTOS) || !(grupo in GRUPOS_PERICIA)) {
      return console.error("Sangue Escuro | registrarPericia: informe chave, nome, attr (atributo existente) e grupo (grupo existente).");
    }
    if (!(chave in PERICIAS)) PERICIAS[chave] = { nome, attr, ...(alt ? { alt } : {}), grupo };
  }

  /**
   * Nova condição (existe nos dados de personagens e criaturas).
   * `visivel`: função opcional; quando retorna false, o botão da condição some das fichas (a menos que esteja ativa).
   */
  registrarCondicao(chave, nome, { visivel } = {}) {
    if (!this._exigirAbertura("registrarCondicao")) return;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(chave ?? "") || !nome) return console.error("Sangue Escuro | registrarCondicao: informe chave e nome.");
    if (!(chave in CONDICOES)) CONDICOES[chave] = nome;
    if (typeof visivel === "function") this._condicoesVisiveis[chave] = visivel;
  }

  condicaoVisivel(chave) {
    const f = this._condicoesVisiveis[chave];
    return f ? !!f() : true;
  }

  registrarTipoDano(nome) {
    if (!this._exigirAbertura("registrarTipoDano")) return;
    if (nome && !TIPOS_DANO.includes(nome)) TIPOS_DANO.push(nome);
  }

  registrarEfeitoCritico(nome) {
    if (!this._exigirAbertura("registrarEfeitoCritico")) return;
    if (nome && !EFEITOS_CRITICOS.includes(nome)) EFEITOS_CRITICOS.push(nome);
  }

  registrarCategoriaEquipamento(chave, { nome, porCompartimento = 1 } = {}) {
    if (!this._exigirAbertura("registrarCategoriaEquipamento")) return;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(chave ?? "") || !nome) return console.error("Sangue Escuro | registrarCategoriaEquipamento: informe chave e nome.");
    if (!(chave in CATEGORIAS_EQUIPAMENTO)) CATEGORIAS_EQUIPAMENTO[chave] = { nome, porCompartimento };
  }

  /** Subtipo de apresentação: o documento continua usando tipoBase no servidor. */
  registrarCriacaoItem(def) {
    if (!this._exigirAbertura("registrarCriacaoItem")) return;
    if (!SLUG.test(def?.id ?? "") || !def.nome || !["arma","protecao","habilidade","equipamento"].includes(def.tipoBase)) return console.error("Sangue Escuro | Opção de criação de item inválida.");
    if (this._criacaoItens.has(def.id)) return console.error(`Sangue Escuro | Opção de criação duplicada: ${def.id}`);
    this._criacaoItens.set(def.id, {...def});
  }
  criacaoItensDisponiveis() { return [...this._criacaoItens.values()].filter(d => this._visivel(d)); }
  criacaoItemDe(item) { return this._criacaoItens.get(item.getFlag?.("sangue-escuro","criacaoItem") ?? item.flags?.["sangue-escuro"]?.criacaoItem); }
  prepararCriacaoItem(id, dados = {}) {
    const def = this.criacaoItensDisponiveis().find(d => d.id === id);
    if (!def) throw Error("Esta opção de criação não está disponível no cenário atual.");
    const base = foundry.utils.deepClone(def.dados ?? {});
    const resultado = foundry.utils.mergeObject(base, foundry.utils.deepClone(dados), {inplace:false});
    resultado.type = def.tipoBase;
    resultado.flags ??= {};
    resultado.flags["sangue-escuro"] = {...resultado.flags["sangue-escuro"], criacaoItem:id, virtual:!!def.virtual};
    return resultado;
  }
  async tratarSoltarItem(ator, item, ficha) {
    const id = item.getFlag?.("sangue-escuro","criacaoItem") ?? item.flags?.["sangue-escuro"]?.criacaoItem;
    if (!id) return false;
    const def = this.criacaoItemDe(item);
    if (!def || !this._visivel(def)) { ui.notifications.warn("Ative o módulo e o cenário deste documento antes de arrastá-lo para a ficha."); return true; }
    if (def.aoSoltar) {
      try { return (await def.aoSoltar({ator,item,ficha})) !== false; }
      catch(e) { console.error("Sangue Escuro | Documento arrastado",e);ui.notifications.warn(e.message);return true; }
    }
    return false;
  }

  /* -------------------------------- conteúdo ------------------------------- */

  /**
   * Conteúdo importado para compêndios do mundo pelo botão “Criar compêndios”.
   * @param {object} def { id, rotulo, regras?, itens?, atores?, condicao? }
   *  - atores.json: [{ "name", "type": "criatura", "img", "system": {…}, "flags": {…}, "pasta": "Pasta" }]
   *  - condicao: função opcional; se retornar false, o conteúdo não é importado (ex.: conteúdo de teor adulto desativado)
   *  - regras.json: [{ "nome": "Capítulo", "html": "<p>…</p>" }]
   *  - itens.json:  [{ "name", "type", "img", "system": {…}, "pasta": "Nome da pasta" }]
   */
  registrarConteudo(def) {
    if (!this._exigirAbertura("registrarConteudo")) return;
    if (!SLUG.test(def?.id ?? "") || !def?.rotulo || (!def.regras && !def.itens && !def.atores)) {
      return console.error("Sangue Escuro | registrarConteudo: informe id, rotulo e regras, itens e/ou atores.");
    }
    if (this._conteudos.some(c => c.id === def.id)) return console.error(`Sangue Escuro | Conteúdo duplicado: ${def.id}. Ignorado.`);
    this._conteudos.push(def);
  }

  get conteudos() { return [...this._conteudos]; }

  /** Conteúdo do cenário ativo e auxiliares; cenario pode ser explícito ou inferido do caminho do módulo. */
  conteudosDisponiveis() {
    return this._conteudos.filter(c => {
      try { if (c.condicao && !c.condicao()) return false; }
      catch (e) { console.error(`Sangue Escuro | Condição de conteúdo inválida: ${c.id}`, e); return false; }
      let cenarios = c.cenario ? (Array.isArray(c.cenario) ? c.cenario : [c.cenario]) : [];
      if (!cenarios.length) {
        const caminhos = [c.regras, c.itens, c.atores].filter(Boolean);
        cenarios = this.cenarios.filter(s => s.modulo && caminhos.some(p => p.startsWith(`modules/${s.modulo}/`))).map(s => s.id);
      }
      return !cenarios.length || cenarios.includes(this.cenarioAtivo);
    });
  }
}
