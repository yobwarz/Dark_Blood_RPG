/** Opções de criação registradas por módulos, armazenadas em tipos nativos existentes. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function criarItemPorDialogo(Classe,data,options,original) {
  const api=game.sangueEscuro?.api;
  const extras=api?.criacaoItensDisponiveis?.()??[];
  if(!extras.length||options.parent||data.type||options.template||options.dialogClass)return original(data,options);
  const permitidos=Array.isArray(options.types)?options.types:Object.keys(CONFIG.Item.dataModels);
  const opcoes=extras.filter(d=>permitidos.includes(d.tipoBase));
  if(!opcoes.length)return original(data,options);
  const nomes={arma:'Arma',equipamento:'Equipamento',habilidade:'Habilidade Passiva',protecao:'Proteção'};
  const todos=[...permitidos.map(id=>({id,nome:nomes[id]??id})),...opcoes].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const pack=options.pack?game.packs.get(options.pack):null;
  const pastas=Array.from((pack?.folders??game.folders)?.values?.()??[]).filter(f=>f.type==='Item');
  const html=`<label>Nome<input name="name" type="text" value="${esc(data.name??'')}" required></label><label>Tipo<select name="type">${todos.map(t=>`<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('')}</select></label>${pastas.length?`<label>Pasta<select name="folder"><option value="">Sem pasta</option>${pastas.map(f=>`<option value="${esc(f.id)}" ${f.id===data.folder?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>`:''}`;
  const escolhido=await foundry.applications.api.DialogV2.prompt({window:{title:'Criar Item'},content:html,rejectClose:false,ok:{label:'Criar',callback:(ev,b)=>({name:b.form.elements.name.value.trim(),type:b.form.elements.type.value,folder:b.form.elements.folder?.value??data.folder??null})}});
  if(!escolhido)return null;
  if(!escolhido.name)throw Error('Informe um nome para o documento.');
  if(!todos.some(t=>t.id===escolhido.type))throw Error('Tipo de criação inválido.');
  const payload=opcoes.some(d=>d.id===escolhido.type)?api.prepararCriacaoItem(escolhido.type,{...data,...escolhido}):{...data,...escolhido};
  return Classe.create(payload,{...options,renderSheet:true});
}
