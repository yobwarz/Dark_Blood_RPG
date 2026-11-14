import { ICONES, imagemAutomatica, itensDoMundo, aplicarIcones } from './icones.mjs';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class GaleriaIcones extends HandlebarsApplicationMixin(ApplicationV2) {
 constructor(item,options={}) {super(options);this.item=item;}
 static DEFAULT_OPTIONS={classes:['se-galeria-icones'],window:{title:'Ícones do Sangue Escuro',resizable:true},position:{width:720,height:620},actions:{escolher:GaleriaIcones.escolher}};
 static PARTS={corpo:{template:'systems/sangue-escuro/templates/config/icones.hbs',scrollable:['.se-icones-grid']}};
 async _prepareContext(){return {icones:ICONES,grupos:[...new Set(ICONES.map(i=>i.grupo))],nome:this.item.name};}
 _onRender(context,options){super._onRender(context,options);const el=this.element;
  const normal=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const filtrar=()=>{const q=normal(el.querySelector('[data-busca]').value);const grupo=el.querySelector('[data-grupo]').value;
   for(const card of el.querySelectorAll('[data-icone]'))card.hidden=!!((grupo&&card.dataset.grupo!==grupo)||!normal(card.dataset.nome).includes(q));};
  el.querySelector('[data-busca]').addEventListener('input',filtrar);el.querySelector('[data-grupo]').addEventListener('change',filtrar);
 }
 static async escolher(event,target){if(!this.item.isOwner)return;const icone=ICONES.find(i=>i.id===target.dataset.icone);if(!icone)return;
  await this.item.update({img:icone.img,'flags.sangue-escuro.iconeManual':true});await this.close();}
}
export class AtualizarIconesMenu extends HandlebarsApplicationMixin(ApplicationV2) {
 static DEFAULT_OPTIONS={window:{title:'Atualizar imagens de itens',resizable:true},position:{width:540,height:500},actions:{aplicar:AtualizarIconesMenu.aplicar}};
 static PARTS={corpo:{template:'systems/sangue-escuro/templates/config/atualizar-icones.hbs',scrollable:['.se-atualizar-icones']}};
 async _prepareContext(){return {quantidade:itensDoMundo().filter(i=>imagemAutomatica(i)).length,pacotes:[...game.packs.values()].filter(p=>p.documentName==='Item').map(p=>({id:p.collection,nome:p.metadata.label,bloqueado:p.locked}))};}
 static async aplicar(){
  if(!game.user.isGM)return;const btn=this.element.querySelector('[data-action="aplicar"]');btn.disabled=true;
  try {let n=0;
   if(this.element.querySelector('[name="mundo"]').checked)n+=await aplicarIcones(itensDoMundo());
   for(const input of this.element.querySelectorAll('[name="pacote"]:checked')) {const pack=game.packs.get(input.value);if(!pack||pack.locked)continue;n+=await aplicarIcones(await pack.getDocuments());}
   ui.notifications.info(`${n} imagens atualizadas. Imagens personalizadas e itens sem correspondência foram preservados.`);await this.render(true);
  }catch(err){console.error('Sangue Escuro | Atualização de ícones',err);ui.notifications.error('A atualização foi interrompida. Consulte o console; é seguro executar novamente.');}
  finally{btn.disabled=false;}
 }
}
export function registrarIcones(){
 game.settings.registerMenu('sangue-escuro','icones',{name:'Imagens dos itens',label:'Atualizar imagens dos itens',hint:'Aplica o pacote de ícones aos itens conhecidos. Preserva imagens personalizadas. Compêndios devem estar desbloqueados.',icon:'fa-solid fa-images',type:AtualizarIconesMenu,restricted:true});
}
