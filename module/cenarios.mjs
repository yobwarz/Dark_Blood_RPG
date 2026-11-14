/** Exclusividade de expansões. Auxiliares de combate/fabricação não entram neste grupo. */
export const MODULOS_CENARIO_LEGADOS = Object.freeze([
  'sangue-escuro-fear-and-hunger', 'sangue-escuro-resident-evil-4', 'sangue-escuro-api'
]);
export function idsDeCenarios(api = game.sangueEscuro?.api) {
  const ids = new Set(MODULOS_CENARIO_LEGADOS);
  for (const c of api?.cenarios ?? []) if (c.modulo) ids.add(c.modulo);
  for (const m of game.modules?.values?.() ?? []) {
    const meta = m.flags?.['sangue-escuro'] ?? m._source?.flags?.['sangue-escuro'];
    if (meta?.tipo === 'cenario') ids.add(m.id);
  }
  return ids;
}
export function cenariosHabilitados(config, api) {
  const ids = idsDeCenarios(api);
  return Object.entries(config ?? {}).filter(([id, ativo]) => ids.has(id) && ativo === true).map(([id]) => id);
}
export function conflitoDeCenarios(config, api) { return cenariosHabilitados(config, api).length > 1; }
export function avisoConflito(ids) {
  const nomes = ids.map(id => game.modules.get(id)?.title ?? id).join('; ');
  return `Ative apenas uma expansão de cenário por mundo. Desmarque as demais antes de salvar: ${nomes}. Combate Automatizado e BSA podem continuar ativos.`;
}
const raizDe = html => html?.querySelector ? html : html?.[0];
export function configurarGerenciador(app, html) {
  const root = raizDe(html) ?? raizDe(app.element);
  if (!root) return;
  if (root.dataset.seExclusividade) { root.seAtualizarExclusividade?.(); return; }
  root.dataset.seExclusividade = '1';
  const ids = idsDeCenarios();
  const entradas = () => [...root.querySelectorAll('input[type="checkbox"]')].filter(i => ids.has(i.name));
  const selecionados = () => entradas().filter(i => i.checked);
  const atualizar = () => {
    const marcados = selecionados();
    for (const i of entradas()) {
      // Somente controles desabilitados por esta integração podem ser reabilitados por ela.
      const bloquear = marcados.length > 0 && !i.checked;
      if (bloquear && !i.disabled) { i.disabled = true; i.dataset.seBloqueado = '1'; i.title = 'Desative a outra expansão de cenário para selecionar esta.'; }
      else if (!bloquear && i.dataset.seBloqueado) { i.disabled = false; delete i.dataset.seBloqueado; i.removeAttribute('title'); }
    }
  };
  root.addEventListener('change', atualizar);
  const guard = ev => {
    const marcados = selecionados();
    if (marcados.length <= 1) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    ui.notifications.warn(avisoConflito(marcados.map(i => i.name)));
  };
  root.addEventListener('submit', guard, true);
  root.addEventListener('click', ev => { if (ev.target.closest?.('button[type="submit"],input[type="submit"]')) guard(ev); }, true);
  root.seAtualizarExclusividade = atualizar;
  atualizar();
}
function verificarConfiguracao(doc, changes) {
  if ((doc.key ?? doc._source?.key ?? changes?.key) !== 'core.moduleConfiguration') return;
  let value = changes?.value;
  if (value === undefined) return;
  try { if (typeof value === 'string') value = JSON.parse(value); }
  catch { return; }
  const ids = cenariosHabilitados(value);
  if (ids.length <= 1) return;
  ui.notifications.warn(avisoConflito(ids));
  return false;
}
export function registrarExclusividade() {
  Hooks.on('renderModuleManagement', configurarGerenciador);
  Hooks.on('preUpdateSetting', verificarConfiguracao);
  Hooks.on('preCreateSetting', (doc, data) => verificarConfiguracao(doc, data));
}
export function verificarCenariosAoIniciar() {
  const config = Object.fromEntries(Array.from(game.modules?.values?.() ?? []).map(m => [m.id, m.active]));
  const ids = cenariosHabilitados(config);
  if (ids.length > 1 && game.user.isGM) ui.notifications.error(avisoConflito(ids), { permanent: true });
}
