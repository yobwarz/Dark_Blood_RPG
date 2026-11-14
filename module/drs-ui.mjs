import {descontaminarDRS,resolverIntoxicacao,esc,exigirMestre,progredirInfeccao,tratarCritico,resolverCritico,cartao} from './drs-runtime.mjs';
const ID='sangue-escuro';
const f=(a,k,d=null)=>a.getFlag(ID,k)??d;
async function form(title,content){return foundry.applications.api.DialogV2.prompt({window:{title},position:{width:560},content:`<div class="se-drs-form">${content}</div>`,rejectClose:false,ok:{label:'Confirmar',callback:(e,b)=>new foundry.applications.ux.FormDataExtended(b.form).object}});}
const select=(name,items)=>`<select name="${name}">${items.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
const confirmar=(title,content)=>foundry.applications.api.DialogV2.confirm({window:{title},content});
export async function acaoDRS({ator:a,alvo:b}){
 if(!a?.isOwner)throw Error('Sem controle sobre este personagem.');
 const op=b.dataset.drs;
 if(op==='correr')return a.correr();
 if(op==='desengajar'){if(await a.gastarAcoes(1))await a.setFlag(ID,'desengajou',true);return;}
 if(op==='bonus'){
  const ok=await confirmar('Ação Bônus','<p>Uma regra, habilidade ou equipamento permite esta Ação Bônus? Intoxicado troca uma Ação normal ainda disponível.</p>');
  if(ok)return a.usarAcaoBonus({permitido:true});return;
 }
 if(op==='reacao'){
  const d=await form('Ataque de Reação',`<label>Arma${select('item',a.items.filter(i=>i.type==='arma').map(i=>[i.id,i.name]))}</label><label>Reação${select('contexto',[['oportunidade','Oportunidade'],['preparado','Ataque preparado']])}</label><p>Marque o alvo. Confira alcance, percepção, arma pronta e gatilho. Movimento forçado e teleporte não provocam oportunidade; Desengajar impede oportunidades até o fim do turno. Um ataque consome somente a Reação.</p><label><input type="checkbox" name="requisitos">Confirmo os requisitos e o gatilho.</label>`);
  if(!d||!d.requisitos)return;const item=a.items.get(d.item);if(!item)throw Error('Arma indisponível.');
  const alvo=game.user.targets.first()?.actor;if(!alvo)throw Error('Marque o alvo antes de atacar.');
  if(d.contexto==='oportunidade'&&f(alvo,'desengajou',false))throw Error('O alvo está Desengajado neste turno.');
  return a.rolarAtaque(item,null,{contextoAcao:d.contexto});
 }
 if(op==='descontaminar')return descontaminarDRS(a);
 if(op==='intoxicacao')return resolverIntoxicacao(a);
 if(op==='finalizacao'||op==='execucao'){
  exigirMestre();const alvo=game.user.targets.first()?.actor;if(!alvo)throw Error('Marque o alvo.');
  const texto=op==='execucao'?'O alvo está inteiramente indefeso ou dominado, com acesso a uma região vital e arma adequada? Apenas estar Contido, Caído, Incapacitado ou com poucos PV não basta. Confira anatomia, regeneração e exceções do cenário. A execução válida provoca morte imediata.':'Confirme Contido por agarrão e os requisitos de enfraquecimento da manobra no DRS. A finalização válida reduz um ser vivo a 0 PV; não causa morte imediata por si só. Confira anatomia e regras do cenário.';
  if(!await confirmar('Confirmar '+(op==='execucao'?'Execução de Indefeso':'Finalização por Agarrão'),'<p>'+texto+'</p>'))return;
  if(!a.podeAgir()||game.combat?.started&&!(await a.gastarAcoes(1)))return;
  await alvo.update({'system.pv.value':0,...(op==='execucao'?{'flags.sangue-escuro.morto':true}:{})});
  if(op==='execucao')Hooks.callAll('sangueEscuro.morreu',alvo,{causa:'execucao'});
  return cartao(alvo,op==='execucao'?'Execução confirmada':'Finalização confirmada',op==='execucao'?'Morte imediata, conforme requisitos confirmados pelo Mestre.':'Reduzido a 0 PV. Aplique Resistência à Morte e as regras específicas da criatura.');
 }
 if(op==='infeccao')return progredirInfeccao(a);
 if(op==='critico')return resolverCritico(a);
 if(op==='iniciar'){
  exigirMestre();const d=await form('Atendimento contínuo',`<label>Responsável${select('medico',game.actors.filter(x=>x.type==='character'&&x.podeAgir()).map(x=>[x.uuid,x.name]))}</label><p>Este procedimento atende o primeiro Ferimento Crítico da lista. Confirme e contabilize os suprimentos médicos avançados e uma hora de atendimento contínuo. Os materiais não são descontados automaticamente por este controle.</p><label><input type="checkbox" name="recursos">Recursos disponíveis e contabilizados.</label>`);
  if(d?.recursos)return tratarCritico(a,'iniciar',await fromUuid(d.medico));return;
 }
 if(['concluir','interromper'].includes(op))return tratarCritico(a,op);
 if(op==='contencao'){
  const d=await form('Origem de Contido',`<label>Origem${select('origem',[['agarrao','Agarrão por criatura'],['objeto','Objeto ou armadilha'],['','Remover Contido']])}</label><p>Agarrão não recebe automaticamente as penalidades de cordas, redes ou armadilhas. Confira a fonte antes de aplicar.</p>`);if(!d)return;
  await a.update({'flags.sangue-escuro.origemContido':d.origem||null,'system.condicoes.contido':!!d.origem,'system.condicoes.agarrado':d.origem==='agarrao'});return;
 }
 if(op==='estabilizar'){
  exigirMestre();if(a.system.pv.value>0||f(a,'morto'))throw Error('O alvo não pode ser estabilizado neste estado.');
  const d=await form('Estabilizar sobrevivente',`<label>Socorrista${select('medico',game.actors.filter(x=>x.type==='character'&&x.podeAgir()).map(x=>[x.uuid,x.name]))}</label><p>Medicina CD 12, 1 Ação. O kit médico apropriado concede +2 e consome um uso.</p><label><input type="checkbox" name="kit">Kit médico disponível: uso já contabilizado (+2).</label>`);if(!d)return;
  const m=await fromUuid(d.medico);if(!m?.podeAgir())throw Error('Socorrista indisponível.');if(game.combat?.started&&!(await m.gastarAcoes(1)))return;
  const p=m.system.pericias.medicina,r=await m.rolarTeste({chave:p.attr,bonus:p.bonus+(d.kit?2:0),rotulo:'Estabilizar sobrevivente',cd:12});
  if(r.total>=12){await a.update({[`flags.${ID}.estavel`]:true,'system.morte.sucessos':0,'system.morte.fracassos':0});return cartao(a,'Estabilizado','Permanece inconsciente. A estabilização não interrompe a infecção nem trata Ferimentos Críticos.');}return;
 }
 if(op==='reanimar'){
  exigirMestre();if(!game.sangueEscuro.api.regra('infeccaoZumbi',true)||!f(a,'morto')||!f(a,'reanimacaoEm')||game.time.worldTime<f(a,'reanimacaoEm'))throw Error('Reanimação ainda não disponível.');
  if(await confirmar('Reanimação Necrophagus','<p>Confirme a reanimação e substitua o corpo por uma criatura apropriada. O personagem permanece morto; a ficha original será preservada.</p>')){await a.setFlag(ID,'reanimacaoResolvida',true);return cartao(a,'Reanimação','Reanimação confirmada pelo Mestre. Use a ficha de morto-vivo apropriada; o personagem original foi preservado.');}return;
 }
 if(op==='substituto'){
  exigirMestre();if(f(a,'peSubstitutoAplicado'))throw Error('Referência já aplicada a este personagem.');
  const referencia=game.settings.get(ID,'peReferencia');
  if(a.items.size||a.system.pe.disponivel!==20)throw Error('Aplique a referência em um personagem novo, antes de gastar PE ou inserir itens.');
  if(await confirmar('Personagem substituto',`<p>Aplicar ${referencia} PE totais a este personagem novo? Esse valor deve ter sido anunciado à mesa e não superar o maior total legítimo de PE dos jogadores. Não soma 20 PE adicionais.</p>`))await a.update({'system.pe.disponivel':referencia,[`flags.${ID}.peSubstitutoAplicado`]:true});
 }
}
export function registrarInterfaceDRS(api){
 const action=async info=>{try{return await acaoDRS(info);}catch(e){console.error('Sangue Escuro | DRS',e);ui.notifications.warn(e.message);}};
 api.registrarPainel({id:'drs-turno',pagina:'combate',template:'systems/sangue-escuro/templates/drs-turno.hbs',acoes:{executar:action},contexto:a=>({gm:game.user.isGM,correu:f(a,'correu',false),desengajou:f(a,'desengajou',false)})});
 api.registrarPainel({id:'drs-saude',pagina:'condicoes',template:'systems/sangue-escuro/templates/drs-saude.hbs',acoes:{executar:action},contexto:a=>({gm:game.user.isGM,base:api.regra('infeccaoZumbi',true),estavel:f(a,'estavel',false),morto:f(a,'morto',false),tratando:!!f(a,'tratamentoCritico'),referencia:game.settings.get(ID,'peReferencia'),reanimacao:f(a,'reanimacaoEm'),reanimacaoResolvida:f(a,'reanimacaoResolvida',false)})});
}
