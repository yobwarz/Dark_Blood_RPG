import { GaleriaIcones } from "./icones-ui.mjs";
import { enriquecerTexto, editarTexto, salvarTexto, cancelarTexto } from "./texto-rico.mjs";
import { abrirMenu } from "./menus.mjs";
import { distribuirColunas } from "./api.mjs";
import { ATRIBUTOS, PERICIAS, GRUPOS_PERICIA, CONDICOES, MOCHILAS, CATEGORIAS_EQUIPAMENTO, TENDENCIAS,
  GRAVIDADES_FERIMENTO, TIPOS_DANO, EFEITOS_CRITICOS } from "./config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;

const renderTemplate = (caminho, dados) => foundry.applications.handlebars.renderTemplate(caminho, dados);
const apiSE = () => game.sangueEscuro.api;

/** Renderiza em HTML os painéis/páginas registrados por extensões. Erros de um módulo não derrubam a ficha. */
async function renderizarExtensoes(defs, base, ctxFicha) {
  const partes = [];
  for (const def of defs) {
    try {
      const extra = def.contexto ? await def.contexto(base.documento, ctxFicha) : {};
      const html = await renderTemplate(def.template, { ...base.dados, ...extra, extId: def.id });
      partes.push(`<div class="se-extensao" data-ext-id="${def.id}">${html}</div>`);
    } catch (err) {
      console.error(`Sangue Escuro | Falha na extensão “${def.id}”`, err);
    }
  }
  return partes.join("");
}

const sinal = (n) => (n >= 0 ? `+${n}` : `${n}`);
const objOpcoes = (obj, campo = "nome") => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v[campo] ?? v]));
const listaOpcoes = (arr) => Object.fromEntries(arr.map((v) => [v, v || "—"]));

/* -------------------------------------------------------------------------- */
/*  FICHA DO SOBREVIVENTE                                                     */
/* -------------------------------------------------------------------------- */

