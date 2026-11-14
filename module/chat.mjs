/** Marca somente os cartões produzidos pelo sistema e suas expansões, sem alterar seu conteúdo. */
export function prepararCartaoChat(mensagem, html) {
  const el = html?.querySelector ? html : html?.[0];
  if (!el) return;
  const marcador = '.se-flavor, .se-painel.re4';
  if (!el.matches?.(marcador) && !el.querySelector(marcador)) return;
  const cartao = el.closest?.('.chat-message') ?? el;
  cartao.classList.add('se-chat-card');
}
