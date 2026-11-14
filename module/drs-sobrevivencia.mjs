import {serialAtor,exigirDono,cartao} from './drs-runtime.mjs';
const ID='sangue-escuro',f=(a,k,d=null)=>a.getFlag(ID,k)??d;
const DV=()=>foundry.applications.api.DialogV2;
async function form(title,content){return DV().prompt({window:{title},content,rejectClose:false,ok:{label:'Confirmar',callback:(e,b)=>new foundry.applications.ux.FormDataExtended(b.form).object}});}
export async function encerrarDia(a){
 exigirDono(a);return serialAtor(a,async()=>{
 const now=Number(game.time.worldTime),ultimo=f(a,'ultimoDia');
 if(ultimo!==null&&now<ultimo+86400)throw Error('O próximo período de 24 horas ainda não terminou.');
 const necessidade=a.system.condicoes.intoxicado?4:2;
 const d=await form('Sobrevivência · 24 horas',`<p>Confirme um período completo ainda não contabilizado. Registre recursos efetivamente consumidos; este controle não altera o inventário nem avança o relógio.</p><label>Porções de comida<input type="number" min="0" name="comida" value="2"></label><label>Água potável consumida (litros)<input type="number" min="0" step="0.5" name="agua" value="2"></label><label>Necessidade diária vigente (litros)<input type="number" min="${necessidade}" step="0.5" name="necessidade" value="${necessidade}"></label><p>Normal: 2 L. Intoxicação ou efeito de consumo dobrado: 4 L; dois efeitos de consumo dobrado não exigem 8 L. Necessidades diferentes usam a maior aplicável.</p><label><input type="checkbox" name="confirmado">Período de 24 horas completo e recursos confirmados.</label>`);
 if(!d?.confirmado)return;
 const comida=Number(d.comida),agua=Number(d.agua),req=Number(d.necessidade);
 if(![comida,agua,req].every(Number.isFinite)||comida<0||agua<0||req<necessidade)throw Error('Consumo ou necessidade inválidos.');
 const pf=Math.max(0,Math.min(5,a.system.fome.value+(comida>=2?1:comida>=1?-1:-2)));
 const u={'system.fome.value':pf,[`flags.${ID}.ultimoDia`]:ultimo===null?now:ultimo+86400,[`flags.${ID}.necessidadeAgua`]:req};
 let ex=pf===0?1:0;
 if(agua<req&&!a.system.condicoes.desidratado){u['system.condicoes.desidratado']=true;u[`flags.${ID}.proximaPrivacao`]=now+43200;ex++;}
 u['system.exaustao.value']=Math.min(6,a.system.exaustao.value+ex);
 await a.update(u);
 return cartao(a,'Sobrevivência diária',`Fome ${pf}/5. Água ${agua}/${req} L. Exaustão adicional ${ex}. Se a privação continuar, resolva seus intervalos de 12 horas; não crie outra contagem para o mesmo efeito.`);
 });
}
export async function hidratar(a){
 exigirDono(a);const req=Math.max(a.system.condicoes.intoxicado?4:2,Number(f(a,'necessidadeAgua',2)));
 const ok=await DV().confirm({window:{title:'Recuperar da Desidratação'},content:`<p>Confirma o consumo de água potável suficiente para a necessidade vigente (${req} L/dia, ou maior exigência aplicável) e a conclusão de um Descanso Curto? Os recursos devem estar contabilizados.</p>`});
 if(ok)await a.update({'system.condicoes.desidratado':false,[`flags.${ID}.proximaPrivacao`]:null});
}
export async function resolverPrivacao(a){
 exigirDono(a);return serialAtor(a,async()=>{
 if(!a.system.condicoes.desidratado)throw Error('O personagem não está Desidratado.');
 const now=Number(game.time.worldTime),due=f(a,'proximaPrivacao');
 if(due===null){await a.setFlag(ID,'proximaPrivacao',now+43200);return cartao(a,'Privação de água','Contagem iniciada. A próxima avaliação ocorre em 12 horas do mundo.');}
 if(now<due)throw Error('O próximo período de 12 horas ainda não terminou.');
 if(!await DV().confirm({window:{title:'Privação contínua'},content:'<p>A privação de água permaneceu durante este intervalo? Confirme que esse mesmo período não foi resolvido por outro módulo. Aplique uma única Exaustão.</p>'}))return;
 await a.update({'system.exaustao.value':Math.min(6,a.system.exaustao.value+1),[`flags.${ID}.proximaPrivacao`]:due+43200});
 });
}
