import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let enrichArgs,acao;
class Sheet {constructor(doc,editable=true){this.document=doc;this.actor=doc;this.isEditable=editable;}async _prepareContext(){return {};}}
globalThis.foundry={applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:Base=>Base},sheets:{ActorSheetV2:Sheet,ItemSheetV2:Sheet},handlebars:{renderTemplate:async()=>''},ux:{TextEditor:{implementation:{enrichHTML:async(text,options)=>{enrichArgs={text,options};return `<article>${text}</article>`;}}}}}};
globalThis.game={sangueEscuro:{api:{condicaoVisivel:()=>true,paineisPara:()=>[],paineisItemPara:()=>[],executarAcao:(...args)=>{acao=args;return 'executada';}}}};
globalThis.ui={notifications:{warn(){},error(){}}};
const {CriaturaSheet,CharacterSheet,SEItemSheet}=await import('../module/sheets.mjs');
const texto='<p>Descrição.</p><table><tr><td>Parte</td><td>Limite</td></tr></table>';
const ator={isOwner:true,uuid:'Actor.teste',system:{notas:texto,condicoes:{},pv:{value:10,max:20}}};
const ficha=new CriaturaSheet(ator);let ctx=await ficha._prepareContext({});
assert.equal(enrichArgs.text,texto);assert.equal(enrichArgs.options.relativeTo,ator);assert.equal(enrichArgs.options.secrets,true);assert.ok(ctx.notasHTML.includes('<table>'));assert.equal(ator.system.notas,texto);
ator.isOwner=false;await new CriaturaSheet(ator,false)._prepareContext({});assert.equal(enrichArgs.options.secrets,false);ator.isOwner=true;
console.log('OK 1: notas enriquecidas sem alterar dados; conteúdo secreto respeita o acesso do leitor.');
for(const tipo of ['arma','protecao','habilidade','equipamento']){const item={type:tipo,isOwner:true,uuid:'Item.teste',system:{descricao:texto}};const itemSheet=new SEItemSheet(item);itemSheet.item=item;itemSheet.actor=undefined;ctx=await itemSheet._prepareContext({});assert.ok(ctx.descricaoHTML.includes('<table>'));assert.equal(item.system.descricao,texto);assert.equal(enrichArgs.options.relativeTo,item);}
console.log('OK 2: descrições formatadas nos quatro tipos de item, sem modificar o conteúdo salvo.');
assert.equal(CriaturaSheet.DEFAULT_OPTIONS.actions.extensao,CharacterSheet.extensao);const alvo={dataset:{ext:'re4-combate-criatura',acao:'manual'}};assert.equal(CriaturaSheet.DEFAULT_OPTIONS.actions.extensao.call(ficha,{},alvo),'executada');assert.equal(acao[2].ator,ator);
console.log('OK 3: botões de extensão da criatura continuam encaminhando o ator correto.');
let editor,config,atualizacoes=0;
const frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
const host={dataset:{campo:'notas'},querySelector:s=>s==='prose-mirror'?editor:{replaceChildren:e=>{editor=e;}}};
const target={closest:()=>host};
foundry.applications.elements={HTMLProseMirrorElement:{create:c=>{
  assert.equal(host.dataset.editando,'true','O host precisa estar visível antes de criar o editor.');
  config=c;const input={textContent:c.value.replace(/<[^>]*>/g,''),getBoundingClientRect:()=>({height:240}),focus(){}};
  return {value:c.value,addEventListener(){},querySelector:()=>input};
}}};
ator.update=async data=>{atualizacoes++;ator.system.notas=data['system.notas'];};ficha.render=()=>{};
const actions=CriaturaSheet.DEFAULT_OPTIONS.actions;
actions.editarTexto.call(ficha,{},target);assert.equal(host.dataset.editando,'true');assert.equal(config.toggled,false);assert.equal(config.name,undefined);assert.equal(config.enriched,texto);assert.equal(host.dataset.editorPronto,undefined);for(const f of frames.splice(0))f();assert.equal(host.dataset.editorPronto,'true');editor.value='<p>Alterado</p>';await actions.salvarTexto.call(ficha,{},target);assert.equal(ator.system.notas,'<p>Alterado</p>');assert.equal(atualizacoes,1);
delete host.dataset.editando;actions.editarTexto.call(ficha,{},target);for(const f of frames.splice(0))f();editor.value='<p>Descartar</p>';actions.cancelarTexto.call(ficha,{},target);assert.equal(ator.system.notas,'<p>Alterado</p>');assert.equal(atualizacoes,1);assert.equal(host.dataset.editando,undefined);
for(const [path,campo]of [['actor/criatura.hbs','notas'],['item/item.hbs','descricao']]){const t=await readFile(new URL('../templates/'+path,import.meta.url),'utf8');assert.ok(!t.includes(`<textarea name="system.${campo}"`));assert.ok(t.includes('se-texto-leitura'));}
assert.ok(CriaturaSheet.PARTS.corpo.scrollable.includes('.se-criatura'));assert.ok(SEItemSheet.PARTS.corpo.scrollable.includes('.se-simples'));
console.log('OK 4: editor abre visível com o conteúdo existente, aguarda área pronta, salva no campo correto e cancela sem gravar.');

foundry.applications.elements.HTMLProseMirrorElement.create=()=>({value:'',addEventListener(){},querySelector:()=>null});
actions.editarTexto.call(ficha,{},target);for(const f of frames.splice(0))f();
assert.equal(host.dataset.editorPronto,undefined);
await actions.salvarTexto.call(ficha,{},target);assert.equal(atualizacoes,1);
actions.cancelarTexto.call(ficha,{},target);
console.log('OK 5: falha de inicialização impede substituir o texto salvo por um editor vazio.');
