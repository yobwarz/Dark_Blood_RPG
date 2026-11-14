import * as regrasDRS from "./module/drs-regras.mjs";
import {registrarDRS,migrarDRS} from "./module/drs-runtime.mjs";
import {registrarInterfaceDRS} from "./module/drs-ui.mjs";
import { registrarOrganizacaoCompendios, organizarBiblioteca } from "./module/compendios.mjs";
import { registrarMigracaoIcones, atualizarIconesAoIniciar } from "./module/icones-migracao.mjs";
import { registrarIcones } from "./module/icones-ui.mjs";
import { registrarExclusividade, verificarCenariosAoIniciar } from "./module/cenarios.mjs";
import { SE } from "./module/config.mjs";
import { SEApi } from "./module/api.mjs";
import { CharacterData, CriaturaData, ArmaData, ProtecaoData, HabilidadeData, EquipamentoData } from "./module/data.mjs";
import { SEActor, SEItem, SECombatant } from "./module/documents.mjs";
import { CharacterSheet, AlternativeCharacterSheet, CriaturaSheet, SEItemSheet } from "./module/sheets.mjs";
import { registrarTema, aplicarTema } from "./module/tema.mjs";
import { registrarGatilhos } from "./module/gatilhos.mjs";
import { ImportarMenu, oferecerImportacao, importarConteudo } from "./module/importer.mjs";

Hooks.once("init", () => {
  console.log("Sangue Escuro | Inicializando o sistema");
  CONFIG.SE = SE;

  // API de extensões: módulos de cenário se registram no gancho "sangueEscuro.api" (veja API.md).
  const api = new SEApi();
  game.sangueEscuro = { importarConteudo, api, versaoApi: api.versao, drs:regrasDRS };

  CONFIG.Actor.documentClass = SEActor;
  CONFIG.Item.documentClass = SEItem;
  CONFIG.Combatant.documentClass = SECombatant;

  CONFIG.Actor.dataModels = { character: CharacterData, criatura: CriaturaData };
  CONFIG.Item.dataModels = { arma: ArmaData, protecao: ProtecaoData, habilidade: HabilidadeData, equipamento: EquipamentoData };

  // Os módulos registram cenários, regras, listas, páginas e conteúdo aqui; depois disso o registro é encerrado.
  Hooks.callAll("sangueEscuro.api", api);
  registrarInterfaceDRS(api);
  api._congelar();

  CONFIG.Combat.initiative = { formula: "1d20", decimals: 2 };
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["pv", "ps", "estresse", "fome"], value: ["estresse.value", "fome.value", "exposicao.value", "exaustao.value", "sorte.value"] },
    criatura: { bar: ["pv"], value: ["na", "pr"] }
  };

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, "sangue-escuro", CharacterSheet, {
    types: ["character"], makeDefault: true, label: "Clássica (atual)"
  });
  DocumentSheetConfig.registerSheet(Actor, "sangue-escuro", AlternativeCharacterSheet, {
    types: ["character"], makeDefault: false, label: "Alternativa 1"
  });
  DocumentSheetConfig.registerSheet(Actor, "sangue-escuro", CriaturaSheet, {
    types: ["criatura"], makeDefault: true, label: "Ficha de Criatura"
  });
  DocumentSheetConfig.registerSheet(Item, "sangue-escuro", SEItemSheet, {
    types: ["arma", "protecao", "habilidade", "equipamento"], makeDefault: true, label: "Ficha de Item"
  });

  game.settings.register("sangue-escuro", "cenario", {
    name: "Cenário ativo",
    hint: "Escolha qual módulo de cenário altera as regras deste mundo. “Regras base” usa apenas o DRS do Sangue Escuro.",
    scope: "world", config: true, type: String, default: "base", requiresReload: true,
    choices: Object.fromEntries(api.cenarios.map((c) => [c.id, c.nome]))
  });

  registrarExclusividade();
  registrarTema();
  registrarIcones();
  registrarOrganizacaoCompendios();
  registrarMigracaoIcones();
  registrarGatilhos();
  registrarDRS();
  game.settings.register("sangue-escuro","peReferencia",{name:"DRS: PE de referência da campanha",hint:"Total anunciado pelo Mestre para personagens substitutos; mínimo 20 e no máximo o maior total legítimo do grupo, incluindo PE gastos.",scope:"world",config:true,type:Number,default:20,range:{min:20,max:10000,step:1}});

  game.settings.register("sangue-escuro", "importado", {
    name: "Compêndios importados", scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.registerMenu("sangue-escuro", "importar", {
    name: "Compêndios do sistema",
    label: "Escolher compêndios",
    hint: "Escolha pacotes do DRS ou do cenário ativo. O modo padrão acrescenta apenas documentos ausentes e preserva os existentes.",
    icon: "fa-solid fa-book-skull",
    type: ImportarMenu,
    restricted: true
  });
});

Hooks.once("ready", async () => {
  aplicarTema();
  try { await migrarDRS(); } catch(e) { console.error("Sangue Escuro | Migração DRS",e); ui.notifications.error("A migração DRS não foi concluída. Os documentos existentes foram preservados; confira o console antes de jogar."); }
  verificarCenariosAoIniciar();
  await atualizarIconesAoIniciar();
  await organizarBiblioteca();
  oferecerImportacao();
});
