/** Organização de compêndios do mundo, sem recriar coleções ou documentos. */
const ID='sangue-escuro';
const PASTAS={
 base:{nome:'Sistema base',cor:'#9ba3b0',ordem:100000},
 re4:{nome:'Resident Evil 4',cor:'#78865e',ordem:200000},
 fh:{nome:'Fear & Hunger',cor:'#965d68',ordem:300000},
 ds:{nome:'Dead Space',cor:'#628b9b',ordem:400000}
};
const FIXOS={
 'sangue-escuro-regras':['base','Regras (DRS)','regras'],
 'sangue-escuro-habilidades':['base','Habilidades','habilidades'],
 'sangue-escuro-equipamentos':['base','Armas e equipamentos','itens'],
 'resident-evil-4-regras':['re4','Guia da expansão','regras'],
 'resident-evil-4-itens':['re4','Itens e classes','itens'],
 'resident-evil-4-atores':['re4','Criaturas','criaturas'],
 're4-armas-itens':['re4','Arsenal','armas'],
 're4-armas-regras':['re4','Guia do arsenal','regras'],
 're4-armas-bonus-itens':['re4','Armas bônus','bonus'],
 're4-pedidos-alice-itens':['re4','Pedidos de Alice','pedidos'],
 'fh-regras':['fh','Guia da expansão','regras'],
 'fh-itens':['fh','Itens e poderes','itens'],
 'fh-atores':['fh','Criaturas','criaturas'],
 'fh-adulto-regras':['fh','Conteúdo adicional (18+)','restrito'],
 'dead-space-regras':['ds','Guia da expansão','regras'],
 'dead-space-itens':['ds','Armas e equipamentos','armas'],
 'dead-space-atores':['ds','Criaturas','criaturas'],
 'dead-space-mestre-regras':['ds','Guia do Mestre','restrito']
};
const lista=c=>c?.contents??Array.from(c?.values?.()??[]);
const config=k=>game.settings.get(ID,k);
const habilitado=()=>config('organizarCompendios')!==false;
const principal=()=>game.user.isGM&&(!game.users.activeGM||game.users.activeGM.isSelf);
let fila=Promise.resolve();
const serial=f=>{const p=fila.catch(()=>{}).then(f);fila=p;return p;};
export function apresentacaoCompendio(entry){
 const fixo=FIXOS[entry.def.name];let d;
 if(fixo){const [pasta,nome,tipo]=fixo;d={pasta,nome,tipo,...PASTAS[pasta]};d.pastaNome=PASTAS[pasta].nome;d.nome=nome;}
 else {
  const ext=entry.ext;if(!ext)return null;
  const custom=ext.organizacao??{};
  const cenario=game.sangueEscuro?.api?.cenarios?.find(c=>c.id===ext.cenario||c.modulo&&[ext.regras,ext.itens,ext.atores].some(p=>p?.startsWith(`modules/${c.modulo}/`)));
  const pastaNome=String(custom.pasta??cenario?.nome??ext.rotulo).replace(/\s*\(Expansão\)\s*/gi,'').trim();
  const nome=custom.nomes?.[entry.tipo]??{regras:'Guia da expansão',itens:'Itens e poderes',atores:'Criaturas'}[entry.tipo]??'Conteúdo';
  d={pasta:custom.id??cenario?.id??ext.id,pastaNome,nome,tipo:entry.tipo==='atores'?'criaturas':entry.tipo,cor:custom.cor??'#80868f',ordem:500000};
 }
 return {...d,original:entry.def.label};
}
export function organizarEntrada(entry){
 const organizacao=apresentacaoCompendio(entry);
 return !organizacao?entry:{...entry,organizacao,def:{...entry.def,label:habilitado()?organizacao.nome:entry.def.label}};
}
function conhecidos(){
 const mapa=new Map(Object.entries(FIXOS).map(([name,[pasta,nome,tipo]])=>[`world.${name}`,{pasta,pastaNome:PASTAS[pasta].nome,nome,tipo,cor:PASTAS[pasta].cor,ordem:PASTAS[pasta].ordem}]));
 for(const [key,d] of Object.entries(config('mapaCompendios')??{}))mapa.set(key,d);
 // Usa o registro completo, inclusive conteúdo de cenário inativo que permaneça habilitado.
 for(const ext of game.sangueEscuro?.api?.conteudos??[])for(const tipo of ['regras','itens','atores'])if(ext[tipo]){
  const name=`${ext.id}-${tipo}`;const d=apresentacaoCompendio({ext,tipo,def:{name,label:`${ext.rotulo}: ${tipo}`}});if(d)mapa.set(`world.${name}`,{...(mapa.get(`world.${name}`)??{}),...d});
 }
 return mapa;
}
const pai=f=>typeof f.folder==='string'?f.folder:f.folder?.id??null;
async function obterPasta(chave,nome,parent,cor,ordem,sorting='a'){
 const pastas=lista(game.folders).filter(f=>f.type==='Compendium'&&pai(f)===(parent??null));
 let pasta=pastas.find(f=>f.flags?.[ID]?.biblioteca===chave)??pastas.find(f=>f.name===nome);
 if(!pasta)pasta=await Folder.create({name:nome,type:'Compendium',folder:parent??null,color:cor,sorting,sort:ordem,flags:{[ID]:{biblioteca:chave}}});
 return pasta;
}
async function aplicar(pack,d,{forcar=false}={}){
 if(!pack.collection?.startsWith('world.')||typeof pack.setFolder!=='function')throw Error('O Foundry não disponibilizou a organização nativa deste compêndio.');
 const anterior=(config('mapaCompendios')??{})[pack.collection];
 if(anterior?.organizado&&!forcar)return 0;
 const root=await obterPasta('raiz','Sangue Escuro',null,'#343b41',100000,'m');
 const child=await obterPasta(d.pasta,d.pastaNome,root.id,d.cor,d.ordem);
 if(pack.folder?.id!==child.id&&pack.folder!==child.id)await pack.setFolder(child.id);
 const estado={...(config('mapaCompendios')??{}),[pack.collection]:{...d,organizado:true,pastaId:child.id}};
 await game.settings.set(ID,'mapaCompendios',estado);
 return 1;
}
export function organizarPack(pack,entry,options={}){
 if(!habilitado()||!principal()||!entry.organizacao)return Promise.resolve(0);
 return serial(async()=>{try{return await aplicar(pack,entry.organizacao,options);}catch(err){console.error('Sangue Escuro | Pasta do compêndio',err);await game.settings.set(ID,'versaoPastasCompendios',0);ui.notifications.warn('O compêndio será importado, mas sua pasta não pôde ser criada. Tente Organizar compêndios nas configurações.');return 0;}});
}
export function organizarBiblioteca({forcar=false}={}){
 if(!habilitado()||!principal())return Promise.resolve(0);
 return serial(async()=>{
  if(!forcar&&config('versaoPastasCompendios')>=1)return 0;
  let n=0;try{
   for(const [key,d] of conhecidos()){const pack=game.packs.get(key);if(pack)n+=await aplicar(pack,d,{forcar});}
   await game.settings.set(ID,'versaoPastasCompendios',1);
   ui.compendium?.render(false);if(n)ui.notifications.info(`Sangue Escuro: ${n} compêndios organizados em pastas. Documentos e IDs preservados.`);
  }catch(err){console.error('Sangue Escuro | Organização de compêndios',err);ui.notifications.warn('Alguns compêndios não puderam ser organizados. Uma nova tentativa ocorrerá ao reabrir o mundo; consulte F12.');}
  return n;
 });
}
/** Os títulos antigos são abreviados somente na apresentação; seus identificadores ficam intactos. */
export function decorarDiretorio(app,html){
 const root=html?.querySelectorAll?html:html?.[0];if(!root)return;
 const mapa=conhecidos(),compacto=config('compendiosCompactos')!==false;
 for(const node of root.querySelectorAll('[data-pack], [data-entry-id], [data-collection]')){
  const key=node.dataset.pack??node.dataset.entryId??node.dataset.collection;
  const d=mapa.get(key),pack=game.packs.get(key);if(!d||!pack)continue;
  const el=node.closest?.('.directory-item')??node;
  el.classList.toggle('se-compendio-compacto',compacto);
  el.dataset.seCompendioTipo=d.tipo;el.title=`${d.pastaNome} · ${d.nome}`;
  if(!habilitado())continue;
  const antigo=pack.metadata?.label;if(!antigo||antigo===d.nome)continue;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let textNode;
  while(textNode=walker.nextNode())if(textNode.parentElement?.tagName!=='SCRIPT'&&textNode.parentElement?.tagName!=='STYLE'&&textNode.textContent.includes(antigo))textNode.textContent=textNode.textContent.replaceAll(antigo,d.nome);
 }
}
export class OrganizarCompendiosMenu extends foundry.applications.api.ApplicationV2{
 async render(){if(!habilitado()){ui.notifications.info('Ative Organização automática dos compêndios nas configurações do Sangue Escuro.');return this;}await organizarBiblioteca({forcar:true});return this;}
}
export function registrarOrganizacaoCompendios(){
 game.settings.register(ID,'organizarCompendios',{name:'Organização automática dos compêndios',hint:'Agrupa compêndios do sistema e expansões em Sangue Escuro. Desativar mantém as pastas existentes. Reorganizar não recria documentos.',scope:'world',config:true,type:Boolean,default:true,onChange:()=>ui.compendium?.render(false)});
 game.settings.register(ID,'compendiosCompactos',{name:'Compêndios com aparência compacta',hint:'Reduz os cartões da biblioteca Sangue Escuro e simplifica os fundos para facilitar a leitura.',scope:'world',config:true,type:Boolean,default:true,onChange:()=>ui.compendium?.render(false)});
 game.settings.register(ID,'mapaCompendios',{scope:'world',config:false,type:Object,default:{}});
 game.settings.register(ID,'versaoPastasCompendios',{scope:'world',config:false,type:Number,default:0});
 game.settings.registerMenu(ID,'organizarCompendios',{name:'Biblioteca de compêndios',label:'Organizar compêndios',hint:'Cria pastas e reorganiza os compêndios já existentes do Sangue Escuro e suas expansões.',icon:'fa-solid fa-folder-tree',type:OrganizarCompendiosMenu,restricted:true});
 Hooks.on('renderCompendiumDirectory',decorarDiretorio);
 Hooks.on('renderCompendiumDirectoryHTML',decorarDiretorio);
}
