import assert from 'node:assert/strict';
globalThis.foundry={applications:{api:{ApplicationV2:class{}}}};
const valores=new Map(),registrados=new Map(),hooks=new Map(),movidos=[];let serial=0;
globalThis.Hooks={on:(n,f)=>hooks.set(n,f)};
globalThis.ui={notifications:{info(){},warn(){}},compendium:{render(){}}};
globalThis.game={user:{isGM:true},users:{activeGM:{isSelf:true}},folders:new Map(),packs:new Map(),settings:{get:(m,k)=>valores.get(k),set:async(m,k,v)=>valores.set(k,structuredClone(v)),register:(m,k,d)=>{registrados.set(k,d);valores.set(k,structuredClone(d.default));},registerMenu:(m,k,d)=>registrados.set('menu-'+k,d)},sangueEscuro:{api:{cenarios:[{id:'nova',nome:'Nova Expansão',modulo:'nova-expansao'}],conteudos:[]}}};
globalThis.Folder={create:async d=>{assert.equal(d.type,'Compendium');const f={...structuredClone(d),id:'f'+(++serial)};game.folders.set(f.id,f);return f;}};
function pack(name){const p={collection:'world.'+name,metadata:{name,label:'Nome original '+name},locked:true,ownership:{PLAYER:1},folder:null,getDocuments:()=>assert.fail('Não carregar ou editar documentos para organizar pastas'),deleteCompendium:()=>assert.fail('Não apagar compêndios'),setFolder:async id=>{movidos.push(p.collection);p.folder=id;}};game.packs.set(p.collection,p);return p;}
const c=await import('../module/compendios.mjs');c.registrarOrganizacaoCompendios();assert.equal(registrados.get('menu-organizarCompendios').restricted,true);
const nomes=['sangue-escuro-regras','sangue-escuro-equipamentos','sangue-escuro-habilidades','resident-evil-4-regras','resident-evil-4-itens','resident-evil-4-atores','re4-armas-itens','re4-armas-regras','re4-armas-bonus-itens','re4-pedidos-alice-itens','fh-regras','fh-itens','fh-atores','dead-space-regras','dead-space-itens','dead-space-atores','dead-space-mestre-regras'];
for(const n of nomes)pack(n);const outro=pack('meu-conteudo'),deModulo=pack('sangue-escuro-regras-duplicado');deModulo.collection='outro-modulo.regras';game.packs.delete('world.sangue-escuro-regras-duplicado');game.packs.set(deModulo.collection,deModulo);
const refs=[...game.packs.values()];const metas=refs.map(p=>structuredClone({metadata:p.metadata,locked:p.locked,ownership:p.ownership}));
assert.equal(await c.organizarBiblioteca(),17);assert.equal(game.folders.size,5);const raiz=[...game.folders.values()].find(f=>f.flags['sangue-escuro'].biblioteca==='raiz');assert.equal(raiz.name,'Sangue Escuro');assert.equal(raiz.sorting,'m');
assert.equal([...game.folders.values()].filter(f=>f.folder===raiz.id).length,4);assert.equal(outro.folder,null);assert.equal(deModulo.folder,null);
assert.equal(await c.organizarBiblioteca(),0);assert.equal(game.folders.size,5);
refs.forEach((p,i)=>assert.deepEqual({metadata:p.metadata,locked:p.locked,ownership:p.ownership},metas[i]));
const arma=game.packs.get('world.re4-armas-itens'),antes=arma.folder;arma.folder='pasta-personalizada';assert.equal(await c.organizarBiblioteca(),0);assert.equal(arma.folder,'pasta-personalizada');await c.organizarBiblioteca({forcar:true});assert.equal(arma.folder,antes);assert.equal(game.folders.size,5);
const entry={id:'nova-itens',tipo:'itens',ext:{id:'nova',cenario:'nova',rotulo:'Nova Expansão',itens:'modules/nova-expansao/data/itens.json'},def:{name:'nova-itens',label:'Nova Expansão: Itens',type:'Item'}};
const novo=c.organizarEntrada(entry);assert.equal(novo.def.name,entry.def.name);assert.equal(novo.def.label,'Itens e poderes');assert.equal(novo.organizacao.pastaNome,'Nova Expansão');
const future=pack('nova-itens');await c.organizarPack(future,novo,{forcar:true});assert.equal(game.folders.size,6);assert.ok(valores.get('mapaCompendios')[future.collection].organizado);
// Desativar o módulo no futuro mantém a informação de organização no mundo.
game.sangueEscuro.api.cenarios=[];game.sangueEscuro.api.conteudos=[];await c.organizarBiblioteca({forcar:true});assert.equal(game.folders.size,6);
const custom=c.organizarEntrada({...entry,ext:{...entry.ext,organizacao:{id:'personalizada',pasta:'Minha expansão',nomes:{itens:'Relíquias'},cor:'#123456'}}});assert.equal(custom.def.label,'Relíquias');assert.equal(custom.organizacao.pastaNome,'Minha expansão');
valores.set('organizarCompendios',false);const f2=pack('nova-extra-itens');assert.equal(await c.organizarPack(f2,novo,{forcar:true}),0);assert.equal(f2.folder,null);assert.equal(c.organizarEntrada(entry).def.label,entry.def.label);valores.set('organizarCompendios',true);
game.user.isGM=false;assert.equal(await c.organizarBiblioteca({forcar:true}),0);game.user.isGM=true;game.users.activeGM.isSelf=false;assert.equal(await c.organizarBiblioteca({forcar:true}),0);game.users.activeGM.isSelf=true;
// Falha de apresentação não interrompe a criação/importação do compêndio.
const erro=pack('teste-itens');erro.setFolder=async()=>{throw Error('Falha simulada');};const original=console.error;console.error=()=>{};try{assert.equal(await c.organizarPack(erro,novo,{forcar:true}),0);}finally{console.error=original;}assert.equal(valores.get('versaoPastasCompendios'),0);
console.log('OK: pastas nativas para base/RE4/FH/Dead Space, IDs e metadados preservados, sem ler/apagar documentos, repetição sem duplicatas, organização manual, futuras expansões, configurações, permissões e recuperação de falha.');