export class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  abaAtual = "ficha";

  static DEFAULT_OPTIONS = {
    classes: ["sangue-escuro", "ficha", "ficha-sobrevivente"],
    position: { width: 1000, height: 880 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      aba: CharacterSheet.trocarAba,
      trocarImagem: CharacterSheet.trocarImagem,
      pip: CharacterSheet.pip,
      ajustar: CharacterSheet.ajustar,
      rolarAtributo: CharacterSheet.rolarAtributo,
      rolarPericia: CharacterSheet.rolarPericia,
      ciclarGrau: CharacterSheet.ciclarGrau,
      rolarIniciativa: CharacterSheet.rolarIniciativa,
      menuRecurso: CharacterSheet.menuRecurso,
      rolarPanico: CharacterSheet.rolarPanico,
      turnoPip: CharacterSheet.turnoPip,
      turnoToggle: CharacterSheet.turnoToggle,
      acaoAntecipada: CharacterSheet.acaoAntecipada,
      rolarMorte: CharacterSheet.rolarMorte,
      rolarResistencia: CharacterSheet.rolarResistencia,
      rolarVontade: CharacterSheet.rolarVontade,
      desarmado: CharacterSheet.desarmado,
      itemCriar: CharacterSheet.itemCriar,
      itemEditar: CharacterSheet.itemEditar,
      itemApagar: CharacterSheet.itemApagar,
      itemAtacar: CharacterSheet.itemAtacar,
      itemDano: CharacterSheet.itemDano,
      itemVestir: CharacterSheet.itemVestir,
      itemEmpunhar: CharacterSheet.itemEmpunhar,
      itemRecarregar: CharacterSheet.itemRecarregar,
      itemDestravar: CharacterSheet.itemDestravar,
      itemQtd: CharacterSheet.itemQtd,
      ferimentoAdd: CharacterSheet.ferimentoAdd,
      ferimentoDel: CharacterSheet.ferimentoDel,
      descansoLongo: CharacterSheet.descansoLongo,
      descansoCurto: CharacterSheet.descansoCurto,
      habilidadeUsar: CharacterSheet.habilidadeUsar,
      extensao: CharacterSheet.extensao
    }
  };

  static PARTS = {
    corpo: {
      template: "systems/sangue-escuro/templates/actor/character.hbs",
      scrollable: [".se-corpo", ".se-abas-lateral"]
    }
  };

  /* ------------------------------ contexto -------------------------------- */

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.actor;
    const s = actor.system;

    ctx.actor = actor;
    ctx.system = s;
    ctx.editable = this.isEditable;
    const api = apiSE();
    const PAGINAS = [["ficha", "Ficha"], ["combate", "Combate"], ["inventario", "Inventário"],
      ["habilidades", "Habilidades"], ["condicoes", "Condições"], ["historia", "História"]];
    const extras = api.paginasVisiveis();
    const todas = [...PAGINAS, ...extras.map((p) => [p.id, p.nome])];
    if (!todas.some(([id]) => id === this.abaAtual)) this.abaAtual = "ficha";   // cenário desativado, página sumiu
    ctx.aba = this.abaAtual;
    ctx.paginas = todas.map(([id, nome]) => ({ id, nome, ativa: this.abaAtual === id }));

    // Roda de atributos: 7 nós em círculo, o primeiro no topo, sentido horário.
    const lista = Object.entries(ATRIBUTOS);
    const W = 470, H = 250, R = 92;
    ctx.roda = lista.map(([k, d], i) => {
      const ang = (-90 + (360 / lista.length) * i) * (Math.PI / 180);
      const dx = Math.cos(ang) * R, dy = Math.sin(ang) * R;
      const lado = Math.abs(dx) < 12 ? (dy < 0 ? "cima" : "baixo") : dx < 0 ? "esq" : "dir";
      return {
        chave: k, sigla: d.sigla, nome: d.nome, valor: s.atributos[k].valor, mod: sinal(s.atributos[k].mod),
        x: (((W / 2 + dx) / W) * 100).toFixed(2), y: (((H / 2 + dy) / H) * 100).toFixed(2), lado
      };
    });

    // Perícias por grupo
    const opcoesAttr = Object.fromEntries(Object.entries(ATRIBUTOS).map(([k, d]) => [k, d.sigla]));
    ctx.grupos = Object.entries(GRUPOS_PERICIA).map(([g, nome]) => ({
      nome,
      pericias: Object.entries(PERICIAS).filter(([, d]) => d.grupo === g).map(([k, d]) => {
        const p = s.pericias[k];
        return {
          chave: k, nome: d.nome, attr: p.attr, attrSigla: ATRIBUTOS[p.attr].sigla,
          temAlt: !!d.alt, opcoesAttr, grau: p.grau, grauNome: p.grauNome,
          total: sinal(actor.totalPericia(k))
        };
      })
    }));

    // Perícias em 3 colunas equilibradas pelo número de linhas
    ctx.colunas = distribuirColunas(ctx.grupos, 3);
    ctx.nAtributos = Object.keys(ATRIBUTOS).length;

    // Resumo para as subpáginas
    const res = (campo, rotulo) => ({ campo, rotulo, valor: s[campo].value, max: s[campo].max });
    ctx.resumo = [res("pv", "PV"), res("ps", "Sanidade"), res("estresse", "Estresse"),
      res("fome", "Fome"), res("exaustao", "Exaustão"), res("sorte", "Sorte")];

    // Marcadores (bolinhas)
    const mk = (campo, rotulo, dica) => ({
      campo, rotulo, dica, max: s[campo].max, valor: s[campo].value,
      pips: Array.from({ length: s[campo].max }, (_, i) => ({ n: i + 1, cheio: i < s[campo].value }))
    });
    const t = s.turno;
    ctx.turno = {
      acoes: Array.from({ length: Math.max(api.regra("acoesPorTurno"), t.acoes) }, (_, i) => ({ n: i + 1, cheio: i < t.acoes })),
      quantidade: t.acoes,
      regra: api.regra("acoesPorTurno"),
      regraReacoes: api.regra("reacoesPorRodada"),
      reacao: t.reacao > 0,
      bonus: t.bonus > 0,
      divida: t.divida,
      surpreendido: s.condicoes.surpreendido
    };
    ctx.recursos = [
      mk("pv", "Pontos de Vida", ""),
      mk("ps", "Sanidade", ""),
      mk("estresse", "Estresse", s.estadoEstresse)
    ];
    ctx.secundarios = [
      mk("fome", "Fome", s.estadoFome),
      ...(api.regra("infeccaoZumbi", true) ? [mk("exposicao", "Exposição", "3 = Infecção")] : []),
      mk("exaustao", "Exaustão", "6 = morte"),
      mk("sorte", "Sorte", "máx. 3")
    ];

    // Itens por tipo
    const porTipo = (t) => actor.items.filter((i) => i.type === t).sort((a, b) => a.sort - b.sort);
    ctx.armas = porTipo("arma").map((i) => ({
      id: i.id, nome: i.name, img: i.img, dano: i.system.dano, tipoDano: i.system.tipoDano,
      margem: i.system.margemCritico === 20 ? "20" : `${i.system.margemCritico}–20`,
      efeito: i.system.efeitoCritico, bonusCritico: i.system.bonusCritico,
      pd: i.system.durabilidade.value, pdMax: i.system.durabilidade.max,
      fogo: i.system.categoria === "fogo", capacidade: i.system.capacidade, municao: i.system.municao,
      usaMunicao: i.system.capacidade > 0, carregador: i.carregador, travada: i.system.travada,
      empunhada: i.system.equipada, espaco: i.espaco
    }));
    ctx.protecoes = porTipo("protecao").map((i) => ({
      id: i.id, nome: i.name, img: i.img, pr: i.system.pr, penalidade: i.system.penalidade,
      vestida: i.system.vestida, espaco: i.espaco
    }));
    ctx.equipamentos = porTipo("equipamento").map((i) => ({
      id: i.id, nome: i.name, img: i.img, quantidade: i.system.quantidade,
      categoria: CATEGORIAS_EQUIPAMENTO[i.system.categoria]?.nome ?? "", espaco: i.espaco
    }));
    ctx.habilidades = porTipo("habilidade").map((i) => ({
      id: i.id, nome: i.name, img: i.img, custo: i.system.custo, prereq: i.system.prerequisito,
      temUsos: i.system.usos.max > 0, usos: i.system.usos.value, usosMax: i.system.usos.max,
      recarga: { curto: "Descanso Curto", longo: "Descanso Longo" }[i.system.usos.recarga] ?? ""
    }));

    // PE investidos (perícias + habilidades)
    let gastos = 0;
    for (const p of Object.values(s.pericias)) {
      if (p.grau >= 1) gastos += 5;
      if (p.grau === 2) gastos += 10;
    }
    ctx.peGastos = gastos + ctx.habilidades.reduce((t, h) => t + h.custo, 0);

    // Condições
    ctx.condicoes = Object.entries(CONDICOES)
      .filter(([k]) => s.condicoes[k] || api.condicaoVisivel(k))
      .map(([k, nome]) => ({ chave: k, nome, ativa: s.condicoes[k] }));

    // Opções de seleção
    ctx.opMochila = objOpcoes(MOCHILAS);
    ctx.opGravidade = listaOpcoes(GRAVIDADES_FERIMENTO);
    ctx.opTendencia = listaOpcoes(["", ...TENDENCIAS]);
    ctx.opCategoria = { civil: "Civil", sobrevivente: "Sobrevivente" };
    ctx.ferimentos = s.ferimentos.map((f, i) => ({ i, ...f }));
    ctx.cargaPct = Math.min(100, Math.round((s.carga.usado / Math.max(1, s.carga.max)) * 100));
    ctx.morte = s.morte;
    ctx.caido = s.pv.value <= 0;

    // Extensões: página própria ou painéis no fim da página atual.
    const baseExt = { documento: actor, dados: { actor, system: s, editable: this.isEditable } };
    const paginaExt = extras.find((p) => p.id === this.abaAtual);
    ctx.paginaExtra = paginaExt ? await renderizarExtensoes([paginaExt], baseExt, ctx) : "";
    ctx.slot = PAGINAS.some(([id]) => id === this.abaAtual)
      ? await renderizarExtensoes(api.paineisPara(this.abaAtual), baseExt, ctx) : "";
    return ctx;
  }

  /* ------------------------------ render ---------------------------------- */

  _onRender(context, options) {
    super._onRender?.(context, options);
    const nav = this.element.querySelector(".se-abas-lateral");
    const ativa = nav?.querySelector("button.ativa");
    if (ativa) {
      const n = nav.getBoundingClientRect(), b = ativa.getBoundingClientRect();
      if (b.bottom > n.bottom) nav.scrollTop += b.bottom - n.bottom + 8;
      else if (b.top < n.top) nav.scrollTop -= n.top - b.top + 8;
    }
    if (!this.isEditable) return;
    const raiz = this.element;

    // Arrastar itens da ficha (ex.: para outra ficha ou hotbar).
    raiz.querySelectorAll("[data-item-id][draggable]").forEach((el) => {
      el.addEventListener("dragstart", (ev) => {
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item) return;
        ev.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
      });
    });

    // Referências de documentos em páginas de extensões (cartões de pedidos, por exemplo).
    raiz.querySelectorAll("[data-item-uuid][draggable]").forEach(el => {
      el.addEventListener("dragstart", ev => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({type:"Item",uuid:el.dataset.itemUuid}));
      });
    });

    // Soltar itens (do compêndio ou do mundo) na ficha.
    const alvo = raiz.querySelector(".se-ficha");
    alvo?.addEventListener("dragover", (ev) => ev.preventDefault());
    alvo?.addEventListener("drop", async (ev) => {
      const TE = foundry.applications.ux.TextEditor.implementation;
      const data = TE.getDragEventData(ev);
      if (data?.type !== "Item") return;
      ev.preventDefault();
      ev.stopPropagation();
      const item = await Item.implementation.fromDropData(data);
      if (!item || item.parent === this.actor) return;
      if (await apiSE().tratarSoltarItem(this.actor, item, this)) return;
      await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
    });
  }

  /* ------------------------------ ações ----------------------------------- */

  static trocarAba(event, target) {
    this.abaAtual = target.dataset.aba;
    this.render();
  }

  static trocarImagem() {
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({
      type: "image",
      current: this.actor.img,
      callback: (path) => this.actor.update({ img: path })
    }).render(true);
  }

  /** Clique em um marcador: define o valor; clicar no valor atual remove 1. */
  static async pip(event, target) {
    const campo = target.dataset.campo;
    const n = Number(target.dataset.n);
    const atual = this.actor.system[campo].value;
    await this.actor.update({ [`system.${campo}.value`]: atual === n ? n - 1 : n });
  }

  static async ajustar(event, target) {
    const campo = target.dataset.campo;
    const delta = Number(target.dataset.delta);
    const r = this.actor.system[campo];
    const novo = Math.max(0, Math.min(r.max, r.value + delta));
    await this.actor.update({ [`system.${campo}.value`]: novo });
  }

  static rolarAtributo(event, target) { return this.actor.rolarAtributo(target.dataset.chave, event); }
  static rolarPericia(event, target) { return this.actor.rolarPericia(target.dataset.chave, event); }
  /** Entra no Combat Tracker e rola a Iniciativa (cria o encontro se o Mestre clicar). */
  static rolarIniciativa() { return this.actor.entrarNoCombate(); }

  /** Clique no nome de um recurso: abre as ações que o DRS associa a ele. */
  static menuRecurso(event, target) { return abrirMenu(this.actor, target.dataset.campo); }

  /** Ações disponíveis no turno (bolinhas): clicar em uma bolinha define quantas restam. */
  static async turnoPip(event, target) {
    const n = Number(target.dataset.n);
    const atual = this.actor.system.turno.acoes;
    await this.actor.update({ "system.turno.acoes": atual === n ? n - 1 : n });
  }

  /** Reação e Ação Bônus: alterna entre disponível e usada. */
  static async turnoToggle(event, target) {
    const campo = target.dataset.campo;
    const atual = this.actor.system.turno[campo];
    if (atual > 0 && campo === "bonus") {
      const permitido = await foundry.applications.api.DialogV2.confirm({window:{title:"Ação Bônus"},content:"<p>Uma regra permite esta Ação Bônus? Intoxicado troca uma Ação normal ainda disponível.</p>"});
      if (permitido) await this.actor.usarAcaoBonus({permitido:true}); return;
    }
    if (atual > 0 && campo === "reacao") { await this.actor.gastarReacao(); return; }
    if (!game.user.isGM) return ui.notifications.warn("Somente o Mestre pode restaurar manualmente este recurso fora do início do turno.");
    await this.actor.update({ [`system.turno.${campo}`]: 1 });
  }

  static acaoAntecipada() { return this.actor.acaoAntecipada(); }
  static rolarPanico(event) { return this.actor.rolarPanico(event); }
  static rolarMorte() { return this.actor.rolarMorte(); }
  static desarmado(event) { return this.actor.rolarDesarmado(event); }

  static rolarResistencia(event, target) {
    const { chave, cd, rotulo } = target.dataset;
    return this.actor.rolarTeste({ chave, rotulo, cd: Number(cd), event });
  }

  static rolarVontade(event, target) {
    return this.actor.rolarVontade(Number(target.dataset.na), target.dataset.rotulo, event);
  }

  static async ciclarGrau(event, target) {
    const chave = target.dataset.chave;
    const atual = this.actor.system.pericias[chave].grau;
    await this.actor.update({ [`system.pericias.${chave}.grau`]: (atual + 1) % 3 });
  }

  static async itemCriar(event, target) {
    const tipo = target.dataset.tipo;
    const nomes = { arma: "Nova arma", protecao: "Nova proteção", equipamento: "Novo equipamento", habilidade: "Nova habilidade" };
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: nomes[tipo], type: tipo }]);
    item?.sheet.render(true);
  }

  static itemEditar(event, target) {
    this.actor.items.get(target.closest("[data-item-id]").dataset.itemId)?.sheet.render(true);
  }

  static async itemApagar(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Remover item" },
      content: `<p>Remover <strong>${item.name}</strong> da ficha?</p>`
    });
    if (ok) await item.delete();
  }

  static itemAtacar(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item && this.actor.rolarAtaque(item, event);
  }

  static itemDano(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item && this.actor.rolarDano(item, { critico: event.shiftKey });
  }

  /** Só uma proteção corporal principal pode estar vestida (PR não se acumula). */
  static async itemVestir(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const vestir = !item.system.vestida;
    const updates = this.actor.items
      .filter((i) => i.type === "protecao" && i.system.vestida && i.id !== item.id)
      .map((i) => ({ _id: i.id, "system.vestida": false }));
    updates.push({ _id: item.id, "system.vestida": vestir });
    await this.actor.updateEmbeddedDocuments("Item", updates);
  }

  static itemRecarregar(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item && this.actor.recarregar(item);
  }

  static itemDestravar(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item && this.actor.destravar(item);
  }

  static async itemEmpunhar(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) await item.update({ "system.equipada": !item.system.equipada });
  }

  static async itemQtd(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const novo = Math.max(0, item.system.quantidade + Number(target.dataset.delta));
    await item.update({ "system.quantidade": novo });
  }

  static async ferimentoAdd() {
    const lista = this.actor.system.ferimentos.map((f) => ({ ...f }));
    lista.push({ gravidade: "Leve", local: "", nota: "" });
    await this.actor.update({ "system.ferimentos": lista });
  }

  static async ferimentoDel(event, target) {
    const lista = this.actor.system.ferimentos.map((f) => ({ ...f }));
    lista.splice(Number(target.dataset.i), 1);
    await this.actor.update({ "system.ferimentos": lista });
  }

  static descansoLongo() { return this.actor.descansoLongo(); }
  static descansoCurto() { return this.actor.descansoCurto(); }

  static habilidadeUsar(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item && this.actor.usarHabilidade(item);
  }

  /** Botões de extensões: data-action="extensao" data-ext="id" data-acao="nome". */
  static extensao(event, target) {
    return apiSE().executarAcao(target.dataset.ext, target.dataset.acao, {
      documento: this.actor, ator: this.actor, ficha: this, evento: event, alvo: target
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  FICHA DE CRIATURA                                                         */
/* -------------------------------------------------------------------------- */

/** Variante visual: herda contexto, ações, permissões e extensões da ficha clássica. */
export class AlternativeCharacterSheet extends CharacterSheet {
  static DEFAULT_OPTIONS = {
    classes: ["sangue-escuro", "ficha", "ficha-sobrevivente", "se-alternativa-1"],
    position: { width: 1160, height: 920 }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    ctx.alternativa = true;
    // Só coordenadas de apresentação: a ordem e os valores vêm do contexto clássico.
    ctx.roda = ctx.roda.map((no, i, roda) => {
      const ang = (-90 + 360 * i / roda.length) * Math.PI / 180;
      return {...no, x: ((265 + Math.cos(ang) * 125) / 530 * 100).toFixed(2),
        y: ((190 + Math.sin(ang) * 125) / 380 * 100).toFixed(2)};
    });
    const apresentar = r => {
      const reserva = ["pv", "ps", "fome", "sorte"].includes(r.campo);
      const critico = ["pv", "ps", "fome"].includes(r.campo) ? r.valor <= 0
        : ["estresse", "exaustao", "exposicao"].includes(r.campo) && r.valor >= r.max && r.max > 0;
      return {...r, reserva, limiteRotulo: reserva ? "Máx." : "Limite",
        critico, aviso: critico ? (reserva ? "Sem pontos" : "Limite atingido") : ""};
    };
    ctx.recursos = ctx.recursos.map(apresentar);
    ctx.secundarios = ctx.secundarios.map(apresentar);
    return ctx;
  }
}

export class CriaturaSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sangue-escuro", "ficha", "ficha-criatura"],
    position: { width: 560, height: 700 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      atacar: CriaturaSheet.atacar,
      ajustar: CriaturaSheet.ajustar,
      rolarIniciativa: CriaturaSheet.rolarIniciativa,
      dano: CriaturaSheet.dano,
      trocarImagem: CharacterSheet.trocarImagem,
      extensao: CharacterSheet.extensao,
      editarTexto, salvarTexto, cancelarTexto
    }
  };

  static PARTS = {
    corpo: { template: "systems/sangue-escuro/templates/actor/criatura.hbs", scrollable: [".se-criatura"] }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    ctx.actor = this.actor;
    ctx.system = this.actor.system;
    ctx.editable = this.isEditable;
    ctx.notasHTML = await enriquecerTexto(this.actor, "notas");
    ctx.opTipoDano = listaOpcoes(TIPOS_DANO);
    const apiC = apiSE();
    ctx.condicoes = Object.entries(CONDICOES)
      .filter(([k]) => this.actor.system.condicoes[k] || apiC.condicaoVisivel(k))
      .map(([k, nome]) => ({ chave: k, nome, ativa: this.actor.system.condicoes[k] }));
    ctx.slot = await renderizarExtensoes(apiC.paineisPara("criatura"),
      { documento: this.actor, dados: { actor: this.actor, system: this.actor.system, editable: this.isEditable } }, ctx);
    const { value, max } = this.actor.system.pv;
    ctx.pvPct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
    return ctx;
  }

  static atacar(event) { return this.actor.rolarGolpeCriatura(event); }
  static rolarIniciativa() { return this.actor.entrarNoCombate(); }

  static async ajustar(event, target) {
    const pv = this.actor.system.pv;
    const novo = Math.max(0, Math.min(pv.max, pv.value + Number(target.dataset.delta)));
    await this.actor.update({ "system.pv.value": novo });
  }

  static dano() { return this.actor.rolarDanoCriatura(); }
}

/* -------------------------------------------------------------------------- */
/*  FICHA DE ITEM                                                             */
/* -------------------------------------------------------------------------- */

export class SEItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  get title() {
    const def = this.item && game.sangueEscuro?.api?.criacaoItemDe?.(this.item);
    return def ? `${def.nome}: ${this.item.name}` : super.title;
  }

  static DEFAULT_OPTIONS = {
    classes: ["sangue-escuro", "ficha", "ficha-item"],
    position: { width: 500, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      trocarImagem: SEItemSheet.trocarImagem,
      galeriaIcones: function () { if(this.isEditable) new GaleriaIcones(this.item).render(true); },
      extensao: SEItemSheet.extensao,
      editarTexto, salvarTexto, cancelarTexto
    }
  };

  static PARTS = {
    corpo: { template: "systems/sangue-escuro/templates/item/item.hbs", scrollable: [".se-simples"] }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    ctx.item = this.item;
    ctx.system = this.item.system;
    ctx.tipo = this.item.type;
    ctx.itemPersonalizado = !!apiSE().criacaoItemDe?.(this.item);
    ctx.rotuloTipo = { arma: "Arma", protecao: "Proteção", habilidade: "Habilidade", equipamento: "Equipamento" }[this.item.type] ?? "Item";
    ctx.rotuloTipo = apiSE().criacaoItemDe?.(this.item)?.nome ?? ctx.rotuloTipo;
    ctx.editable = this.isEditable;
    ctx.descricaoHTML = await enriquecerTexto(this.item, "descricao");
    ctx.opCategoriaArma = { branca: "Arma branca", fogo: "Arma de fogo", improvisada: "Arma improvisada" };
    ctx.opAtributo = { for: "Força", agi: "Agilidade" };
    ctx.opTipoDano = listaOpcoes(TIPOS_DANO);
    ctx.opEfeito = listaOpcoes(EFEITOS_CRITICOS);
    ctx.opCategoriaEquip = objOpcoes(CATEGORIAS_EQUIPAMENTO);
    ctx.opRecarga = { "": "Não recarrega", curto: "Descanso Curto", longo: "Descanso Longo" };
    ctx.extensoes = await renderizarExtensoes(apiSE().paineisItemPara(this.item.type),
      { documento: this.item, dados: { item: this.item, system: this.item.system, editable: this.isEditable } }, ctx);
    return ctx;
  }

  /** Botões de extensões em fichas de item. */
  static extensao(event, target) {
    return apiSE().executarAcao(target.dataset.ext, target.dataset.acao, {
      documento: this.item, item: this.item, ficha: this, evento: event, alvo: target
    });
  }

  static trocarImagem() {
    const FP = foundry.applications.apps.FilePicker.implementation;
    if(!this.isEditable)return;
    new FP({ type: "image", current: this.item.img, callback: (path) => this.item.update({ img: path, "flags.sangue-escuro.iconeManual": true }) }).render(true);
  }
}
