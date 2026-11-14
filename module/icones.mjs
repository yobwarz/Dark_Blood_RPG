import { ICONES as ICONES_PACOTE } from './icones-catalogo.mjs';
import { ICONES_BASE } from './icones-base.mjs';
export { ICONES_BASE };
const grupos={arma:'Armas e ferramentas',equipamento:'Equipamentos',protecao:'Proteções',habilidade:'Habilidades'};
const extras=[...new Map(ICONES_BASE.filter(i=>!ICONES_PACOTE.some(p=>p.img===i.img)).map(i=>[i.img,i])).values()];
export const ICONES=[...ICONES_PACOTE,...extras.map(i=>({id:i.img.split('/').pop().replace('.svg',''),nome:i.name,grupo:grupos[i.type],img:i.img}))];
const normal = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const chave = (type,name) => `${type}:${normal(name)}`;
const porChave=new Map(ICONES_BASE.map(i=>[chave(i.type,i.name),i]));
/** A origem acompanha documentos renomeados; os IDs nativos permanecem intactos. */
export function iconePredefinido(item) {
 const origem=item.flags?.['sangue-escuro']?.origemCompendio;
 if(typeof origem==='string') {
  const prefixo=origem.match(/^sangue-escuro-(?:equipamentos|habilidades):/);
  if(prefixo){const identidade=origem.slice(prefixo[0].length).replace(/:\d+$/,'');const corte=identidade.indexOf(':');
   const registro=porChave.get(chave(identidade.slice(0,corte),identidade.slice(corte+1)));if(registro)return registro;}
 }
 return porChave.get(chave(item.type,item.name))??null;
}
const PADROES = new Set(['icons/svg/item-bag.svg','icons/svg/item-bag.png','icons/svg/sword.svg','icons/svg/target.svg','icons/svg/shield.svg','icons/svg/upgrade.svg','icons/svg/book.svg','icons/svg/mystery-man.svg','modules/sangue-escuro-dead-space/assets/dead-space.svg']);
export function iconeGenerico(item) {
  if(item.flags?.['sangue-escuro']?.iconeManual) return false;
  return !item.img || PADROES.has(item.img);
}
const regrasArmas = [
 [/^(faca|canivete|adaga)( |$)/,'12_faca'],
 [/^besta( |$)/,'06_besta'],
 [/^(coquetel molotov|molotov)$/,'04_coquetel_molotov'],
 [/^(pistola 9 ?mm|pistola com silenciador|pistola)$/,'arma_10'],
 [/^desert eagle( |$)/,'arma_34'],
 [/^submetralhadora uzi$/,'arma_10-2'],
 [/^(smg caseira|submetralhadora)( |$)/,'arma_02'],
 [/^(fuzil ak|ak 47)( |$)/,'arma_08'],
 [/^(fuzil m4|m4)( |$)/,'arma_03'],
 [/^(espingarda|escopeta)( |$)/,'arma_01-2'],
 [/^(fuzil de precisao|rifle de precisao)( |$)/,'arma_20'],
 [/^(rifle de caca|rifle)$/,'arma_05'],
 [/^carabina lever action$/,'arma_19'],
 [/^cortador de plasma$/,'abx-1'],
 [/^rifle de pulso$/,'arma_02-3'],
 [/^lanca chamas de mineracao$/,'abx-12'],
 [/^serra de plasma$/,'abx-5']
];
const regrasEquip = [
 [/^mascara de gas$/,'01_mascara_de_gas'],
 [/^mochila( |$)/,'05_mochila'],
 [/^(coquetel molotov|molotov)$/,'04_coquetel_molotov'],
 [/^arame farpado$/,'09_arame_farpado'],
 [/^barril( |$)/,'08_barril'],
 [/^fogueira$/,'11_fogueira']
];
/** Apenas o nome de armas/equipamentos conhecidos; nunca lê descrição ou nome de habilidade. */
export function sugerirIcone(item) {
 const predefinido=iconePredefinido(item);
 if(predefinido)return ICONES.find(i=>i.img===predefinido.img)??null;
 const regras=item.type==='arma'?regrasArmas:item.type==='equipamento'?regrasEquip:[];
 const id=regras.find(([re])=>re.test(normal(item.name)))?.[1];
 return ICONES.find(i=>i.id===id)??null;
}
export function imagemAutomatica(item) {
 return iconeGenerico(item) ? sugerirIcone(item)?.img??null : null;
}
/** Abrange itens do mundo e inventários, sem copiar documentos ou alterar regras. */
export function itensDoMundo() {
 return [...(game.items?.contents??[]),...(game.actors?.contents??[]).flatMap(a=>a.items.contents),
 ...[...(game.scenes?.contents??[])].flatMap(s=>s.tokens.contents.filter(t=>!t.actorLink&&t.actor).flatMap(t=>t.actor.items.contents))];
}
export async function aplicarIcones(itens) {
 let atualizados=0;
 for(const item of itens) {
   const img=imagemAutomatica(item);
   if(!img || !item.isOwner || item.pack && game.packs.get(item.pack)?.locked) continue;
   await item.update({img}); atualizados++;
 }
 return atualizados;
}
