import {consequenciasDano,gravidadeFerimento} from './drs-regras.mjs';
const ID='sangue-escuro';
const flag=(a,k,d=null)=>a.getFlag(ID,k)??d;
const tempo=()=>Number(game.time.worldTime);
const filas=new Map();
export function serialAtor(a,fn){const anterior=filas.get(a.uuid)??Promise.resolve();const p=anterior.catch(()=>{}).then(fn);filas.set(a.uuid,p);return p.finally(()=>{if(filas.get(a.uuid)===p)filas.delete(a.uuid);});}
export function exigirDono(a){if(!a?.isOwner)throw Error('Controle o personagem para executar esta ação.');}
export function exigirMestre(){if(!game.user.isGM||game.users.activeGM&&!game.users.activeGM.isSelf)throw Error('Esta ação exige o Mestre ativo.');}
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function cartao(a,titulo,texto){return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:a}),content:`<div class="se-flavor"><h3>${esc(titulo)}</h3><p>${esc(texto)}</p></div>`});}
export async function receberDano(a,dano,{critico=false,causa='dano',...opcoes}={}){
 exigirDono(a);
 return serialAtor(a,async()=>{
  const s=a.system,r=consequenciasDano({pv:s.pv.value,max:s.pv.max,fracassos:s.morte?.fracassos??0,dano:Number(dano),critico});
  const update={'system.pv.value':r.pv};
  if(a.type==='character'&&r.perdeuEstabilidade){Object.assign(update,{'system.morte.fracassos':r.fracassos,'system.morte.sucessos':0,[`flags.${ID}.estavel`]:false});}
  if(a.type==='character'&&r.morreu)update[`flags.${ID}.morto`]=true;
  await a.update(update,{...opcoes,seDanoDRS:true});
  if(a.type==='character'&&r.morreu)Hooks.callAll('sangueEscuro.morreu',a,{causa,critico,dano});
  return r;
 });
}
export async function iniciarTurnoDRS(a){
 const s=a.system,c=s.condicoes??{},turno=Number(flag(a,'turnos',0))+1;
 const update={[`flags.${ID}.turnos`]:turno,[`flags.${ID}.correu`]:false,[`flags.${ID}.desengajou`]:false,[`flags.${ID}.reacaoBloqueada`]:false};
 const perde=flag(a,'perdaAcaoPendente') || (c.atordoado&&!flag(a,'atordoadoExpira')) || (c.eletrificado&&!flag(a,'eletrificadoAplicado'));
 if(a.type==='character'&&perde)update['system.turno.acoes']=Math.max(0,s.turno.acoes-1);
 if(c.atordoado&&!flag(a,'atordoadoExpira'))update[`flags.${ID}.atordoadoExpira`]=turno;
 if(c.eletrificado)update[`flags.${ID}.eletrificadoAplicado`]=true;
 update[`flags.${ID}.perdaAcaoPendente`]=false;
 if(a.type==='character'&&(s.pv.value<=0||c.incapacitado||c.paralisado))Object.assign(update,{'system.turno.acoes':0,'system.turno.reacao':0,'system.turno.bonus':0});
 await a.update(update);
}
function mudanca(changes,path){return changes[path]??foundry.utils.getProperty(changes,path);}
export function prepararAtualizacaoDRS(a,changes,options={}){
 if(!a.system.condicoes)return;
 const set=(k,v)=>{changes[k]=v;};
 for(const c of ['atordoado','eletrificado']){
  const novo=mudanca(changes,'system.condicoes.'+c);
  if(novo===true&&!a.system.condicoes[c]){if(a.type==='character')set('system.turno.reacao',0);set(`flags.${ID}.reacaoBloqueada`,true);set(`flags.${ID}.perdaAcaoPendente`,true);if(c==='atordoado')set(`flags.${ID}.atordoadoExpira`,null);}
  if(novo===false){if(c==='atordoado')set(`flags.${ID}.atordoadoExpira`,null);else set(`flags.${ID}.eletrificadoAplicado`,false);}
 }
 if(a.type!=='character')return;
 const ex=mudanca(changes,'system.exposicao.value');
 if(ex!==undefined&&ex>a.system.exposicao.value)set(`flags.${ID}.ocorrenciaExposicao`,Number(flag(a,'ocorrenciaExposicao',0))+1);
 if(mudanca(changes,'system.condicoes.intoxicado')===true&&!a.system.condicoes.intoxicado)set(`flags.${ID}.proximaIntoxicacao`,tempo()+3600);
 const pv=mudanca(changes,'system.pv.value');
 if(pv!==undefined&&!options.seSemCaido){
  if(pv<=0&&a.system.pv.value>0){set(`flags.${ID}.quaseMortePendente`,true);set(`flags.${ID}.estavel`,false);}
  if(pv>0&&a.system.pv.value<=0){
   if(flag(a,'quaseMortePendente'))set('system.exaustao.value',Math.min(6,Number(mudanca(changes,'system.exaustao.value')??a.system.exaustao.value)+1));
   set(`flags.${ID}.quaseMortePendente`,false);set(`flags.${ID}.estavel`,false);set(`flags.${ID}.morto`,false);
  }
 }
 // Conversão não destrutiva: a origem do agarrão continua explícita, para não virar contenção por cordas.
 if(mudanca(changes,'system.condicoes.agarrado')===true){set('system.condicoes.contido',true);set(`flags.${ID}.origemContido`,'agarrao');}
 if(mudanca(changes,'system.condicoes.agarrado')===false&&flag(a,'origemContido')==='agarrao'&&mudanca(changes,'system.condicoes.contido')!==true){set('system.condicoes.contido',false);set(`flags.${ID}.origemContido`,null);}
}
export async function fimTurnoDRS(combate,anterior){
 if(!game.users.activeGM?.isSelf)return;
 const a=combate.combatants.get(anterior?.combatantId)?.actor;if(!a)return;
 const u={[`flags.${ID}.desengajou`]:false};
 if(flag(a,'atordoadoExpira')===flag(a,'turnos')){u['system.condicoes.atordoado']=false;u[`flags.${ID}.atordoadoExpira`]=null;}
 await a.update(u);
}
export async function progredirInfeccao(a){
 exigirDono(a);return serialAtor(a,async()=>{
 if(!game.sangueEscuro.api.regra('infeccaoZumbi',true))throw Error('Use o controle de infecção do cenário ativo.');
 if(!a.system.condicoes.infectado||a.system.infeccaoEstagio>=4||flag(a,'morto'))throw Error('Não há progressão aplicável.');
 let due=flag(a,'proximaInfeccao');
 if(due===null){await a.setFlag(ID,'proximaInfeccao',tempo()+3600);return cartao(a,'Infecção','Contagem iniciada. O próximo teste será devido em uma hora do mundo.');}
 if(tempo()<due)throw Error('A próxima hora de infecção ainda não terminou.');
 const r=await a.rolarTeste({chave:'con',rotulo:'Progressão da Infecção',cd:14});
 const u={[`flags.${ID}.proximaInfeccao`]:due+3600};
 if(r.total<14){const stage=Math.min(4,a.system.infeccaoEstagio+1);Object.assign(u,{'system.infeccaoEstagio':stage,'system.exaustao.value':Math.min(6,a.system.exaustao.value+1)});if(stage===4)Object.assign(u,{'system.pv.value':0,[`flags.${ID}.morto`]:true,[`flags.${ID}.reanimacaoEm`]:tempo()+3600});}
 await a.update(u);
 if(a.system.infeccaoEstagio>=4){await cartao(a,'Morte por Infecção','Estágio 4: morte imediata. Reanimação prevista em uma hora; o corpo não pode agir nesse intervalo.');Hooks.callAll('sangueEscuro.morreu',a,{causa:'infeccao'});}
 });
}
export async function tratarCritico(a,op,responsavel){
 exigirMestre();return serialAtor(a,async()=>{
 if(gravidadeFerimento(a.system.ferimentos)<3)throw Error('Não há Ferimento Crítico.');
 const t=flag(a,'tratamentoCritico');
 if(op==='iniciar'){
  if(t)throw Error('Já existe atendimento em andamento.');
  if(!responsavel?.podeAgir())throw Error('Selecione um responsável capaz de prestar atendimento.');
  await a.setFlag(ID,'tratamentoCritico',{inicio:tempo(),responsavel:responsavel.uuid,indice:a.system.ferimentos.findIndex(f=>f.gravidade==='Crítico')});
  return cartao(a,'Atendimento contínuo','Dano periódico suspenso enquanto o atendimento e os recursos confirmados forem mantidos. Não estabiliza nem recupera PV.');
 }
 if(!t)throw Error('Nenhum atendimento em andamento.');
 if(op==='concluir'){
  if(tempo()<t.inicio+3600)throw Error('É necessária uma hora contínua de atendimento.');
  const medico=await fromUuid(t.responsavel);if(!medico?.podeAgir())throw Error('Responsável indisponível: interrompa o atendimento.');
  const p=medico.system.pericias.medicina,r=await medico.rolarTeste({chave:p.attr,bonus:p.bonus,rotulo:'Tratar Ferimento Crítico',cd:18});
  if(r.total>=18){if(a.system.ferimentos[t.indice]?.gravidade!=='Crítico')throw Error('O registro do ferimento mudou durante o atendimento. Interrompa e confira a ficha.');await a.update({'system.ferimentos':a.system.ferimentos.map((f,i)=>({...f,gravidade:i===t.indice?'Grave':f.gravidade}))});}
 }
 await a.update({[`flags.${ID}.tratamentoCritico`]:null,[`flags.${ID}.proximoCritico`]:tempo()+600});
 });
}
export async function resolverCritico(a){
 exigirMestre();return serialAtor(a,async()=>{
 if(gravidadeFerimento(a.system.ferimentos)<3||flag(a,'tratamentoCritico'))throw Error('Sem dano periódico pendente durante atendimento ou sem Ferimento Crítico.');
 const due=flag(a,'proximoCritico');if(due===null){await a.setFlag(ID,'proximoCritico',tempo()+600);return;}
 if(tempo()<due)throw Error('O próximo intervalo de dez minutos ainda não terminou.');
 const roll=await new Roll('1d4').evaluate();
 // O serviço já está na fila deste ator; aplicação interna evita enfileiramento recursivo.
 const r=consequenciasDano({pv:a.system.pv.value,max:a.system.pv.max,fracassos:a.system.morte.fracassos,dano:roll.total});
 const u={'system.pv.value':r.pv,[`flags.${ID}.proximoCritico`]:due+600};
 if(r.perdeuEstabilidade)Object.assign(u,{'system.morte.fracassos':r.fracassos,'system.morte.sucessos':0,[`flags.${ID}.estavel`]:false});
 if(r.morreu)u[`flags.${ID}.morto`]=true;
 await a.update(u,{seDanoDRS:true});
 await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:'<div class="se-flavor"><h3>Ferimento Crítico</h3><p>Dano periódico, ignora Proteção.</p></div>'});
 if(r.morreu)Hooks.callAll('sangueEscuro.morreu',a,{causa:'ferimento'});
 });
}
export function registrarDRS(){
 Hooks.on('preUpdateActor',prepararAtualizacaoDRS);
 Hooks.on('combatTurnChange',fimTurnoDRS);
 Hooks.on('sangueEscuro.descansoLongo',a=>a.isOwner&&a.setFlag(ID,'esforcoAcelerado',0));
 Hooks.on('updateActor',(a,changes,options,userId)=>{
  if(userId!==game.user.id||!a.isOwner)return;
  if(mudanca(changes,'system.ferimentos')!==undefined&&gravidadeFerimento(a.system.ferimentos)>=3&&flag(a,'proximoCritico')===null)a.setFlag(ID,'proximoCritico',tempo()+600);
  if(game.sangueEscuro.api.regra('infeccaoZumbi',true)&&mudanca(changes,'system.exposicao.value')>=3&&flag(a,'proximaInfeccao')===null)a.setFlag(ID,'proximaInfeccao',tempo()+3600);
 });
 Hooks.on('sangueEscuro.morreu',(a)=>{if(a.isOwner&&!flag(a,'morto'))return a.setFlag(ID,'morto',true);});
}
export async function descontaminarDRS(a){
 exigirDono(a);
 return serialAtor(a,async()=>{
  if(!game.sangueEscuro.api.regra('infeccaoZumbi',true)||a.system.condicoes.infectado||a.system.exposicao.value>=3||a.system.exposicao.value<1)throw Error('A descontaminação só é possível com 1 ou 2 EX, antes de Infecção.');
  const job=flag(a,'descontaminacao');
  if(job){
   if(tempo()<job.fim)throw Error('Os dez minutos do atendimento ainda não terminaram.');
   const m=await fromUuid(job.medico);if(!m?.podeAgir())throw Error('Responsável indisponível: o Mestre deve revisar o atendimento.');
   const p=m.system.pericias.medicina,r=await m.rolarTeste({chave:p.attr,bonus:p.bonus,rotulo:'Descontaminação',cd:14});
   await a.update({...(r.total>=14?{'system.exposicao.value':Math.max(0,a.system.exposicao.value-1)}:{}),[`flags.${ID}.descontaminacao`]:null});return;
  }
  const ocorrencia=flag(a,'ocorrenciaExposicao',0);
  if(flag(a,'descontaminadoOcorrencia')===ocorrencia)throw Error('Já houve uma tentativa após esta ocorrência de exposição.');
  const medicos=game.actors.filter(x=>x.type==='character'&&x.isOwner&&x.podeAgir());
  const d=await foundry.applications.api.DialogV2.prompt({window:{title:'Descontaminação · 10 minutos'},content:`<p>Confirme materiais adequados e consuma um uso, mesmo se o teste falhar. Esse controle não avança o relógio do mundo.</p><label>Responsável<select name="medico">${medicos.map(m=>`<option value="${esc(m.uuid)}">${esc(m.name)}</option>`).join('')}</select></label><label><input type="checkbox" name="consumo">Um uso dos suprimentos apropriados já foi contabilizado.</label>`,rejectClose:false,ok:{label:'Iniciar',callback:(e,b)=>new foundry.applications.ux.FormDataExtended(b.form).object}});
  if(!d?.consumo)return;const m=medicos.find(x=>x.uuid===d.medico);if(!m)throw Error('Responsável inválido.');
  await a.update({[`flags.${ID}.descontaminadoOcorrencia`]:ocorrencia,[`flags.${ID}.descontaminacao`]:{medico:m.uuid,fim:tempo()+600}});
 });
}
const filasPeriodicas=new Map();
export async function resolverIntoxicacao(a){
 exigirMestre();
 const anterior=filasPeriodicas.get(a.uuid)??Promise.resolve();
 const p=anterior.catch(()=>{}).then(async()=>{
  if(!a.system.condicoes.intoxicado)throw Error('O personagem não está Intoxicado.');
  const due=flag(a,'proximaIntoxicacao');
  if(due===null){await a.setFlag(ID,'proximaIntoxicacao',tempo()+3600);return;}
  if(tempo()<due)throw Error('A próxima hora de Intoxicação ainda não terminou.');
  const r=await new Roll('1d4').evaluate();
  await a.receberDano(r.total,{causa:'Intoxicação'});
  await a.setFlag(ID,'proximaIntoxicacao',due+3600);
  return r.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:'<div class="se-flavor"><h3>Intoxicação · Veneno</h3></div>'});
 });filasPeriodicas.set(a.uuid,p);return p.finally(()=>{if(filasPeriodicas.get(a.uuid)===p)filasPeriodicas.delete(a.uuid);});
}
export async function migrarDRS(){
 if(!game.user.isGM||game.users.activeGM&&!game.users.activeGM.isSelf)return;
 const todos=[...Array.from(game.actors?.values?.()??game.actors??[]),...Array.from(game.scenes?.values?.()??game.scenes??[]).flatMap(s=>Array.from(s.tokens?.values?.()??s.tokens??[]).filter(t=>!t.actorLink&&t.actor).map(t=>t.actor))];
 for(const a of new Map(todos.map(a=>[a.uuid,a])).values()){
  if(a.type!=='character'||flag(a,'schemaDRS')===1)continue;
  const u={[`flags.${ID}.schemaDRS`]:1};
  if(a.system.pv.value<=0){u[`flags.${ID}.quaseMortePendente`]=true;if(a.system.morte.sucessos>=3)u[`flags.${ID}.estavel`]=true;if(a.system.morte.fracassos>=3)u[`flags.${ID}.morto`]=true;}
  if(a.system.condicoes.agarrado){u['system.condicoes.contido']=true;u[`flags.${ID}.origemContido`]='agarrao';}
  if(gravidadeFerimento(a.system.ferimentos)>=3&&flag(a,'proximoCritico')===null)u[`flags.${ID}.proximoCritico`]=tempo()+600;
  if(a.system.condicoes.intoxicado&&flag(a,'proximaIntoxicacao')===null)u[`flags.${ID}.proximaIntoxicacao`]=tempo()+3600;
  if(a.system.condicoes.desidratado&&flag(a,'proximaPrivacao')===null)u[`flags.${ID}.proximaPrivacao`]=tempo()+43200;
  if(game.sangueEscuro.api.regra('infeccaoZumbi',true)&&a.system.condicoes.infectado&&a.system.infeccaoEstagio<4&&flag(a,'proximaInfeccao')===null)u[`flags.${ID}.proximaInfeccao`]=tempo()+3600;
  await a.update(u,{seMigracaoDRS:true});
 }
}
