import {iconePredefinido, iconeGenerico, itensDoMundo} from './icones.mjs';
const MOD='sangue-escuro', CHAVE='iconesCatalogoVersao', VERSAO=1;
const PACKS=new Set(['sangue-escuro-equipamentos','sangue-escuro-habilidades']);
export function registrarMigracaoIcones(){
 game.settings.register(MOD,CHAVE,{scope:'world',config:false,type:Number,default:0});
}
/** Somente imagens genéricas. Sem recriação, exclusão, reimportação ou alteração de regras. */
export async function atualizarIconesBase(itens){
 let quantidade=0;
 for(const item of itens){
  if(!item.isOwner||!iconeGenerico(item))continue;
  const registro=iconePredefinido(item);if(!registro||item.img===registro.img)continue;
  await item.update({img:registro.img});quantidade++;
 }
 return quantidade;
}
function compendioBase(pack){
 // Importador do sistema cria esses compêndios no mundo. Nunca abre pacotes de terceiros.
 const nome=pack.metadata?.name??pack.collection?.replace(/^world\./,'');
 return pack.documentName==='Item' && pack.collection?.startsWith('world.') && PACKS.has(nome);
}
export async function atualizarIconesAoIniciar(){
 if(!game.user.isGM || game.users.activeGM && !game.users.activeGM.isSelf)return 0;
 if(game.settings.get(MOD,CHAVE)>=VERSAO)return 0;
 let total=0;
 try {
  total+=await atualizarIconesBase(itensDoMundo());
  for(const pack of game.packs.values()){
   if(!compendioBase(pack))continue;
   const itens=await pack.getDocuments();
   if(!itens.some(i=>iconeGenerico(i)&&iconePredefinido(i)))continue;
   const bloqueado=pack.locked;
   try {
    if(bloqueado)await pack.configure({locked:false});
    total+=await atualizarIconesBase(itens);
   } finally {if(bloqueado)await pack.configure({locked:true});}
  }
  await game.settings.set(MOD,CHAVE,VERSAO);
  if(total)ui.notifications.info(`Sangue Escuro: ícones predefinidos aplicados a ${total} itens existentes.`);
  return total;
 }catch(err){
  console.error('Sangue Escuro | Atualização automática das imagens',err);
  ui.notifications.warn('Sangue Escuro: algumas imagens não foram atualizadas. Uma nova tentativa ocorrerá ao reabrir o mundo. Consulte o console.');
  return total;
 }
}
