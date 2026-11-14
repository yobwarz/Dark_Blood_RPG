import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {ICONES_BASE,iconePredefinido,imagemAutomatica,ICONES} from '../module/icones.mjs';
import {atualizarIconesAoIniciar} from '../module/icones-migracao.mjs';
const raiz=new URL('../',import.meta.url);
const dados=JSON.parse(await readFile(new URL('data/itens.json',raiz),'utf8'));
const originais=Object.values(dados).flat();assert.equal(originais.length,128);assert.equal(ICONES_BASE.length,128);
for(const item of originais){
 assert.ok(item.img.startsWith('systems/sangue-escuro/assets/icones/'),item.name);
 assert.equal(iconePredefinido(item).img,item.img);
 await access(new URL(item.img.replace('systems/sangue-escuro/',''),raiz));
 assert.ok(ICONES.some(i=>i.img===item.img),item.name);
 const antigo={...item,img:item.type==='arma'?'icons/svg/target.svg':item.type==='protecao'?'icons/svg/shield.svg':item.type==='habilidade'?'icons/svg/upgrade.svg':'icons/svg/item-bag.svg'};
 assert.equal(imagemAutomatica(antigo),item.img,item.name);
 assert.equal(imagemAutomatica({...antigo,img:'worlds/campanha/icone.webp'}),null);
 assert.equal(imagemAutomatica({...antigo,flags:{'sangue-escuro':{iconeManual:true}}}),null);
}
assert.equal(originais.find(i=>i.name==='Revólver .38').img,originais.find(i=>i.name==='Revólver Magnum .44').img);
assert.equal(originais.find(i=>i.name==='Faca de cozinha').img,originais.find(i=>i.name==='Faca de combate militar').img);
const renamed={type:'arma',name:'Arma do Carlos',img:'icons/svg/target.svg',flags:{'sangue-escuro':{origemCompendio:'sangue-escuro-equipamentos:arma:Fuzil AK-47:1'}}};
assert.equal(iconePredefinido(renamed).img,originais.find(i=>i.name==='Fuzil AK-47').img);
let stamp=0,mudancas=[],avisos=[];
function doc(name,img='icons/svg/target.svg',flags={}){
 return {id:'id-'+name,name,type:'arma',img,flags,isOwner:true,system:{dano:'1d8',durabilidade:{value:5,max:10}},async update(d){assert.deepEqual(Object.keys(d),['img']);mudancas.push(this.id);Object.assign(this,d);}};
}
const mundo=doc('Pistola 9mm'),inventario=doc('Machado de lenhador','icons/svg/sword.svg'),token=doc('Revólver .38'),packItem=doc('Fuzil AK-47');
const manual=doc('Faca de cozinha','icons/svg/sword.svg',{'sangue-escuro':{iconeManual:true}});
const propria=doc('Espingarda de cano curto','worlds/imagens/espingarda.png');
const copiar=structuredClone({id:mundo.id,system:mundo.system});
const lock=[];let falha=false;
const pack={collection:'world.sangue-escuro-equipamentos',metadata:{name:'sangue-escuro-equipamentos'},documentName:'Item',locked:true,async configure(d){lock.push(d.locked);Object.assign(this,d);},async getDocuments(){return [packItem];}};
globalThis.game={user:{isGM:true},users:{activeGM:{isSelf:true}},settings:{get:()=>stamp,set:async(m,k,v)=>stamp=v},items:{contents:[mundo,manual,propria]},actors:{contents:[{items:{contents:[inventario]}}]},scenes:{contents:[{tokens:{contents:[{actorLink:false,actor:{items:{contents:[token]}}},{actorLink:true,actor:{items:{contents:[inventario]}}}]}}]},packs:new Map([[pack.collection,pack],['modulo.teste',{...pack,collection:'modulo.teste',getDocuments:()=>assert.fail('Não alterar compêndio de módulo')}],['world.outro',{...pack,collection:'world.outro',metadata:{name:'outro'},getDocuments:()=>assert.fail('Não alterar compêndio personalizado')}]] )};
globalThis.ui={notifications:{info:m=>avisos.push(m),warn:m=>avisos.push(m)}};
assert.equal(await atualizarIconesAoIniciar(),4);assert.equal(stamp,1);assert.deepEqual(lock,[false,true]);assert.equal(pack.locked,true);assert.equal(mudancas.length,4);
assert.equal(mundo.id,copiar.id);assert.deepEqual(mundo.system,copiar.system);assert.equal(propria.img,'worlds/imagens/espingarda.png');assert.equal(manual.img,'icons/svg/sword.svg');
assert.equal(await atualizarIconesAoIniciar(),0);assert.equal(mudancas.length,4);
stamp=0;game.user.isGM=false;assert.equal(await atualizarIconesAoIniciar(),0);assert.equal(stamp,0);
game.user.isGM=true;game.users.activeGM.isSelf=false;assert.equal(await atualizarIconesAoIniciar(),0);assert.equal(stamp,0);game.users.activeGM.isSelf=true;
packItem.img='icons/svg/target.svg';packItem.update=async()=>{throw Error('Falha simulada de gravação');};
const anterior=console.error;console.error=()=>{};try{assert.equal(await atualizarIconesAoIniciar(),0);}finally{console.error=anterior;}
assert.equal(stamp,0);assert.equal(pack.locked,true);assert.deepEqual(lock.slice(-2),[false,true]);
packItem.update=async d=>Object.assign(packItem,d);assert.equal(await atualizarIconesAoIniciar(),1);assert.equal(stamp,1);
console.log('OK: 128 itens com caminhos existentes, imagens padrão target.svg corrigidas, reutilização por família, origem após renomear, IDs/regras preservados, migração automática, GM ativo, compêndios e recuperação de falhas.');
