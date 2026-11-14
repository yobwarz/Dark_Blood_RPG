import { organizarEntrada, organizarPack } from "./compendios.mjs";
import { imagemAutomatica } from "./icones.mjs";
/** Importação selecionável, validada antes da gravação e sem duplicação em execuções repetidas. */
const SISTEMA = 'sangue-escuro';
const PACKS = {
  regras: { name: 'sangue-escuro-regras', label: 'Sangue Escuro: Regras (DRS)', type: 'JournalEntry' },
  habilidades: { name: 'sangue-escuro-habilidades', label: 'Sangue Escuro: Habilidades Passivas', type: 'Item' },
  equipamentos: { name: 'sangue-escuro-equipamentos', label: 'Sangue Escuro: Armas, Proteções e Equipamentos', type: 'Item' }
};
const escapar = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normal = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
let importando = false;
export function normalizarTipoDano(nome, opcoes = CONFIG.SE.TIPOS_DANO) {
  const alias = { contusivo: 'contundente', igneo: 'fogo' };
  const chave = alias[normal(nome)] ?? normal(nome);
  const tipo = opcoes.find(v => normal(v) === chave);
  if (!tipo) throw Error(`Tipo de dano não reconhecido: “${nome}”. Opções: ${opcoes.join(', ')}.`);
  return tipo;
}
export function catalogoCompendios() {
  const base = Object.entries(PACKS).map(([tipo, def])=>({id:def.name, grupo:'Sistema base (DRS)', tipo, def}));
  const api = game.sangueEscuro.api;
  const conteudos = api.conteudosDisponiveis ? api.conteudosDisponiveis() : api.conteudos.filter(c => !c.condicao || c.condicao());
  return [...base, ...conteudos.flatMap(ext => ['regras','itens','atores'].filter(tipo => ext[tipo]).map(tipo => ({
    id:`${ext.id}-${tipo}`, grupo:ext.rotulo, tipo, ext,
    def:{ name:`${ext.id}-${tipo}`, label:`${ext.rotulo}: ${tipo==='regras'?'Regras':tipo==='atores'?'Criaturas':'Itens'}`, type:tipo==='regras'?'JournalEntry':tipo==='atores'?'Actor':'Item' }
  })))].map(organizarEntrada);
}
async function lerJson(path) { const r=await fetch(foundry.utils.getRoute(path)); if(!r.ok)throw Error(`Não foi possível ler ${path}`);return r.json(); }
function regrasDocumento(nome, capitulos) {
  if(!Array.isArray(capitulos))throw Error('O arquivo de regras precisa ser uma lista de capítulos.');
  return [{name:nome,pages:capitulos.map((c,i)=>({name:c.nome,type:'text',sort:(i+1)*100000,text:{format:CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,content:c.html}}))}];
}
async function carregar(entry, cache) {
  if(entry.ext) { const data=await lerJson(entry.ext[entry.tipo]);return entry.tipo==='regras'?regrasDocumento(entry.ext.rotulo,data):data; }
  if(entry.tipo==='regras')return regrasDocumento('DRS consolidado 1.2 — 13-11-2026',await lerJson(`systems/${SISTEMA}/data/regras.json`));
  const data=await (cache.itens??=lerJson(`systems/${SISTEMA}/data/itens.json`));
  return entry.tipo==='habilidades'?data.habilidades:[...data.armas,...data.protecoes,...data.equipamentos];
}
const classeDe = tipo => tipo==='Actor'?Actor:tipo==='Item'?Item:JournalEntry;
export function prepararDados(lista, entry) {
  if(!Array.isArray(lista))throw Error(`${entry.def.label}: o JSON precisa ser uma lista.`);
  const ocorrencias=new Map();
  return lista.map((source,i)=>{
    const doc=foundry.utils.deepClone(source);
    if(entry.def.type==='Item') {const img=imagemAutomatica(doc);if(img)doc.img=img;}
    if(entry.def.type==='Actor') for(const item of doc.items??[]) {const img=imagemAutomatica(item);if(img)item.img=img;}
    if(!doc.name||typeof doc.name!=='string')throw Error(`${entry.def.label}: registro ${i+1} sem nome.`);
    if(doc.system?.tipoDano!==undefined)doc.system.tipoDano=normalizarTipoDano(doc.system.tipoDano);
    const identidade=source._id?`id:${source._id}`:`${doc.type??''}:${doc.name}`;
    const n=(ocorrencias.get(identidade)??0)+1;ocorrencias.set(identidade,n);
    const origem=`${entry.id}:${identidade}:${n}`;
    delete doc._id;
    doc.flags??={};doc.flags[SISTEMA]={...(doc.flags[SISTEMA]??{}),origemCompendio:origem};
    doc.sort=(i+1)*100000;
    return doc;
  });
}
function validarDocumentos(docs,entry) {
  const Classe=classeDe(entry.def.type).implementation??classeDe(entry.def.type);
  for(const {pasta,...doc} of docs) {
    try { const instancia=new Classe(doc);if(instancia.validate?.({strict:true})===false)throw Error('Documento inválido.'); }
    catch(e){throw Error(`${entry.def.label} → ${doc.name}: ${e.message}`,{cause:e});}
  }
}
const origemDe = d => d.flags?.[SISTEMA]?.origemCompendio ?? d.getFlag?.(SISTEMA,'origemCompendio');
export function somenteAusentes(docs,existentes) {
  const origens=new Set(existentes.map(origemDe).filter(Boolean));
  // Correspondência com pacotes antigos sem rastreamento. Preserva nomes, tipos e multiplicidade do arquivo fonte.
  const legados=new Map();
  for(const d of existentes)if(!origemDe(d)){const k=`${d.type??''}:${d.name}`;legados.set(k,(legados.get(k)??0)+1);}
  return docs.filter(d=>{
    if(origens.has(origemDe(d)))return false;
    const k=`${d.type??''}:${d.name}`,n=legados.get(k)??0;
    if(n){legados.set(k,n-1);return false;}
    origens.add(origemDe(d));return true;
  });
}
async function prepararPack(entry,recriar) {
  const def=entry.def;
  const CC=foundry.documents?.collections?.CompendiumCollection??CompendiumCollection;
  let pack=game.packs.get(`world.${def.name}`);
  if(pack&&recriar){await pack.deleteCompendium();pack=null;}
  const novo=!pack;
  if(!pack)pack=await CC.createCompendium({name:def.name,label:def.label,type:def.type,package:'world'});
  await organizarPack(pack,entry,{forcar:novo});
  return pack;
}
async function gravar(entry,docs,recriar) {
  const pack=await prepararPack(entry,recriar);
  const anteriores=await pack.getDocuments();
  const novos=somenteAusentes(docs,anteriores);
  if(!novos.length)return {adicionados:0,preservados:docs.length};
  const bloqueado=pack.locked===true;
  if(bloqueado)await pack.configure({locked:false});
  try {
    const pastas=Object.fromEntries(Array.from(pack.folders??[]).map(f=>[f.name,f.id]));
    const nomes=[...new Set(novos.map(d=>d.pasta).filter(Boolean))].filter(n=>!pastas[n]);
    if(nomes.length){const fs=await Folder.createDocuments(nomes.map((name,i)=>({name,type:entry.def.type,sort:(i+1)*100000})),{pack:pack.collection});for(const f of fs)pastas[f.name]=f.id;}
    const payload=novos.map(({pasta,...doc})=>({...doc,folder:pastas[pasta]??null}));
    await classeDe(entry.def.type).createDocuments(payload,{pack:pack.collection});
    return {adicionados:payload.length,preservados:docs.length-payload.length};
  } finally {if(bloqueado)await pack.configure({locked:true});}
}
export async function escolherCompendios(catalogo) {
  const grupos=[...new Set(catalogo.map(c=>c.grupo))];
  const html=`<p>Escolha somente os compêndios que deseja importar. Os não selecionados permanecem intactos.</p>${grupos.map(g=>`<fieldset><legend>${escapar(g)}</legend>${catalogo.filter(c=>c.grupo===g).map(c=>`<label style="display:block;margin:6px 0"><input type="checkbox" name="pack" value="${escapar(c.id)}"> ${escapar(c.def.label)}</label>`).join('')}</fieldset>`).join('')}<label>Quando o compêndio já existir:<select name="modo"><option value="completar">Adicionar só o que falta — preservar existentes</option><option value="recriar">Recriar os selecionados — apagar edições</option></select></label>`;
  return foundry.applications.api.DialogV2.prompt({window:{title:'Escolher compêndios do Sangue Escuro'},content:html,rejectClose:false,ok:{label:'Importar selecionados',callback:(ev,b)=>({selecionados:Array.from(b.form.querySelectorAll('input[name="pack"]:checked')).map(i=>i.value),recriar:b.form.elements.modo.value==='recriar'})}});
}
/** Chamadas antigas continuam válidas, mas agora abrem a seleção quando não recebem IDs explícitos. */
export async function importarConteudo({recriar=false,selecionados=null}={}) {
  if(!game.user.isGM){ui.notifications.warn('Apenas o Mestre pode importar os compêndios.');return false;}
  if(game.users.activeGM&&!game.users.activeGM.isSelf){ui.notifications.warn('Peça ao Mestre ativo para realizar a importação.');return false;}
  if(importando){ui.notifications.warn('Já há uma importação em andamento neste cliente.');return false;}
  importando=true;
  try {
    const catalogo=catalogoCompendios();
    if(selecionados===null){const escolha=await escolherCompendios(catalogo);if(!escolha)return false;({selecionados,recriar}=escolha);}
    if(!Array.isArray(selecionados)||!selecionados.length){ui.notifications.warn('Selecione ao menos um compêndio.');return false;}
    const ids=[...new Set(selecionados)];const entries=ids.map(id=>catalogo.find(c=>c.id===id));
    if(entries.some(e=>!e))throw Error('A seleção contém um compêndio indisponível para o cenário atual. Reabra o seletor.');
    // Todos os arquivos e modelos selecionados são conferidos antes de apagar ou criar qualquer pacote.
    const cache={}, preparados=[];
    for(const entry of entries){const docs=prepararDados(await carregar(entry,cache),entry);validarDocumentos(docs,entry);preparados.push({entry,docs});}
    const existentes=entries.filter(e=>game.packs.get(`world.${e.def.name}`));
    if(recriar&&existentes.length){const ok=await foundry.applications.api.DialogV2.confirm({window:{title:'Recriar somente os compêndios selecionados?'},content:`<p>Serão substituídos: <strong>${existentes.map(e=>escapar(e.def.label)).join('; ')}</strong>.</p><p>As edições nesses compêndios serão perdidas. Atores e itens já copiados para o mundo não serão alterados.</p>`});if(!ok)return false;}
    let adicionados=0,preservados=0;const falhas=[];
    for(const {entry,docs} of preparados){try{const r=await gravar(entry,docs,recriar);adicionados+=r.adicionados;preservados+=r.preservados;}catch(e){falhas.push(entry.def.label);console.error(`Sangue Escuro | ${entry.def.label}`,e);}}
    if(falhas.length){ui.notifications.error(`Importação incompleta. Falharam: ${falhas.join('; ')}. Consulte F12. ${adicionados} documentos adicionados; ${preservados} preservados.`);return false;}
    await game.settings.set(SISTEMA,'importado',true);
    ui.notifications.info(`Sangue Escuro: importação concluída. ${adicionados} documentos adicionados; ${preservados} preservados. Somente os compêndios selecionados foram processados.`);
    return true;
  } catch(e){console.error('Sangue Escuro | Falha na importação',e);ui.notifications.error(`Importação não concluída: ${e.message}. Consulte F12.`);return false;}
  finally {importando=false;}
}
export class ImportarMenu extends foundry.applications.api.ApplicationV2 {async render(){await importarConteudo();return this;}}
export async function oferecerImportacao() {
  if(!game.user.isGM||game.settings.get(SISTEMA,'importado'))return;
  const ok=await foundry.applications.api.DialogV2.confirm({window:{title:'Sangue Escuro — Compêndios'},content:'<p>Deseja escolher os compêndios para importar? Você poderá selecionar os pacotes do DRS ou do cenário ativo e preservar o que já existe.</p>',yes:{label:'Escolher compêndios'},no:{label:'Agora não'}});
  if(ok)await importarConteudo();else await game.settings.set(SISTEMA,'importado',true);
}
