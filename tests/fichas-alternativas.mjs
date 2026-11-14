import assert from 'node:assert/strict';
class Sheet {constructor(actor){this.actor=actor;this.document=actor;this.isEditable=actor.isOwner;}async _prepareContext(){return {};}}
globalThis.foundry={applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:B=>B},sheets:{ActorSheetV2:Sheet,ItemSheetV2:Sheet},handlebars:{renderTemplate:async(p,d)=>`<p data-ext="${d.extId}">${d.actor.name}</p>`}}};
let scenario='base',calls=[];
globalThis.game={user:{isGM:true},sangueEscuro:{api:{
 paginasVisiveis:()=>scenario==='base'?[]:[{id:scenario,nome:scenario,template:'cenario.hbs'}],
 regra:(k,d)=>k==='infeccaoZumbi'?scenario==='base':k==='acoesPorTurno'?3:k==='reacoesPorRodada'?1:d,
 condicaoVisivel:()=>true,paineisPara:()=>[{id:'drs-turno',template:'turno.hbs'}],
 executarAcao:(...x)=>calls.push(x)
}}};
const {ATRIBUTOS,PERICIAS}=await import('../module/config.mjs');
const {CharacterSheet,AlternativeCharacterSheet}=await import('../module/sheets.mjs');
const s={atributos:Object.fromEntries(Object.keys(ATRIBUTOS).map(k=>[k,{valor:10,mod:0}])),
 pericias:Object.fromEntries(Object.entries(PERICIAS).map(([k,p])=>[k,{attr:p.attr,grau:0,grauNome:'Sem treino',bonus:0}])),
 pv:{value:10,max:10},ps:{value:10,max:10},estresse:{value:0,max:6},fome:{value:5,max:5},exposicao:{value:0,max:3},exaustao:{value:0,max:6},sorte:{value:1,max:3},
 turno:{acoes:3,reacao:1,bonus:1},condicoes:{},ferimentos:[],pe:{disponivel:20},carga:{usado:0,max:4},morte:{sucessos:0,fracassos:0},biografia:{perfil:'Técnico'}};
const actor={name:'Lia',img:'icons/svg/mystery-man.svg',id:'lia',uuid:'Actor.lia',isOwner:true,system:s,items:[],totalPericia:()=>0,
 update(){throw Error('Aparência não deve gravar dados');},rolarAtributo:(...a)=>calls.push(['atributo',...a])};
const before=structuredClone(s);
for(scenario of ['base','resident-evil-4','fear-and-hunger','dead-space','projeto-x64','the-last-of-us','metro']){
 for(const aba of ['ficha','combate','inventario','habilidades','condicoes','historia',scenario]){
  const classic=new CharacterSheet(actor),alt=new AlternativeCharacterSheet(actor);classic.abaAtual=alt.abaAtual=aba;
  const c=await classic._prepareContext({}),a=await alt._prepareContext({});
  assert.equal(a.alternativa,true);assert.equal(c.alternativa,undefined);assert.deepEqual(a.paginas,c.paginas);
  for(const k of ['actor','system','editable','colunas','turno','resumo','armas','protecoes','equipamentos','habilidades','condicoes','morte','paginaExtra','slot'])assert.deepEqual(a[k],c[k],k+' / '+scenario);
  for(const k of ['recursos','secundarios'])assert.deepEqual(a[k].map(({reserva,limiteRotulo,critico,aviso,...r})=>r),c[k]);
  assert.deepEqual(a.roda.map(({x,y,...r})=>r),c.roda.map(({x,y,...r})=>r));
  assert.deepEqual(s,before,'Alternar aparência não altera dados do personagem');
 }
}
assert.equal(AlternativeCharacterSheet.PARTS,CharacterSheet.PARTS);
assert.equal(AlternativeCharacterSheet.rolarAtributo,CharacterSheet.rolarAtributo);
assert.equal(AlternativeCharacterSheet.extensao,CharacterSheet.extensao);
AlternativeCharacterSheet.rolarAtributo.call(new AlternativeCharacterSheet(actor),{shiftKey:true},{dataset:{chave:'agi'}});
assert.deepEqual(calls.pop(),['atributo','agi',{shiftKey:true}]);
// Estado crítico representa as direções corretas dos recursos, especialmente Fome.
s.fome.value=0;s.estresse.value=6;let c=await new AlternativeCharacterSheet(actor)._prepareContext({});assert.equal(c.secundarios.find(x=>x.campo==='fome').critico,true);assert.equal(c.recursos.find(x=>x.campo==='estresse').limiteRotulo,'Limite');assert.equal(c.recursos.find(x=>x.campo==='pv').limiteRotulo,'Máx.');
s.fome.value=5;c=await new AlternativeCharacterSheet(actor)._prepareContext({});assert.equal(c.secundarios.find(x=>x.campo==='fome').critico,false);
console.log('Clássica/Alternativa: 49 pares de contextos em sete cenários preservam dados, campos, turnos, extensões e ações. Direções dos recursos conferidas. Foundry simulado.');
