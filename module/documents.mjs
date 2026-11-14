import { resolverPenalidades, gravidadeFerimento, custoBonus } from "./drs-regras.mjs";
import { receberDano, iniciarTurnoDRS, serialAtor } from "./drs-runtime.mjs";
import { imagemAutomatica } from "./icones.mjs";
import { criarItemPorDialogo } from "./criacao-itens.mjs";
import { ATRIBUTOS, PERICIAS, MOCHILAS, CATEGORIAS_EQUIPAMENTO } from "./config.mjs";

const API = () => game.sangueEscuro.api;
const sinal = (n) => (n >= 0 ? `+${n}` : `${n}`);

/* -------------------------------------------------------------------------- */
/*  ACTOR                                                                     */
/* -------------------------------------------------------------------------- */

export class SEActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.type === "character") this._derivarPersonagem();
    if (this.type === "criatura") this.system.na = this.system.na ?? 9;
    // Extensões (módulos de cenário) podem ajustar os valores derivados.
    if (game.sangueEscuro?.api) Hooks.callAll("sangueEscuro.derivar", this);
  }

  _derivarPersonagem() {
    const s = this.system;

    const api = API();

    // Exaustão total = a da ficha + níveis extras de extensões (ex.: Exaustão pela Morte).
    const exaustaoExtra = { extra: 0 };
    Hooks.callAll("sangueEscuro.exaustaoExtra", this, exaustaoExtra);
    s.exaustaoTotal = s.exaustao.value + exaustaoExtra.extra;

    // NA básico; proteção corporal fornece PR (não acumula).
    s.na = api.regra("naBase");
    s.pr = this.items
      .filter((i) => i.type === "protecao" && i.system.vestida)
      .reduce((m, i) => Math.max(m, i.system.pr), 0);

    // Deslocamento: base − idade − exaustão − fome − desidratação.
    const idade = s.idade;
    const reducaoIdade = idade > 80 ? 7 : idade > 70 ? 6 : idade > 60 ? 4 : idade > 50 ? 3 : idade > 40 ? 2 : 0;
    let desloc = s.deslocamentoBase - reducaoIdade - api.regra("deslocamentoPorNivelExaustao") * s.exaustaoTotal;
    if (s.fome.value === 1) desloc -= 1.5;
    if (s.condicoes.desidratado) desloc -= 3;
    const ferimento = gravidadeFerimento(s.ferimentos);
    desloc -= ferimento >= 3 ? 3 : ferimento === 2 ? 1.5 : 0;
    if (s.pv.value <= 0 || s.condicoes.contido || s.condicoes.agarrado || s.condicoes.paralisado || s.condicoes.congelado || s.condicoes.eletrificado || s.condicoes.incapacitado) desloc = 0;
    s.deslocamento = Math.max(0, desloc);
    s.corrida = s.deslocamento * 2;

    // Carga (compartimentos).
    const usado = this.items.reduce((t, i) => t + (i.espaco ?? 0), 0);
    const max = MOCHILAS[s.mochila]?.compartimentos ?? 4;
    s.carga = { usado, max, excedeu: usado > max };

    // Níveis de estado (texto).
    const e = s.estresse.value;
    s.estadoEstresse = e >= 6 ? "No Limite" : e >= 4 ? "Abalado" : e >= 2 ? "Tenso" : "Controlado";
    const pf = s.fome.value;
    s.estadoFome = ["Inanição", "Desnutrição", "Fome intensa", "Fome moderada", "Fome leve", "Alimentado"][pf] ?? "";
  }

  /**
   * Penalidades e desvantagem aplicáveis a um teste.
   * @param {string} chave   atributo do teste ("for", "agi", ...)
   * @param {"teste"|"ataque"|"vontade"} tipo
   */
  penalidades(chave, tipo = "teste", extra = {}) {
    const resultado = { partes: [], desvantagem: false, vantagem: false };
    if (this.type === "character") this._penalidadesBase(chave, tipo, resultado, extra);
    // Extensões podem acrescentar partes, Vantagem ou Desvantagem. `extra` pode trazer { alvo, item }.
    Hooks.callAll("sangueEscuro.penalidades", this, resultado, { chave, tipo, ...extra });
    return { ...resultado, ...resolverPenalidades(resultado.partes) };
  }

  _penalidadesBase(chave, tipo, resultado, extra={}) {
    const partes = resultado.partes;
    let desvantagem = false;
    const s = this.system;

    // Exaustão: −2 por nível em todo teste de d20.
    if (s.exaustaoTotal > 0) {
      partes.push({ rotulo: `Exaustão ${s.exaustaoTotal}`, valor: -API().regra("penalidadePorNivelExaustao") * s.exaustaoTotal });
    }

    // Estresse: não afeta Testes de Resistência de Vontade.
    if (tipo !== "vontade") {
      const e = s.estresse.value;
      if (e >= 6) partes.push({ rotulo: "Estresse (No Limite)", valor: -2 });
      else if (e >= 4) partes.push({ rotulo: "Estresse (Abalado)", valor: -1 });
    }

    // Fome (não se acumula entre níveis).
    const pf = s.fome.value;
    if (pf === 3 && ["for", "con"].includes(chave)) partes.push({ grupo: "fome", rotulo: "Fome moderada", valor: -1 });
    if (pf === 2 && ["for", "con"].includes(chave)) partes.push({ grupo: "fome", rotulo: "Fome intensa", valor: -2 });
    if (pf === 1 && ["for", "agi", "con"].includes(chave)) partes.push({ grupo: "fome", rotulo: "Desnutrição", valor: -2 });

    // Condições com número fixo.
    if (API().regra("infeccaoZumbi", true) && s.condicoes.contaminado && ["for", "agi", "con"].includes(chave))
      partes.push({ grupo: "condicao", rotulo: "Contaminado", valor: -1 });
    if (s.condicoes.atordoado && chave === "agi") partes.push({ grupo: "condicao", rotulo: "Atordoado", valor: -2 });
    if (s.condicoes.desidratado && ["con", "int"].includes(chave)) desvantagem = true;

    // Infecção Zumbi: só vale a penalidade do estágio atual.
    if (API().regra("infeccaoZumbi", true) && s.condicoes.infectado) {
      const est = s.infeccaoEstagio;
      if (est === 1 && ["for", "agi", "con"].includes(chave)) partes.push({ grupo: "condicao", rotulo: "Incubação", valor: -1 });
      if (est === 2) partes.push({ grupo: "condicao", rotulo: "Infecção Ativa", valor: -1 });
      if (est >= 3) partes.push({ grupo: "condicao", rotulo: "Necrose Interna", valor: -2 });
    }

    if (s.condicoes.congelado && chave === "agi") partes.push({grupo:"condicao",rotulo:"Congelado",valor:-2});
    if (tipo === "ataque" && s.condicoes.contido && this.getFlag("sangue-escuro","origemContido")==="objeto" && extra.movimentoCorporal!==false) partes.push({grupo:"condicao",rotulo:"Contido por objeto",valor:-2});
    if (tipo === "ataque" && s.condicoes.cego && !extra.percepcaoAlternativa) partes.push({grupo:"condicao",rotulo:"Cego",valor:-2});
    if (s.condicoes.amedrontado && extra.fonteMedoPercebida!==false && (tipo === "ataque" || extra.pericia)) partes.push({grupo:"condicao",rotulo:"Amedrontado",valor:-2});
    if (s.condicoes.desorientado && (extra.pericia==="percepcao" || tipo==="ataque"&&extra.item?.system.categoria==="fogo")) partes.push({grupo:"condicao",rotulo:"Desorientado",valor:-2});
    const ferimento = gravidadeFerimento(s.ferimentos);
    if (ferimento && ["for","agi","con"].includes(chave)) partes.push({grupo:"ferimento",rotulo:"Ferimento mais grave",valor:-ferimento});
    if (s.modTemporario) partes.push({ rotulo: "Modificador temporário", valor: s.modTemporario });

    resultado.desvantagem = desvantagem;
  }

  /** Total de uma perícia, já com penalidades (usado na ficha). */
  totalPericia(chave) {
    const p = this.system.pericias[chave];
    const mod = this.system.atributos[p.attr].mod;
    return mod + p.bonus + this.penalidades(p.attr, "teste", {pericia:chave}).total;
  }

  /* ---------------------------- Rolagens ---------------------------------- */

  static _modo(event, desvantagemForcada = false) {
    let modo = 0;
    if (event?.shiftKey) modo += 1;
    if (event?.ctrlKey || event?.metaKey || event?.altKey) modo -= 1;
    if (desvantagemForcada) modo -= 1;
    return Math.max(-1, Math.min(1, modo));
  }

  /**
   * Teste genérico: 1d20 + modificador do atributo + bônus de treino + penalidades.
   * Shift = Vantagem; Ctrl/Alt = Desvantagem. Oferece Segunda Chance e ganho de Sorte no chat.
   */
  async rolarTeste({ chave, rotulo, bonus = 0, tipo = "teste", cd = null, event = null, extraFlavor = "", mod = null, repetido = false, contexto = {} } = {}) {
    const s = this.system;
    const modAttr = mod ?? s.atributos[chave]?.mod ?? 0;
    const pen = this.penalidades(chave, tipo, contexto);

    // Momento Favorável (Sorte gasta antes da rolagem).
    const favoravel = this.type === "character" && this.getFlag("sangue-escuro", "vantagem");
    let modo = SEActor._modo(event, pen.desvantagem);
    if (pen.vantagem) modo = Math.max(-1, Math.min(1, modo + 1));
    if (favoravel) {
      modo = Math.max(-1, Math.min(1, modo + 1));
      await this.unsetFlag("sangue-escuro", "vantagem");
    }
    const d20 = modo > 0 ? "2d20kh" : modo < 0 ? "2d20kl" : "1d20";

    const roll = new Roll(`${d20} + @mod + @bonus + @pen`, { mod: modAttr, bonus, pen: pen.total });
    await roll.evaluate();
    const natural = roll.dice[0].results.find((r) => r.active)?.result;

    const partes = [`${ATRIBUTOS[chave]?.sigla ?? ""} ${sinal(modAttr)}`];
    if (bonus) partes.push(`Treino ${sinal(bonus)}`);
    for (const p of pen.partes) partes.push(`${p.rotulo} ${sinal(p.valor)}`);
    if (favoravel) partes.push("Momento Favorável");
    if (modo > 0) partes.push("Vantagem");
    if (modo < 0) partes.push("Desvantagem");
    if (repetido) partes.push("Segunda Chance");

    let resultado = "";
    let falhou = true;
    if (cd !== null) {
      falhou = roll.total < cd;
      resultado = `<p class="se-resultado ${falhou ? "falha" : "ok"}">CD ${cd}: ${falhou ? "Falha" : "Sucesso"}</p>`;
    }
    let nota = "";
    if (natural === 20) nota = `<p class="se-nota">20 natural: escolha o benefício de um Sucesso Crítico <em>ou</em> ganhe 1 Ponto de Sorte.</p>`;
    if (natural === 1) nota = `<p class="se-nota">1 natural.</p>`;

    const botoes = [];
    if (this.type === "character") {
      if (natural === 20) botoes.push(`<button type="button" data-se-acao="sorteGanhar" data-actor="${this.uuid}">Receber 1 Sorte</button>`);
      if (!repetido && falhou && s.sorte.value >= 1)
        botoes.push(`<button type="button" data-se-acao="segundaChance" data-actor="${this.uuid}">Segunda Chance (1 Sorte)</button>`);
    }
    const blocoBotoes = botoes.length ? `<div class="se-botoes">${botoes.join(" ")}</div>` : "";

    const flavor = `<div class="se-flavor"><h3>${rotulo}</h3><small>${partes.join(" · ")}</small>${resultado}${nota}${extraFlavor}${blocoBotoes}</div>`;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }), flavor,
      flags: { "sangue-escuro": { teste: { kind: "teste", repetido, params: { chave, rotulo, bonus, tipo, cd, mod, extraFlavor } } } }
    });
    return roll;
  }

  rolarAtributo(chave, event) {
    return this.rolarTeste({ chave, rotulo: `Teste de ${ATRIBUTOS[chave].nome}`, event });
  }

  rolarPericia(chave, event) {
    const p = this.system.pericias[chave];
    return this.rolarTeste({
      chave: p.attr,
      rotulo: PERICIAS[chave].nome,
      bonus: p.bonus,
      contexto: {pericia:chave},
      event
    });
  }

  /** Teste de Resistência de Vontade: 1d20 + modificador de Sanidade (sem penalidade de Estresse). */
  rolarVontade(na, rotulo, event) {
    return this.rolarTeste({ chave: "san", rotulo: `Vontade: ${rotulo}`, tipo: "vontade", cd: na, event });
  }

  /** Iniciativa avulsa (a do Combat Tracker usa a mesma regra). */
  rolarIniciativaAvulsa(event) {
    return this.rolarTeste({ chave: "agi", rotulo: "Iniciativa", event });
  }

  /** Teste de Resistência à Morte: 1d20 sem modificadores. */
  async rolarMorte() {
    if (this.system.pv.value > 0 || this.getFlag("sangue-escuro","morto") || this.getFlag("sangue-escuro","estavel") || this.system.morte.sucessos >= 3)
      return ui.notifications.warn("Não há Teste de Resistência à Morte pendente.");
    const roll = await new Roll("1d20").evaluate();
    const n = roll.total;
    const s = this.system;
    let suc = s.morte.sucessos;
    let fal = s.morte.fracassos;
    let texto;
    let curar = false;

    if (n === 1) { fal += 2; texto = "1 natural: 2 fracassos."; }
    else if (n <= 9) { fal += 1; texto = "1 fracasso."; }
    else if (n <= 19) { suc += 1; texto = "1 sucesso."; }
    else { curar = true; texto = "20 natural: recupera 1 PV e desperta."; }

    let estado = "";
    if (curar) {
      await this.update({ "system.pv.value": 1, "system.morte.sucessos": 0, "system.morte.fracassos": 0 });
      estado = "O personagem desperta. Ao recuperar a consciência, recebe 1 nível de Exaustão.";
    } else {
      suc = Math.min(3, suc); fal = Math.min(3, fal);
      await this.update({ "system.morte.sucessos": suc, "system.morte.fracassos": fal });
      if (fal >= 3) {
        estado = "3 fracassos: o personagem morre.";
        Hooks.callAll("sangueEscuro.morreu", this, { causa: "resistencia" });
      }
      else if (suc >= 3) { await this.update({"flags.sangue-escuro.estavel":true,"system.morte.sucessos":0,"system.morte.fracassos":0}); estado = "3 sucessos: o personagem se estabiliza."; }
      else estado = `Sucessos ${suc}/3 · Fracassos ${fal}/3.`;
    }
    const flavor = `<div class="se-flavor"><h3>Resistência à Morte</h3><p>${texto}</p><p class="se-nota">${estado}</p></div>`;
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor });
  }

  /** Ataque de arma. */
  async rolarAtaque(item, event, { repetido = false, contextoAcao = "normal", contextoModulo = {} } = {}) {
    if (!this.podeAgir()) return ui.notifications.warn("Este personagem não pode atacar neste estado.");
    if (!["normal","oportunidade","preparado"].includes(contextoAcao)) throw Error("Contexto de ataque inválido.");

    if (!repetido && contextoAcao === "normal" && this.type === "character" && game.combat?.started && this.system.turno.acoes < (item.system.acoesPorAtaque ?? 1)) return ui.notifications.warn("Ações insuficientes.");
    const controleAtaque = {contextoAcao, contextoModulo, acaoGerenciada:false, limiteTrava:null};
    const sys = item.system;
    const chave = sys.atributo;
    const pericia = sys.categoria === "branca" ? "armasBrancas" : "armasFogo";
    const bonus = this.system.pericias?.[pericia]?.bonus ?? 0;

    // Munição e travamento (DRS: disparos seguem as regras de munição e travamento).
    const usaMunicao = sys.capacidade > 0;
    if (!repetido) {
      if (sys.travada) {
        ui.notifications.warn(`${item.name} está travada. Destravar exige 1 Ação.`);
        return null;
      }
      if (usaMunicao && item.carregador <= 0) {
        ui.notifications.warn(`${item.name} está sem munição. Recarregue a arma.`);
        return null;
      }
      if (Hooks.call("sangueEscuro.preAtaque", this, item, controleAtaque) === false) return null;
      if (contextoAcao !== "normal" && !(await this.gastarReacao())) return null;
    }

    const alvo = game.user.targets.first()?.actor;
    const na = alvo ? Number(alvo.system.na ?? 10) : 10;
    const alvoTxt = alvo ? `${alvo.name} (NA ${na})` : "NA 10";

    const pen = this.penalidades(chave, "ataque", { alvo, item });
    const favoravel = this.getFlag("sangue-escuro", "vantagem");
    let modo = SEActor._modo(event, pen.desvantagem);
    if (pen.vantagem) modo = Math.max(-1, Math.min(1, modo + 1));
    if (favoravel) {
      modo = Math.max(-1, Math.min(1, modo + 1));
      await this.unsetFlag("sangue-escuro", "vantagem");
    }
    const d20 = modo > 0 ? "2d20kh" : modo < 0 ? "2d20kl" : "1d20";
    const modAttr = this.system.atributos?.[chave]?.mod ?? 0;
    const bonusFlat = this.type === "criatura" ? this.system.ataque : bonus;
    const modFinal = this.type === "criatura" ? 0 : modAttr;

    const roll = new Roll(`${d20} + @mod + @bonus + @pen`, { mod: modFinal, bonus: bonusFlat, pen: pen.total });
    await roll.evaluate();
    const natural = roll.dice[0].results.find((r) => r.active)?.result;
    const acertou = natural === 20 || roll.total >= na;
    const critico = acertou && natural >= sys.margemCritico;

    // Armas de fogo travam com 1 natural (Estresse 0–3) ou 1–3 (Estresse 4–6).
    let trava = "";
    let travou = false;
    if (sys.categoria === "fogo" && this.type === "character") {
      const limite = controleAtaque.limiteTrava ?? (this.system.estresse.value >= 4 ? 3 : 1);
      if (natural <= limite) {
        travou = true;
        trava = `<p class="se-resultado falha">A arma trava (natural ${natural}). Destravar exige 1 Ação.</p>`;
      }
    }

    const partes = [`${ATRIBUTOS[chave]?.sigla ?? ""} ${sinal(modFinal)}`];
    if (bonusFlat) partes.push(`Treino ${sinal(bonusFlat)}`);
    for (const p of pen.partes) partes.push(`${p.rotulo} ${sinal(p.valor)}`);
    if (favoravel) partes.push("Momento Favorável");
    if (modo > 0) partes.push("Vantagem");
    if (modo < 0) partes.push("Desvantagem");
    if (repetido) partes.push("Segunda Chance");

    const botoes = [];
    if (acertou && !trava) {
      botoes.push(`<button type="button" data-se-acao="dano" data-actor="${this.uuid}" data-item="${item.id}" data-critico="${critico ? 1 : 0}">${critico ? "Rolar dano crítico" : "Rolar dano"}</button>`);
    }
    if (this.type === "character") {
      if (natural === 20) botoes.push(`<button type="button" data-se-acao="sorteGanhar" data-actor="${this.uuid}">Receber 1 Sorte</button>`);
      if (!repetido && !acertou && this.system.sorte.value >= 1)
        botoes.push(`<button type="button" data-se-acao="segundaChance" data-actor="${this.uuid}">Segunda Chance (1 Sorte)</button>`);
    }
    const blocoBotoes = botoes.length ? `<div class="se-botoes">${botoes.join(" ")}</div>` : "";

    const flavor = `<div class="se-flavor"><h3>Ataque: ${item.name}</h3>
      <small>${partes.join(" · ")} · contra ${alvoTxt}</small>
      <p class="se-resultado ${acertou ? "ok" : "falha"}">${acertou ? (critico ? "Acerto crítico" : "Acerto") : "Erro"}</p>
      ${trava}${blocoBotoes}</div>`;
    const mensagem = await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }), flavor,
      flags: { "sangue-escuro": { teste: {
        kind: "ataque", repetido, contextoAcao, acaoGerenciada:controleAtaque.acaoGerenciada, itemId: item.id, origem: this.uuid, itemUuid: item.uuid,
        alvo: alvo?.uuid ?? null, acertou, critico, travou, natural
      } } }
    });

    // Consome 1 de munição por ataque (a Segunda Chance repete o mesmo disparo) e registra o travamento.
    if (!repetido) {
      const dados = {};
      if (usaMunicao) dados["system.municaoAtual"] = Math.max(0, item.carregador - 1);
      if (travou) dados["system.travada"] = true;
      if (Object.keys(dados).length) await item.update(dados);
    }
    Hooks.callAll("sangueEscuro.ataque", this, item, { roll, natural, acertou, critico, alvo, repetido, travou, mensagem, contextoAcao, acaoGerenciada:controleAtaque.acaoGerenciada });
    return roll;
  }

  /* ----------------------- Iniciativa, turno e Sorte ----------------------- */

  /** Entra no Combat Tracker (criando o encontro, se o Mestre clicar) e rola a Iniciativa. */
  async entrarNoCombate() {
    const combate = game.combat;
    if (!combate && !game.user.isGM) {
      ui.notifications.warn("Não há combate ativo. Peça ao Mestre para criar o encontro.");
      return null;
    }
    const existente = combate?.combatants.find((c) => c.actorId === this.id);
    if (existente?.initiative !== null && existente?.initiative !== undefined) {
      ui.notifications.info(`${this.name} já tem Iniciativa (${existente.initiative}). A ordem não muda durante o combate.`);
      return combate;
    }
    const resultado = await this.rollInitiative({ createCombatants: true });
    if (!resultado) ui.notifications.warn("Não foi possível rolar a Iniciativa. Verifique se existe um encontro ativo cena atual.");
    return resultado;
  }

  /** Ação Antecipada: +1 ação agora e Dívida de Ação (2 ações no próximo turno). */
  podeAgir() {
    return !this.getFlag("sangue-escuro","morto") && !(this.type === "character" && this.system.pv.value <= 0) && !this.system.condicoes?.incapacitado && !this.system.condicoes?.paralisado;
  }

  async gastarReacao() {
    return serialAtor(this,async()=>{
    if (!this.podeAgir() || this.system.turno?.reacao < 1 || this.getFlag("sangue-escuro","reacaoBloqueada")) { ui.notifications.warn("Reação indisponível."); return false; }
    await this.update({"system.turno.reacao":this.system.turno.reacao-1}); return true;
    });
  }

  async usarAcaoBonus({permitido=false, antecipada=false}={}) {
    return serialAtor(this,async()=>{
    if (!this.podeAgir()) return false;
    const t=this.system.turno;
    let novo;
    try { novo=custoBonus({...t,intoxicado:!!this.system.condicoes.intoxicado,permitido,antecipada}); }
    catch(e) { ui.notifications.warn(e.message); return false; }
    await this.update(Object.fromEntries(Object.entries(novo).map(([k,v])=>["system.turno."+k,v])));
    return true;
    });
  }

  async acaoAntecipada() {
    const permitido=await foundry.applications.api.DialogV2.confirm({window:{title:"Ação Antecipada"},content:"<p>Confirme que uma habilidade, equipamento ou regra permite esta Ação Bônus por antecipação. Ela gera Dívida de Ação no próximo turno.</p>"});
    if (!permitido) return;
    return this.usarAcaoBonus({permitido:true,antecipada:true});
  }

  async correr() {
    return serialAtor(this,async()=>{
      if (!this.podeAgir() || this.getFlag("sangue-escuro","correu") || this.system.deslocamento <= 0) return ui.notifications.warn("Correr indisponível ou já utilizado neste turno.");
      if (!game.combat?.started || this.system.turno.acoes < 1) return ui.notifications.warn("Inicie um turno e mantenha uma Ação disponível.");
      await this.update({"system.turno.acoes":this.system.turno.acoes-1,"flags.sangue-escuro.correu":true});
      return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:this}),content:`<div class="se-flavor"><h3>Correr</h3><p>Deslocamento adicional: ${this.system.deslocamento} m. Uma vez por turno.</p></div>`});
    });
  }

  receberDano(dano,opcoes={}) { return receberDano(this,dano,opcoes); }

  /** Início do turno: restaura ações e reação, aplica a Dívida de Ação e remove Surpreendido. */
  async iniciarTurno() {
    if (this.type === "character") {
      const t = this.system.turno;
      const api = API();
      const base = api.regra("acoesPorTurno");
      const acoes = t.divida ? base - 1 : base;
      const reacoes = api.regra("reacoesPorRodada");
      const bonus = api.regra("acoesBonusPorTurno");
      const dados = { "system.turno.acoes": acoes, "system.turno.reacao": reacoes, "system.turno.bonus": bonus, "system.turno.divida": false };
      const estavaSurpreso = this.system.condicoes.surpreendido;
      if (estavaSurpreso) dados["system.condicoes.surpreendido"] = false;
      await this.update(dados);
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="se-flavor"><h3>Turno de ${this.name}</h3><p>${acoes} ações${t.divida ? " (Dívida de Ação aplicada)" : ""}, ${reacoes} Reação(ões) e ${bonus} Ação(ões) Bônus disponíveis.</p>${estavaSurpreso ? '<p class="se-nota">Deixa de estar Surpreendido.</p>' : ""}</div>`
      });
    }
    await iniciarTurnoDRS(this);
    // Módulos usam este gancho para efeitos de início de turno (sangramento, fogo, atordoamento...).
    Hooks.callAll("sangueEscuro.inicioTurno", this);
  }

  /** Descanso Curto: restaura habilidades com recarga curta. */
  async descansoCurto() {
    await this._restaurarUsos(["curto"]);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="se-flavor"><h3>Descanso Curto</h3><p>${this.name} descansa. Habilidades de recarga curta foram restauradas.</p></div>`
    });
    Hooks.callAll("sangueEscuro.descansoCurto", this);
  }

  /** Descanso Longo: remove 1 nível de Exaustão e restaura habilidades de recarga curta e longa. */
  async descansoLongo() {
    if (Hooks.call("sangueEscuro.preDescansoLongo",this) === false) return null;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Descanso Longo" },
      content: "<p>O personagem descansou 6 horas, com alimento, água potável e condições adequadas?<br>Remove 1 nível de Exaustão e restaura habilidades. Não recupera PV automaticamente.</p>"
    });
    if (!ok) return;
    const ex = this.system.exaustao.value;
    if (ex > 0) await this.update({ "system.exaustao.value": ex - 1 });
    await this._restaurarUsos(["curto", "longo"]);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="se-flavor"><h3>Descanso Longo</h3><p>${this.name} descansa. Exaustão: ${Math.max(0, ex - 1)}. Habilidades restauradas.</p></div>`
    });
    Hooks.callAll("sangueEscuro.descansoLongo", this);
  }

  async _restaurarUsos(recargas) {
    const mudancas = this.items
      .filter((i) => i.type === "habilidade" && i.system.usos.max > 0 && recargas.includes(i.system.usos.recarga))
      .map((i) => ({ _id: i.id, "system.usos.value": i.system.usos.max }));
    if (mudancas.length) await this.updateEmbeddedDocuments("Item", mudancas);
  }

  /** Usa uma habilidade de uso limitado. */
  async usarHabilidade(item) {
    const u = item.system.usos;
    if (u.max > 0) {
      if (u.value <= 0) return ui.notifications.warn(`${item.name} não tem usos restantes.`);
      await item.update({ "system.usos.value": u.value - 1 });
    }
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="se-flavor"><h3>${item.name}</h3><p>${this.name} usa <strong>${item.name}</strong>${u.max > 0 ? ` (usos restantes: ${u.value - 1}/${u.max})` : ""}.</p>${item.system.descricao ? `<p class="se-nota">${item.system.descricao}</p>` : ""}</div>`
    });
    Hooks.callAll("sangueEscuro.habilidade", this, item);
  }

  /**
   * Desconta ações do turno quando há combate em andamento. Retorna true se descontou.
   * Usado por módulos (ataques, recarregar, esquiva...).
   */
  async gastarAcoes(n = 1) {
    if (this.type !== "character" || !this.podeAgir() || !Number.isSafeInteger(n) || n < 1) return false;
    const combate = game.combat;
    if (!combate?.started || !combate.combatants.some((c) => c.actorId === this.id)) return false;
    const atual = this.system.turno.acoes;
    if (atual < n) { ui.notifications.warn(`${this.name} não tem ações suficientes neste turno.`); return false; }
    await this.update({ "system.turno.acoes": Math.max(0, atual - n) });
    return true;
  }

  /** Recarrega a arma (enche o carregador). */
  async recarregar(item) {
    if (Hooks.call("sangueEscuro.preRecarregar", this, item) === false) return null;
    if (!(item.system.capacidade > 0)) return ui.notifications.info("Esta arma não usa munição.");
    await item.update({ "system.municaoAtual": item.system.capacidade });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="se-flavor"><h3>Recarregar</h3><p>${this.name} recarrega ${item.name} (${item.system.capacidade}/${item.system.capacidade}).</p></div>`
    });
    Hooks.callAll("sangueEscuro.recarregar", this, item);
  }

  /** Destrava a arma (custa 1 Ação, sem consumir munição). */
  async destravar(item) {
    if (Hooks.call("sangueEscuro.preDestravar", this, item) === false) return null;
    if (!item.system.travada) return ui.notifications.info("Esta arma não está travada.");
    await item.update({ "system.travada": false });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="se-flavor"><h3>Destravar arma</h3><p>${this.name} destrava ${item.name}. Nenhuma munição é consumida.</p></div>`
    });
    Hooks.callAll("sangueEscuro.destravar", this, item);
  }

  async ganharSorte(n = 1) {
    const r = this.system.sorte;
    const novo = Math.min(r.max, r.value + n);
    await this.update({ "system.sorte.value": novo });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="se-flavor"><h3>Sorte</h3><p>${this.name} recebe ${novo - r.value} Ponto(s) de Sorte (${novo}/${r.max}).</p></div>`
    });
  }

  async gastarSorte(n = 1) {
    const r = this.system.sorte;
    if (r.value < n) {
      ui.notifications.warn(`${this.name} não tem Pontos de Sorte suficientes.`);
      return false;
    }
    await this.update({ "system.sorte.value": r.value - n });
    return true;
  }

  /** Última rolagem de teste ou ataque deste personagem no chat. */
  ultimoTeste() {
    return [...game.messages.contents].reverse()
      .find((m) => m.getFlag("sangue-escuro", "teste") && m.speaker?.actor === this.id);
  }

  /** Segunda Chance (1 Sorte): repete a rolagem uma única vez; o novo resultado vale. */
  async segundaChance(mensagem, custo = 1) {
    const dados = mensagem?.getFlag("sangue-escuro", "teste");
    if (!dados) return ui.notifications.warn("Nenhuma rolagem para repetir.");
    if (dados.repetido) return ui.notifications.warn("Uma rolagem não pode ser repetida mais de uma vez com Sorte.");
    if (!(await this.gastarSorte(custo))) return;
    if (dados.kind === "ataque") {
      const item = this.items.get(dados.itemId);
      return item ? this.rolarAtaque(item, null, { repetido: true, contextoAcao: dados.contextoAcao ?? "normal" }) : null;
    }
    return this.rolarTeste({ ...dados.params, repetido: true });
  }

  /** Teste de Pânico: Vontade contra NA 12; em falha, lista as reações possíveis. */
  async rolarPanico(event) {
    const roll = await this.rolarVontade(12, "Teste de Pânico (NA 12)", event);
    if (roll.total < 12) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="se-flavor"><h3>Reação de Pânico</h3><p class="se-nota">O Mestre escolhe: Hesitação (perde 1 ação), Fuga (próxima ação para se afastar), Tremor (−2 no próximo ataque), Congelamento (perde as ações restantes) ou Desorientação (sem Mirar até o fim do próximo turno).</p></div>`
      });
    }
    return roll;
  }

  /** Ataque desarmado: usa Força; dano 1 Contundente + modificador de Força (mínimo 1). */
  rolarDesarmado(event) {
    const dano = Math.max(1, 1 + (this.system.atributos.for.mod ?? 0));
    return this.rolarTeste({
      chave: "for", rotulo: "Ataque desarmado", tipo: "ataque", event,
      extraFlavor: `<p class="se-nota">Em caso de acerto: ${dano} de dano Contundente (o PR do alvo reduz o dano).</p>`
    });
  }

  /** Dano de arma (ou golpe da criatura). */
  async rolarDano(item, { critico = false, ocorrencia = null } = {}) {
    const sys = item.system;
    const mod = this.type === "character" && sys.somaAtributoDano ? this.system.atributos[sys.atributo]?.mod ?? 0 : 0;
    let formula = `${sys.dano}`;
    if (mod) formula += ` + ${mod}`;
    if (critico && /^\d+(d\d+)?$/.test(sys.bonusCritico.trim())) formula += ` + ${sys.bonusCritico.trim()}`;
    const roll = await new Roll(formula).evaluate();

    let nota = `<p class="se-nota">O PR do alvo reduz o dano. Tipo: ${sys.tipoDano}.</p>`;
    if (critico && sys.efeitoCritico) nota += `<p class="se-nota">Efeito crítico: <strong>${sys.efeitoCritico}</strong>.</p>`;
    const flavor = `<div class="se-flavor"><h3>Dano${critico ? " crítico" : ""}: ${item.name}</h3>${nota}</div>`;
    const dadosDano = {
      origem: this.uuid, itemUuid: item.uuid, nome: item.name, total: roll.total, tipoDano: sys.tipoDano,
      critico, efeito: critico ? sys.efeitoCritico : ""
    };
    if (ocorrencia?.ataqueUuid) dadosDano.ocorrencia = {
      ataqueUuid: ocorrencia.ataqueUuid, alvo: ocorrencia.alvo ?? null
    };
    Hooks.callAll("sangueEscuro.preDano", this, item, dadosDano);   // extensões podem acrescentar campos a dadosDano
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }), flavor,
      flags: { "sangue-escuro": { dano: dadosDano } }
    });
    Hooks.callAll("sangueEscuro.dano", this, item, dadosDano);
    return roll;
  }

  /** Golpe de criatura (ficha simples). */
  async rolarGolpeCriatura(event) {
    if (Hooks.call("sangueEscuro.preAtaqueCriatura",this) === false) return null;
    const s = this.system;
    const alvo = game.user.targets.first()?.actor;
    const na = alvo ? Number(alvo.system.na ?? 10) : 10;
    const pen = this.penalidades("for", "ataque", { alvo });
    let modo = SEActor._modo(event, pen.desvantagem);
    if (pen.vantagem) modo = Math.max(-1, Math.min(1, modo + 1));
    const d20 = modo > 0 ? "2d20kh" : modo < 0 ? "2d20kl" : "1d20";
    const roll = await new Roll(`${d20} + @atk + @pen`, { atk: s.ataque, pen: pen.total }).evaluate();
    const natural = roll.dice[0].results.find((r) => r.active)?.result;
    const acertou = natural === 20 || roll.total >= na;
    const notas = [...pen.partes.map((p) => `${p.rotulo} ${sinal(p.valor)}`), modo > 0 ? "Vantagem" : "", modo < 0 ? "Desvantagem" : ""].filter(Boolean);
    const botoes = acertou
      ? `<div class="se-botoes"><button type="button" data-se-acao="danoCriatura" data-actor="${this.uuid}">Rolar dano</button></div>` : "";
    const flavor = `<div class="se-flavor"><h3>Ataque: ${this.name}</h3>
      <small>Ataque ${sinal(s.ataque)}${notas.length ? ` · ${notas.join(" · ")}` : ""} · contra ${alvo ? `${alvo.name} (NA ${na})` : "NA 10"}</small>
      <p class="se-resultado ${acertou ? "ok" : "falha"}">${acertou ? "Acerto" : "Erro"}</p>${botoes}</div>`;
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor });
    Hooks.callAll("sangueEscuro.ataqueCriatura", this, { roll, natural, acertou, alvo });
  }

  async rolarDanoCriatura() {
    const s = this.system;
    const roll = await new Roll(s.dano).evaluate();
    const flavor = `<div class="se-flavor"><h3>Dano: ${this.name}</h3><p class="se-nota">${s.tipoDano}. O PR do alvo reduz o dano.</p></div>`;
    const dadosDano = { origem: this.uuid, nome: this.name, total: roll.total, tipoDano: s.tipoDano, critico: false, efeito: "" };
    Hooks.callAll("sangueEscuro.preDano", this, null, dadosDano);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }), flavor,
      flags: { "sangue-escuro": { dano: dadosDano } }
    });
    Hooks.callAll("sangueEscuro.dano", this, null, dadosDano);
  }
}

