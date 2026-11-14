/** Leitura HTML sem rolagem interna; editor nativo aberto apenas quando solicitado. */
const documento = ficha => ficha.document ?? ficha.actor ?? ficha.item;
export async function enriquecerTexto(doc, campo) {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(doc.system[campo] ?? '', {
    secrets: doc.isOwner, relativeTo: doc
  });
}
function dados(ficha, alvo) {
  const host = alvo.closest('.se-texto-formatado');
  const campo = host?.dataset.campo;
  if (!host || !['notas', 'descricao'].includes(campo)) throw Error('Campo de texto inválido.');
  const doc = documento(ficha);
  if (!ficha.isEditable || !doc?.isOwner) throw Error('Você não pode editar esta ficha.');
  return {host, campo, doc};
}
export function editarTexto(event, alvo) {
  try {
    const {host, campo, doc} = dados(this, alvo);
    if (host.dataset.editando === 'true') return;
    const original = doc.system[campo] ?? '';
    const area = host.querySelector('.se-texto-edicao');
    const salvar = host.querySelector('.se-texto-salvar');
    // O componente deve conectar-se já visível, com uma área editável de altura definida.
    host.dataset.editando = 'true';
    delete host.dataset.editorPronto;
    salvar.disabled = true;
    const editor = foundry.applications.elements.HTMLProseMirrorElement.create({
      value: original, enriched: original, documentUUID: doc.uuid,
      collaborate: false, toggled: false
    });
    host.seEditor = editor;
    editor.value = original;
    editor.addEventListener('change', ev => ev.stopPropagation());
    const concluir = () => {
      if (host.seEditor !== editor || host.dataset.editando !== 'true' || (area.contains && !area.contains(editor))) return;
      const input = editor.querySelector('[contenteditable="true"]') ?? editor.shadowRoot?.querySelector('[contenteditable="true"]');
      if (!input || input.getBoundingClientRect().height <= 0) return;
      const tinhaTexto = original.replace(/<[^>]*>/g, '').trim().length > 0;
      if (tinhaTexto && !input.textContent.trim()) {
        // Reaplica o valor depois de o editor nativo estar conectado e inicializado.
        editor.value = original;
        if (!input.textContent.trim()) return;
      }
      clearTimeout(host.seEditorTimeout);
      host.dataset.editorPronto = 'true';
      salvar.disabled = false;
      input.focus();
    };
    editor.addEventListener('open', () => requestAnimationFrame(concluir), {once:true});
    area.replaceChildren(editor);
    requestAnimationFrame(concluir);
    host.seEditorTimeout = setTimeout(() => {
      if (host.dataset.editando === 'true' && host.dataset.editorPronto !== 'true') {
        console.warn('Sangue Escuro | Diagnóstico do editor', {
          campo, elemento: editor.tagName, conectado: editor.isConnected,
          aberto: editor.open, editavel: editor.editable,
          tamanhoSalvo: original.length, tamanhoEditor: typeof editor.value === 'string' ? editor.value.length : null,
          altura: editor.getBoundingClientRect?.().height,
          areas: Array.from(editor.querySelectorAll?.('[contenteditable]') ?? []).map(e => ({editavel:e.getAttribute('contenteditable'),altura:e.getBoundingClientRect().height,tamanho:e.textContent.length}))
        });
        ui.notifications.warn('O editor não inicializou corretamente. O texto salvo permanece intacto; use Cancelar. Veja o diagnóstico no console F12.');
      }
    }, 8000);
  } catch(e) { ui.notifications.warn(e.message); }
}
export async function salvarTexto(event, alvo) {
  try {
    const {host, campo, doc} = dados(this, alvo);
    if (host.dataset.editorPronto !== 'true') throw Error('Aguarde o editor carregar o texto antes de salvar.');
    const editor = host.seEditor;
    if (!editor || typeof editor.value !== 'string') throw Error('O editor ainda não está pronto.');
    alvo.disabled = true;
    await doc.update({[`system.${campo}`]: editor.value});
    this.render();
  } catch(e) { console.error('Sangue Escuro | Edição de texto', e); ui.notifications.error(e.message); }
  finally { alvo.disabled = false; }
}
export function cancelarTexto(event, alvo) {
  try {
    const {host} = dados(this, alvo);
    clearTimeout(host.seEditorTimeout);
    host.querySelector('.se-texto-edicao').replaceChildren();
    delete host.seEditor;
    delete host.dataset.editorPronto;
    delete host.dataset.editando;
  } catch(e) { ui.notifications.warn(e.message); }
}
