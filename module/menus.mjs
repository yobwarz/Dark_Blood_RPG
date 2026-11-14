import {encerrarDia,hidratar,resolverPrivacao} from "./drs-sobrevivencia.mjs";
import {progredirInfeccao,descontaminarDRS} from "./drs-runtime.mjs";
/**
 * Menus de ação dos recursos da ficha. Cada recurso abre as ações que o DRS associa a ele
 * (testes, ganhos, perdas e recuperações), já aplicando o resultado.
 */
const DV2 = () => foundry.applications.api.DialogV2;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function falar(actor, titulo, corpo) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="se-flavor"><h3>${titulo}</h3>${corpo}</div>`
  });
}

/** Janela com botões; devolve o id escolhido ou null. */
async function escolher(titulo, opcoes, conteudo = "") {
  return DV2().wait({
    window: { title: titulo },
    content: conteudo,
    rejectClose: false,
    buttons: opcoes.map((o, i) => ({ action: o.id, label: o.label, default: i === 0 }))
  });
}

/** Janela com um campo numérico e campos extras opcionais; devolve os valores do formulário ou null. */
async function formulario(titulo, conteudo, rotuloOk = "Aplicar") {
  return DV2().prompt({
    window: { title: titulo },
    rejectClose: false,
    content: conteudo,
    ok: {
      label: rotuloOk,
      callback: (event, botao) => new foundry.applications.ux.FormDataExtended(botao.form).object
    }
  });
}

/* -------------------------------------------------------------------------- */

export async function abrirMenu(actor, campo) {
  const menus = {
    pv: menuPV, ps: menuSanidade, estresse: menuEstresse, fome: menuFome,
    exposicao: menuExposicao, exaustao: menuExaustao, sorte: menuSorte
  };
  return menus[campo]?.(actor);
}

/* ------------------------------- Vida ------------------------------------ */

async function menuPV(actor) {
  const s = actor.system;
  const opcoes = [{ id: "dano", label: "Sofrer dano" }, { id: "cura", label: "Recuperar PV" }];
  if (s.pv.value <= 0) opcoes.push({ id: "morte", label: "Resistência à Morte" });
  const op = await escolher("Pontos de Vida", opcoes, `<p>PV atuais: <strong>${s.pv.value}/${s.pv.max}</strong> · PR: ${s.pr}</p>`);

  if (op === "morte") return actor.rolarMorte();

  if (op === "dano") {
    const f = await formulario("Sofrer dano",
      `<div class="form-group"><label>Dano rolado</label><input type="number" name="n" value="1" min="0" autofocus></div>
       <div class="form-group"><label>Descontar o PR (${s.pr})</label><input type="checkbox" name="pr" checked></div>`);
    if (!f) return;
    const bruto = Number(f.n) || 0;
    const final = Math.max(0, bruto - (f.pr ? s.pr : 0));
    const pr = s.pr;
    const max = s.pv.max;
    const novo = Math.max(0, s.pv.value - final);
    await actor.receberDano(final,{causa:"dano manual"});
    return falar(actor, "Dano sofrido",
      `<p>${actor.name} sofre <strong>${final}</strong> de dano${f.pr ? ` (${bruto} − PR ${pr})` : ""}. PV: ${novo}/${max}.</p>`);
  }

  if (op === "cura") {
    const f = await formulario("Recuperar PV", `<div class="form-group"><label>PV recuperados</label><input type="number" name="n" value="1" min="0" autofocus></div>`);
    if (!f) return;
    const antes = s.pv.value;
    const max = s.pv.max;
    const novo = clamp(antes + (Number(f.n) || 0), 0, max);
    await actor.update({ "system.pv.value": novo });
    return falar(actor, "Recuperação", `<p>${actor.name} recupera ${novo - antes} PV. PV: ${novo}/${max}.</p>`);
  }
}

/* ------------------------------ Sanidade --------------------------------- */

async function menuSanidade(actor) {
  const s = actor.system;
  const op = await escolher("Sanidade", [
    { id: "panico", label: "Resistir ao Pânico (NA 12)" },
    { id: "perda", label: "Evento traumático (NA 15)" },
    { id: "trauma", label: "Superar um Trauma (NA 15)" },
    { id: "recuperar", label: "Recuperar Sanidade" }
  ], `<p>Sanidade: <strong>${s.ps.value}/${s.ps.max}</strong> · modificador de Sanidade ${s.atributos.san.mod >= 0 ? "+" : ""}${s.atributos.san.mod}</p>`);

  if (op === "panico") return actor.rolarPanico();

  if (op === "perda") {
    const gravidade = await escolher("Gravidade do acontecimento", [
      { id: "1", label: "Traumática (perde 1 PS)" },
      { id: "2", label: "Extrema (perde 2 PS)" }
    ]);
    if (!gravidade) return;
    const perda = Number(gravidade);
    const roll = await actor.rolarVontade(15, `Perda de Sanidade (NA 15)`);
    if (roll.total >= 15) return;
    const antes = actor.system.ps.value;
    const max = actor.system.ps.max;
    const novo = Math.max(0, antes - perda);
    const jaTinhaTrauma = actor.system.traumaRegistrado;
    await actor.update({ "system.ps.value": novo });
    await falar(actor, "Sanidade perdida", `<p>${actor.name} perde <strong>${perda}</strong> Ponto(s) de Sanidade. PS: ${novo}/${max}.</p>`);
    // Perda de 2 PS que termina em 3 ou menos (sem chegar a 0) também causa Trauma.
    if (perda === 2 && novo <= 3 && novo > 0 && jaTinhaTrauma) avisarTrauma(actor);
    return;
  }

  if (op === "trauma") {
    const f = await formulario("Superar um Trauma", `<div class="form-group"><label>Tratamento psicológico especializado (+2)</label><input type="checkbox" name="trat"></div>`, "Rolar");
    if (!f) return;
    const roll = await actor.rolarTeste({ chave: "san", rotulo: "Superar Trauma (NA 15)", tipo: "vontade", cd: 15, mod: actor.system.atributos.san.mod + (f.trat ? 2 : 0) });
    if (roll.total >= 15) await falar(actor, "Trauma superado", "<p>O personagem supera um Trauma à sua escolha, removendo seus efeitos mecânicos.</p>");
    return;
  }

  if (op === "recuperar") {
    if (s.ps.value <= 0) return ui.notifications.warn("Quem chegou a 0 PS sofreu Ruptura Mental e não pode recuperar Sanidade.");
    const r = await escolher("Recuperar Sanidade (7 dias de repouso, comida e segurança)", [
      { id: "1", label: "+1 PS" }, { id: "2", label: "+2 PS (tratamento psicológico)" }
    ]);
    if (!r) return;
    const novo = Math.min(s.ps.max, s.ps.value + Number(r));
    await actor.update({ "system.ps.value": novo });
    return falar(actor, "Sanidade recuperada", `<p>PS: ${novo}/${s.ps.max}.</p>`);
  }
}

export function avisarTrauma(actor) {
  return falar(actor, "Trauma adquirido",
    `<p>${actor.name} adquire um <strong>Trauma</strong> ligado ao acontecimento. O Mestre escolhe: Paranoia, Fobia, Hipervigilância, Culpa, Dissociação ou Pesadelos. Máximo de 3 Traumas ativos.</p>`);
}

/* ------------------------------ Estresse --------------------------------- */

const FONTES_ESTRESSE = [
  { id: "1a", n: 1, label: "Sinais perturbadores (+1)" },
  { id: "1b", n: 1, label: "Ser surpreendido (+1)" },
  { id: "1c", n: 1, label: "Encurralado (+1)" },
  { id: "2a", n: 2, label: "Ferimento grave (+2)" },
  { id: "2b", n: 2, label: "Morte violenta de aliado (+2)" },
  { id: "3a", n: 3, label: "Transformação monstruosa (+3)" }
];

async function menuEstresse(actor) {
  const s = actor.system;
  const op = await escolher("Estresse", [
    { id: "ganhar", label: "Ganhar Estresse" },
    { id: "recuperar", label: "Recuperar Estresse" },
    ...(s.estresse.value >= 6 ? [{ id: "panico", label: "Teste de Pânico (NA 12)" }] : [])
  ], `<p>Estresse: <strong>${s.estresse.value}/6</strong> (${s.estadoEstresse})</p>`);

  if (op === "panico") return actor.rolarPanico();

  if (op === "ganhar") {
    const f = await escolher("Qual acontecimento?", FONTES_ESTRESSE);
    if (!f) return;
    const base = FONTES_ESTRESSE.find((x) => x.id === f).n;
    const deteriorado = s.ps.value >= 1 && s.ps.value <= 3;
    const total = base + (deteriorado ? 1 : 0);
    const antes = s.estresse.value;
    const novo = Math.min(6, antes + total);
    await actor.update({ "system.estresse.value": novo });
    await falar(actor, "Estresse", `<p>${actor.name} ganha <strong>+${total}</strong> de Estresse${deteriorado ? " (+1 por Sanidade deteriorada)" : ""}. Estresse: ${novo}/6.</p>`);
    // Já no limite: cada novo acontecimento provoca outro Teste de Pânico (o gatilho cobre a chegada ao 6).
    if (antes >= 6) await avisarPanico(actor);
    return;
  }

  if (op === "recuperar") {
    const r = await escolher("Recuperar Estresse", [
      { id: "seguro", label: "10 min em segurança (−1)" },
      { id: "apoio", label: "Apoio emocional (−1)" },
      { id: "descanso", label: "Descanso de 8 h seguro (−3)" }
    ]);
    if (!r) return;
    const novo = Math.max(0, s.estresse.value - (r === "descanso" ? 3 : 1));
    await actor.update({ "system.estresse.value": novo });
    return falar(actor, "Estresse reduzido", `<p>Estresse: ${novo}/6.</p>`);
  }
}

export function avisarPanico(actor) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="se-flavor"><h3>No Limite</h3><p>${actor.name} está no limite do Estresse e deve fazer um <strong>Teste de Pânico</strong> (Vontade, NA 12).</p>
      <div class="se-botoes"><button type="button" data-se-acao="panico" data-actor="${actor.uuid}">Rolar Teste de Pânico</button></div></div>`
  });
}