/* -------------------------------------------------------------------------- */
/*  ITEM                                                                      */
/* -------------------------------------------------------------------------- */

const IMG_PADRAO = {
  arma: "icons/svg/sword.svg", protecao: "icons/svg/shield.svg",
  habilidade: "icons/svg/upgrade.svg", equipamento: "icons/svg/item-bag.svg"
};

export class SEItem extends Item {
  static async createDialog(data = {}, options = {}) {
    return criarItemPorDialogo(this, data, options, (d,o) => super.createDialog(d,o));
  }

  /** Munição atual no carregador (vazio = cheio). */
  get carregador() {
    const s = this.system;
    return s.municaoAtual ?? s.capacidade ?? 0;
  }

  async _preCreate(data, options, user) {
    const r = await super._preCreate(data, options, user);
    if (r === false) return false;
    const img = imagemAutomatica({...data, type: this.type});
    if (img) this.updateSource({img});
    else if (!data.img || data.img === Item.DEFAULT_ICON) this.updateSource({ img: IMG_PADRAO[this.type] ?? Item.DEFAULT_ICON });
  }

  /** Compartimentos que o item ocupa na mochila. */
  get espaco() {
    if (this.getFlag("sangue-escuro", "virtual") === true) return 0;
    const s = this.system;
    switch (this.type) {
      case "arma": return s.longa ? 2 : 1;
      case "protecao": return s.vestida ? 0 : s.compartimentos;
      case "equipamento": {
        if (s.compartimentosFixos > 0) return s.compartimentosFixos;
        const por = s.porCompartimento || CATEGORIAS_EQUIPAMENTO[s.categoria]?.porCompartimento || 1;
        return s.quantidade > 0 ? Math.ceil(s.quantidade / por) : 0;
      }
      default: return 0;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  COMBATANT                                                                 */
/* -------------------------------------------------------------------------- */

export class SECombatant extends Combatant {
  /** Iniciativa = 1d20 + mod. de Agilidade; desempate pelo valor de Agilidade. */
  _getInitiativeFormula() {
    const a = this.actor;
    if (!a) return "1d20";
    if (a.type === "criatura") return `1d20 + ${a.system.iniciativa}`;
    const agi = a.system.atributos.agi;
    return `1d20 + ${agi.mod} + ${agi.valor / 100}`;
  }
}
