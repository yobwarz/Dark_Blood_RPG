/** Regras puras do DRS 1.2 consolidado, 13/11/2026. Sem dependência do Foundry. */
export function resolverPenalidades(partes) {
  const elegiveis = partes.filter(p => p.valor < 0 && ['condicao','fome','ferimento'].includes(p.grupo) && !p.acumula);
  const pior = elegiveis.reduce((a,b) => !a || b.valor < a.valor ? b : a, null);
  const aplicadas = partes.filter(p => !elegiveis.includes(p) || p === pior);
  return { partes: aplicadas, suprimidas: elegiveis.filter(p => p !== pior), total: aplicadas.reduce((n,p) => n + Number(p.valor || 0), 0) };
}
export function gravidadeFerimento(ferimentos = []) {
  return Math.max(0, ...ferimentos.map(f => ['Leve','Moderado','Grave','Crítico'].indexOf(f.gravidade)));
}
export function consequenciasDano({pv,max,fracassos=0,dano,critico=false}) {
  if (!Number.isFinite(dano) || dano < 0) throw Error('Dano inválido.');
  const resultado = { pv: Math.max(0,pv-dano), fracassos, perdeuEstabilidade: false, morreu: false };
  if (pv <= 0 && dano > 0) {
    resultado.fracassos = Math.min(3,fracassos + (critico ? 2 : 1));
    resultado.perdeuEstabilidade = true;
    resultado.morreu = dano >= max || resultado.fracassos >= 3;
  }
  return resultado;
}
export function custoBonus({acoes,bonus,intoxicado,permitido,divida=false,antecipada=false}) {
  if (!permitido) throw Error('Uma habilidade ou regra precisa permitir esta Ação Bônus.');
  if (bonus < 1 || (antecipada && divida)) throw Error('Ação Bônus indisponível ou Dívida de Ação pendente.');
  if (intoxicado && acoes < 1) throw Error('Intoxicado: é necessário abrir mão de uma Ação normal ainda disponível.');
  return { acoes: acoes - (intoxicado ? 1 : 0) + (antecipada ? 1 : 0), bonus: bonus-1, divida: divida || antecipada };
}
export const RITMOS = Object.freeze({cauteloso:1.5,normal:1,acelerado:0.75});
export function tempoTrecho(base,ritmo='normal') {
  if (!Number.isFinite(base) || base < 0 || !(ritmo in RITMOS)) throw Error('Tempo ou ritmo inválido.');
  return base * RITMOS[ritmo];
}
export function esforcoAcelerado(antes,segundos) {
  if (![antes,segundos].every(n=>Number.isFinite(n)&&n>=0)) throw Error('Duração inválida.');
  const total=antes+segundos;
  return {total,testes:Math.floor(total/14400)-Math.floor(antes/14400)};
}