// Executa os ganchos de renderização com uma entrada realista, não apenas a organização.
const pRender=game.packs.get('world.sangue-escuro-regras');
const titulo={textContent:pRender.metadata.label,parentElement:{tagName:'SPAN'}};
const script={textContent:pRender.metadata.label,parentElement:{tagName:'SCRIPT'}};
const style={textContent:pRender.metadata.label,parentElement:{tagName:'STYLE'}};
const classes=new Set();const linha={dataset:{pack:pRender.collection},classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},closest(){return this;}};
const raizDOM={querySelectorAll(){return [linha];}};
globalThis.NodeFilter={SHOW_TEXT:4};
globalThis.document={createTreeWalker(el,tipo){assert.equal(el,linha);assert.equal(tipo,4);let i=0;return {nextNode:()=>[titulo,script,style][i++]??null};}};
const labelOriginal=pRender.metadata.label;
hooks.get('renderCompendiumDirectory')({},raizDOM);
assert.equal(titulo.textContent,'Regras (DRS)');assert.equal(script.textContent,labelOriginal);assert.equal(style.textContent,labelOriginal);
assert.equal(linha.dataset.seCompendioTipo,'regras');assert.ok(classes.has('se-compendio-compacto'));assert.equal(pRender.metadata.label,labelOriginal);
titulo.textContent=labelOriginal;hooks.get('renderCompendiumDirectoryHTML')({},[raizDOM]);assert.equal(titulo.textContent,'Regras (DRS)');
valores.set('organizarCompendios',false);titulo.textContent=labelOriginal;c.decorarDiretorio({},raizDOM);assert.equal(titulo.textContent,labelOriginal);
console.log('OK: decoração dos dois ganchos de diretório, HTML nativo/jQuery, texto abreviado, scripts/estilos e metadados preservados.');