/* -------------------------------- Fome ----------------------------------- */

async function menuFome(actor) {
  const s = actor.system;
  const op = await escolher("Fome e Sede", [
    { id: "dia", label: "Encerrar o dia (24 h)" },
    { id: "agua", label: "Hidratar e descansar" },
    {id:"privacao",label:"Resolver privação contínua · 12 horas"},
    { id: "contaminado", label: "Alimento contaminado (CON CD 12)" }
  ], `<p>Pontos de Fome: <strong>${s.fome.value}/5</strong> (${s.estadoFome})${s.condicoes.desidratado ? " · Desidratado" : ""}</p>`);

  if (op === "dia") return encerrarDia(actor);
  if (op === "agua") return hidratar(actor);
  if (op === "privacao") return resolverPrivacao(actor);

  if (op === "contaminado") {
    const roll = await actor.rolarTeste({ chave: "con", rotulo: "Alimento contaminado (CON CD 12)", cd: 12 });
    if (roll.total < 12) {
      await actor.update({ "system.condicoes.intoxicado": true });
      await falar(actor, "Intoxicação", "<p>Falhou no teste e adquire a condição <strong>Intoxicado</strong>.</p>");
    }
  }
}

/* ------------------------------- Exposição ------------------------------- */

const FONTES_EXPOSICAO = [
  { id: "1a", n: 1, label: "Sangue em ferimento aberto (+1)" },
  { id: "1b", n: 1, label: "Fluido infectado sem proteção (+1)" },
  { id: "1c", n: 1, label: "Ferimento por morto-vivo (+1)" },
  { id: "2a", n: 2, label: "Mordida que perfura a pele (+2)" },
  { id: "2b", n: 2, label: "Exposição intensa (+2)" }
];

