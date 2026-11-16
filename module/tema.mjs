/** Tema de cores configurável (hexadecimal) do Sangue Escuro. */
const SISTEMA = "sangue-escuro";
const HEX = /^#[0-9a-fA-F]{6}$/;

export const TEMA_PADRAO = {
  fundo: "#17110e",
  brilho: "#4a1d17",
  painel: "#241c17",
  texto: "#e8dcc2",
  textoFraco: "#a39580",
  detalhe: "#b89a5b",
  destaque: "#9a2323",
  creme: "#eadbb8",
  cremeTexto: "#2a1c12",
  pip: "#eadbb8"
};

export const ROTULOS = {
  fundo: "Fundo da janela",
  brilho: "Brilho do fundo (topo)",
  painel: "Painéis",
  texto: "Texto",
  textoFraco: "Texto secundário",
  detalhe: "Detalhes e bordas (dourado)",
  destaque: "Destaque (sangue)",
  creme: "Plaquetas e números",
  cremeTexto: "Texto das plaquetas",
  pip: "Marcadores (bolinhas)"
};

export const PRESETS = {
  "Sangue seco": { ...TEMA_PADRAO },
  "Cinzas": {
    fundo: "#14161a", brilho: "#2c3440", painel: "#1d2127", texto: "#e2e4e8", textoFraco: "#8f96a3",
    detalhe: "#9aa6b8", destaque: "#7c2d3a", creme: "#d9dde4", cremeTexto: "#1b1f26", pip: "#d9dde4"
  },
  "Ouro velho": {
    fundo: "#16120a", brilho: "#4a3510", painel: "#211a0e", texto: "#efe2bd", textoFraco: "#a8996f",
    detalhe: "#d1a94a", destaque: "#8a2a14", creme: "#f1e2b4", cremeTexto: "#2b1d08", pip: "#f1e2b4"
  },
  "Necrófago": {
    fundo: "#0f130e", brilho: "#26381c", painel: "#182016", texto: "#dde6cc", textoFraco: "#8c9a78",
    detalhe: "#9bb06a", destaque: "#7a1f1f", creme: "#d8e3bb", cremeTexto: "#18200f", pip: "#d8e3bb"
  }
};

const VARIAVEIS = {
  fundo: "--se-fundo", brilho: "--se-brilho", painel: "--se-painel", texto: "--se-texto",
  textoFraco: "--se-texto-fraco", detalhe: "--se-detalhe", destaque: "--se-destaque",
  creme: "--se-creme", cremeTexto: "--se-creme-texto", pip: "--se-pip"
};

export function limparPaleta(dados) {
  return Object.fromEntries(Object.entries(dados??{}).filter(([k,v])=>Object.hasOwn(TEMA_PADRAO,k)&&typeof v==='string'&&HEX.test(v)).map(([k,v])=>[k,v.toLowerCase()]));
}
export function temaDoMundo() { return {...TEMA_PADRAO,...limparPaleta(game.settings.get(SISTEMA,'tema'))}; }
export function coresPessoaisAtivas() {
  return game.settings.get(SISTEMA,'temaPessoalAtivo')!==false&&Object.keys(limparPaleta(game.settings.get(SISTEMA,'temaPessoal'))).length>0;
}
export function temaAtual() {
  return {...temaDoMundo(),...(coresPessoaisAtivas()?limparPaleta(game.settings.get(SISTEMA,'temaPessoal')):{})};
}
let filaTema=Promise.resolve();
function serializarTema(fn){const p=filaTema.catch(()=>{}).then(fn);filaTema=p;return p;}

export function aplicarTema() {
  const tema = temaAtual();
  for (const [k, v] of Object.entries(tema)) document.documentElement.style.setProperty(VARIAVEIS[k], v);
}

/* -------------------------------------------------------------------------- */

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

class TemaConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static CHAVE = "tema";
  static TITULO = "Cores da ficha (mundo)";

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["sangue-escuro", "se-config"],
    window: { icon: "fa-solid fa-palette", resizable: false },
    position: { width: 500, height: "auto" },
    form: { handler: TemaConfig.salvar, closeOnSubmit: true },
    actions: { restaurar: TemaConfig.restaurar, preset: TemaConfig.preset, limpar: TemaConfig.limpar }
  };

  static PARTS = { corpo: { template: "systems/sangue-escuro/templates/config/tema.hbs" } };

  get title() { return this.constructor.TITULO; }

  async _prepareContext() {
    const guardado = game.settings.get(SISTEMA, this.constructor.CHAVE) ?? {};
    const valores = this.constructor.CHAVE === "tema" ? temaDoMundo() : {...temaDoMundo(),...limparPaleta(guardado)};
    return {
      campos: Object.keys(TEMA_PADRAO).map((k) => ({ chave: k, rotulo: ROTULOS[k], valor: valores[k] })),
      presets: Object.keys(PRESETS),
      pessoal: this.constructor.CHAVE === "temaPessoal",
      pessoalAtivo: coresPessoaisAtivas()
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelectorAll(".se-cor-linha").forEach((linha) => {
      const cor = linha.querySelector("input[type=color]");
      const txt = linha.querySelector("input[type=text]");
      cor.oninput = cor.onchange = () => { txt.value = cor.value; };
      txt.oninput = txt.onchange = () => { const value=txt.value.trim();if(HEX.test(value))cor.value=value; };
    });
  }

  _preencher(tema) {
    for (const [k, v] of Object.entries(tema)) {
      const cor = this.element.querySelector(`[name="cor-${k}"]`);
      const txt = this.element.querySelector(`[name="txt-${k}"]`);
      if (cor && txt) { cor.value = v; txt.value = v; }
    }
  }

  static async salvar(event, form, formData) {
    const dados=formData.object,tema={};
    for(const k of Object.keys(TEMA_PADRAO)){
      const v=String(dados[`txt-${k}`]??'').trim();
      if(!HEX.test(v)){const message=`Cor inválida em “${ROTULOS[k]}”: use o formato #RRGGBB.`;ui.notifications.warn(message);throw Error(message);}
      tema[k]=v.toLowerCase();
    }
    const chave=this.constructor.CHAVE,seguirMundo=dados.seguirMundo===true||dados.seguirMundo==='on';
    return serializarTema(async()=>{
      if(chave==='tema'&&!game.user.isGM)throw Error('Somente o Mestre pode alterar as cores do mundo.');
      await game.settings.set(SISTEMA,chave,tema);
      if(chave==='temaPessoal')await game.settings.set(SISTEMA,'temaPessoalAtivo',true);
      else if(seguirMundo)await game.settings.set(SISTEMA,'temaPessoalAtivo',false);
      aplicarTema();
      if(chave==='tema'&&coresPessoaisAtivas())ui.notifications.info('Cores do mundo salvas. Suas cores pessoais continuam ativas neste navegador.');
    });
  }

  static restaurar() { this._preencher(TEMA_PADRAO); }
  static preset(event, alvo) { this._preencher(PRESETS[alvo.dataset.preset]); }
  static async limpar() {
    await serializarTema(async()=>{await game.settings.set(SISTEMA,'temaPessoalAtivo',false);aplicarTema();});
    await this.close();
  }
}

export class TemaMundo extends TemaConfig {}

export class TemaPessoal extends TemaConfig {
  static CHAVE = "temaPessoal";
  static TITULO = "Cores da ficha (somente para mim)";
}

export function registrarTema() {
  game.settings.register(SISTEMA,'temaPessoalAtivo',{
    scope:'client',config:false,type:Boolean,default:true,onChange:()=>aplicarTema()
  });
  game.settings.register(SISTEMA, "tema", {
    scope: "world", config: false, type: Object, default: {}, onChange: () => aplicarTema()
  });
  game.settings.register(SISTEMA, "temaPessoal", {
    scope: "client", config: false, type: Object, default: {}, onChange: () => aplicarTema()
  });
  game.settings.registerMenu(SISTEMA, "temaMundo", {
    name: "Cores da ficha (todo o mundo)", label: "Editar cores do mundo",
    hint: "Define as cores padrão das fichas para todos os jogadores, em hexadecimal.",
    icon: "fa-solid fa-palette", type: TemaMundo, restricted: true
  });
  game.settings.registerMenu(SISTEMA, "temaPessoal", {
    name: "Cores da ficha (pessoal)", label: "Editar minhas cores",
    hint: "Sobrescreve as cores do mundo apenas para você.",
    icon: "fa-solid fa-droplet", type: TemaPessoal, restricted: false
  });
}
