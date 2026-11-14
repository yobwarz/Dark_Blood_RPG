import { prepararCartaoChat } from "./chat.mjs";
/**
 * Gatilhos automáticos do Sangue Escuro: reagem a mudanças nos recursos, ao início dos turnos
 * e aos botões dos cartões de chat.
 */
import { avisarPanico, avisarTrauma } from "./menus.mjs";

function cartao(actor, titulo, corpo, botao = "") {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="se-flavor"><h3>${titulo}</h3>${corpo}${botao ? `<div class="se-botoes">${botao}</div>` : ""}</div>`
  });
}

const ultimoInicio = new Map();

function iniciarTurno(combate, combatenteId) {
  // Só o Mestre ativo atualiza, para não duplicar.
  if (!game.users.activeGM?.isSelf) return;
  const ator = combate.combatants.get(combatenteId)?.actor;
  if (!ator) return;
  const chave = `${combate.id}:${combate.round}:${combate.turn}`;
  if (ultimoInicio.get(ator.id) === chave) return;
  ultimoInicio.set(ator.id, chave);
  ator.iniciarTurno();
}

export function registrarGatilhos() {
  /* ---- recursos ---- */
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (actor.type !== "character") return;
    const s = actor.system;
    options.seAntes = {
      pv: s.pv.value, estresse: s.estresse.value, ps: s.ps.value,
      exposicao: s.exposicao.value, exaustao: s.exaustao.value
    };
  });

  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (game.user.id !== userId || actor.type !== "character" || !options.seAntes) return;
    const antes = options.seAntes;
    const s = actor.system;
    const mudou = (c) => foundry.utils.hasProperty(changes, `system.${c}`);
    const dados = {};

    // Vida: 0 PV deixa o personagem caído e exige Resistência à Morte.
    if (mudou("pv.value") && !options.seSemCaido) {   // seSemCaido: o módulo que atualizou trata a queda a 0 PV
      if (s.pv.value <= 0 && antes.pv > 0) {
        dados["system.condicoes.incapacitado"] = true;
        Hooks.callAll("sangueEscuro.caido", actor);
        await cartao(actor, "Caído", `<p>${actor.name} chegou a 0 PV. No início de cada turno, role a Resistência à Morte.</p>`,
          `<button type="button" data-se-acao="morte" data-actor="${actor.uuid}">Rolar Resistência à Morte</button>`);
      } else if (s.pv.value > 0 && antes.pv <= 0) {
        dados["system.condicoes.incapacitado"] = false;
        dados["system.morte.sucessos"] = 0;
        dados["system.morte.fracassos"] = 0;
      }
    }

    // Estresse: ao chegar a 6, Teste de Pânico.
    if (mudou("estresse.value") && s.estresse.value >= 6 && antes.estresse < 6) await avisarPanico(actor);

    // Sanidade: Trauma na primeira queda para 3 ou menos; Ruptura Mental em 0.
    if (mudou("ps.value")) {
      if (s.ps.value <= 0 && antes.ps > 0) {
        await cartao(actor, "Ruptura Mental", `<p class="se-resultado falha">${actor.name} chegou a 0 Pontos de Sanidade. A jornada do personagem termina de forma definitiva.</p>`);
      } else if (s.ps.value >= 1 && s.ps.value <= 3 && antes.ps > 3 && !s.traumaRegistrado) {
        dados["system.traumaRegistrado"] = true;
        await avisarTrauma(actor);
      }
    }

    // Exposição: 1–2 pontos = Contaminado; 3 pontos = Infecção (estágio 1).
    if (game.sangueEscuro.api.regra("infeccaoZumbi", true) && mudou("exposicao.value")) {
      const ex = s.exposicao.value;
      if (ex >= 3 && !s.condicoes.infectado) {
        dados["system.condicoes.contaminado"] = false;
        dados["system.condicoes.infectado"] = true;
        dados["system.infeccaoEstagio"] = 1;
        await cartao(actor, "Infecção", `<p class="se-resultado falha">${actor.name} atinge 3 Pontos de Exposição e adquire a condição <strong>Infecção</strong> (estágio 1: Incubação). A cada hora, teste de Constituição CD 14.</p>`);
      } else if (!s.condicoes.infectado) {
        const contaminado = ex >= 1;
        if (s.condicoes.contaminado !== contaminado) dados["system.condicoes.contaminado"] = contaminado;
      }
    }

    // Exaustão: nível 6 é morte.
    const limite = game.sangueEscuro.api.regra("limiteExaustao");
    if (mudou("exaustao.value") && s.exaustaoTotal >= limite && s.exaustao.value > antes.exaustao) {
      await cartao(actor, "Exaustão total", `<p class="se-resultado falha">${actor.name} atingiu ${limite} níveis de Exaustão. O personagem morre.</p>`);
      Hooks.callAll("sangueEscuro.morreu", actor, { causa: "exaustao" });
    }

    if (Object.keys(dados).length) await actor.update(dados);
  });

  /* ---- turnos ---- */
  Hooks.on("combatTurnChange", (combate, anterior, atual) => iniciarTurno(combate, atual?.combatantId));
  Hooks.on("combatStart", (combate) => iniciarTurno(combate, combate.combatant?.id));

  /* ---- botões nos cartões de chat ---- */
  Hooks.on("renderChatMessageHTML", (mensagem, html) => {
    prepararCartaoChat(mensagem, html);
    html.querySelectorAll("button[data-se-acao]").forEach((botao) => {
      botao.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const ator = await fromUuid(botao.dataset.actor);
        if (!ator) return ui.notifications.warn("Personagem não encontrado.");
        if (!ator.isOwner) return ui.notifications.warn("Você não controla este personagem.");
        const acao = botao.dataset.seAcao;
        if (acao === "dano") {
          const item = ator.items.get(botao.dataset.item);
          if (item) await ator.rolarDano(item, { critico: botao.dataset.critico === "1" });
        } else if (acao === "danoCriatura") {
          await ator.rolarDanoCriatura();
        } else if (acao === "panico") {
          botao.disabled = true;
          await ator.rolarPanico();
        } else if (acao === "morte") {
          await ator.rolarMorte();
        } else if (acao === "sorteGanhar") {
          botao.disabled = true;
          await ator.ganharSorte(1);
        } else if (acao === "segundaChance") {
          botao.disabled = true;
          await ator.segundaChance(mensagem);
        }
      });
    });
  });
}