async function menuExposicao(actor) {
  if (!game.sangueEscuro.api.regra("infeccaoZumbi", true)) return ui.notifications.info("Este cenário usa regras próprias de infestação. Consulte a página da expansão na ficha.");
  const s = actor.system;
  const opcoes = [
    { id: "ambiental", label: "Teste de Exposição ambiental" },
    { id: "fonte", label: "Fonte de exposição" },
    { id: "descontaminar", label: "Descontaminação (Medicina CD 14)" }
  ];
  if (s.condicoes.infectado) opcoes.push({ id: "progressao", label: "Progressão da Infecção (CON CD 14)" });
  const op = await escolher("Exposição e Infecção", opcoes,
    `<p>Exposição: <strong>${s.exposicao.value}/3</strong>${s.condicoes.infectado ? ` · Infecção estágio ${s.infeccaoEstagio}` : s.condicoes.contaminado ? " · Contaminado" : ""}</p>`);

  const somar = async (n, motivo) => {
    const novo = Math.min(3, actor.system.exposicao.value + n);
    await actor.update({ "system.exposicao.value": novo });
    await falar(actor, "Exposição", `<p>${motivo} +${n} ponto(s). Exposição: ${novo}/3.</p>`);
  };

  if (op === "ambiental") {
    const taxa = await escolher("Taxa de Contaminação", [
      { id: "20", label: "Leve 20%" }, { id: "40", label: "Moderada 40%" },
      { id: "60", label: "Crítica 60%" }, { id: "80", label: "Núcleo 80%" }
    ]);
    if (!taxa) return;
    const roll = await new Roll("1d100").evaluate();
    const ok = roll.total <= Number(taxa);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<div class="se-flavor"><h3>Teste de Exposição (${taxa}%)</h3><p class="se-resultado ${ok ? "falha" : "ok"}">${ok ? "Contaminado: +1 Exposição" : "Sem exposição"}</p></div>`
    });
    if (ok) await somar(1, "Exposição ambiental:");
    return;
  }

  if (op === "fonte") {
    const f = await escolher("Qual foi o contato?", FONTES_EXPOSICAO);
    if (!f) return;
    return somar(FONTES_EXPOSICAO.find((x) => x.id === f).n, "Contato perigoso:");
  }

  if (op === "descontaminar") return descontaminarDRS(actor);

  if (op === "progressao") return progredirInfeccao(actor);

}

/* ------------------------------- Exaustão -------------------------------- */

async function menuExaustao(actor) {
  const s = actor.system;
  const op = await escolher("Exaustão", [
    { id: "mais", label: "+1 nível" },
    { id: "menos", label: "−1 nível (Descanso Longo)" }
  ], `<p>Exaustão: <strong>${s.exaustao.value}/6</strong> · −2 em todos os d20 por nível · −1,5 m de Deslocamento por nível.</p>`);
  if (!op) return;
  const novo = clamp(s.exaustao.value + (op === "mais" ? 1 : -1), 0, Math.max(s.exaustao.max, game.sangueEscuro.api.regra("limiteExaustao")));
  await actor.update({ "system.exaustao.value": novo });
}

/* --------------------------------- Sorte --------------------------------- */

async function menuSorte(actor) {
  const s = actor.system;
  const op = await escolher("Sorte", [
    { id: "favoravel", label: "Momento Favorável (1)" },
    { id: "segunda", label: "Segunda Chance (1)" },
    { id: "achado", label: "Achado Inesperado (1)" },
    { id: "desesperada", label: "Resistência Desesperada (2)" },
    { id: "ganhar", label: "Receber 1 Sorte" }
  ], `<p>Pontos de Sorte: <strong>${s.sorte.value}/${s.sorte.max}</strong></p>`);

  if (op === "ganhar") return actor.ganharSorte(1);

  if (op === "favoravel") {
    if (!(await actor.gastarSorte(1))) return;
    await actor.setFlag("sangue-escuro", "vantagem", true);
    return falar(actor, "Momento Favorável", `<p>${actor.name} gasta 1 Sorte: a <strong>próxima rolagem</strong> terá Vantagem. (Depende da autorização do Mestre.)</p>`);
  }

  if (op === "achado") {
    if (!(await actor.gastarSorte(1))) return;
    return falar(actor, "Achado Inesperado", "<p>Gasta 1 Sorte: pode repetir uma rolagem de saque ou de tabela de recursos. O novo resultado deve ser usado.</p>");
  }

  if (op === "segunda" || op === "desesperada") {
    const msg = actor.ultimoTeste();
    if (!msg) return ui.notifications.warn("Nenhuma rolagem recente para repetir.");
    return actor.segundaChance(msg, op === "desesperada" ? 2 : 1);
  }
}
