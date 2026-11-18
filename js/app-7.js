'use strict';
/* =========================================================
   14. Temperatura del aire y del agua, y motivo de cada día
   ========================================================= */
// Este archivo evita las barras invertidas: el conector de GitHub puede transformarlas al subirlo
const SST_URL = URLS.marine.split('&hourly=')[0] + '&hourly=sea_surface_temperature';
URLS.sst = SST_URL;

/* Datos: la temperatura del agua se pide aparte y es opcional (si falla, solo se muestra la del aire) */
const _loadLive = loadLive;
loadLive = async function () {
  const sstP = fetchJSON(SST_URL).catch(() => null);
  const raw = await _loadLive();
  const sst = await sstP;
  if (sst && sst.hourly && Array.isArray(sst.hourly.time)) { raw.sst = { hourly: { time: sst.hourly.time, sea_surface_temperature: sst.hourly.sea_surface_temperature } }; lastSST = raw.sst; }
  return raw;
};
let lastSST = null; // la primera carga empieza antes de que exista este archivo
const _mergeRaw = mergeRaw;
mergeRaw = function (raw) {
  const res = _mergeRaw(raw);
  const src = (raw && raw.sst) || lastSST, T = src && src.hourly;
  if (T && Array.isArray(T.time) && Array.isArray(T.sea_surface_temperature)) {
    const idx = new Map(T.time.map((t, i) => [t, i]));
    for (const h of res.hours) {
      const i = idx.get(h.t), v = i == null ? null : T.sea_surface_temperature[i];
      h.sst = v != null && isFinite(v) ? +v : null;
    }
  }
  return res;
};
const NBSP = String.fromCharCode(160);
const degC = v => v == null || !isFinite(v) ? '–' : `${f0(v)}${NBSP}°C`;
function dayTemps(d) {
  const lit = d.hours.filter(x => x.min >= d.dawn && x.min <= d.dusk);
  const air = lit.map(x => x.temp).filter(v => v != null && isFinite(v));
  const sea = lit.map(x => x.sst).filter(v => v != null && isFinite(v));
  return {
    airMin: air.length ? Math.min(...air) : null, airMax: air.length ? Math.max(...air) : null,
    sea: sea.length ? sea.reduce((a, b) => a + b, 0) / sea.length : null
  };
}

/* Motivo del estado de cada día (por qué no es «Bueno») */
function factorsOf(x) {
  const out = [];
  const add = (f, text) => { if (f < .72) out.push({ f, text }); };
  add(interp(x.open, openTable(x.per)), x.open < 1.6 ? `poco tamaño (${f1(x.open)} m en boya)` : `demasiado tamaño para tus topes (${f1(x.open)} m en boya)`);
  add(interp(x.en.kj, enTable()), x.en.kj < 300 ? `poca energía (${fk(x.en.kj)} kJ)` : `mucha energía (${fk(x.en.kj)} kJ)`);
  add(x.perI.f, `período corto (${f0(x.per)} s, mar de viento)`);
  add(x.dirI.f, `swell del ${compass(x.dir)} (${x.dirI.label.toLowerCase()})`);
  add(x.windI.f, `viento ${x.windI.label} de ${f0(x.wind)} kn`);
  if (x.tide) { const t = tideFactor(x.tide); if (t < .86) out.push({ f: t + .1, text: `marea poco favorable (${tideLabel(x.tide.rel).toLowerCase()})` }); }
  return out.sort((a, b) => a.f - b.f).slice(0, 3).map(o => o.text);
}
const joinY = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
function dayWhy(d) {
  if (!d || d.status === 'good') return null;
  const now = nowP();
  const freeMin = d.wins.reduce((s, [a, b]) => s + (b - a), 0);
  if (!d.wins.length || freeMin < S.minSession) {
    if (d.date === now.date) return 'Hoy ya no te quedan horas libres con luz suficientes para una sesión.';
    return state.vacation ? 'No hay horas con luz suficientes.' : `Con tu horario no tienes horas libres con luz suficientes (luz útil de ${hm(d.dawn)} a ${hm(d.dusk)}). Puedes cambiarlo en Ajustes o activar el Modo Vacaciones.`;
  }
  const inWin = d.hours.filter(x => x.ok && d.wins.some(([s, e]) => x.min + 30 > s && x.min - 30 < e));
  if (!inWin.length) return 'No hay datos de oleaje para tus horas libres.';
  const safe = inWin.filter(x => !x.danger);
  if (d.status === 'danger' || !safe.length) {
    const x = inWin.reduce((b, y) => (y.open > b.open ? y : b));
    const why = [x.open > S.maxOpen ? `${f1(x.open)} m en boya (tu tope es ${f1(S.maxOpen)} m)` : null, x.en.kj > S.maxEnergy ? `${fk(x.en.kj)} kJ (tu tope es ${fk(S.maxEnergy)} kJ)` : null].filter(Boolean);
    return `En tus horas libres llega a ${joinY(why.length ? why : ['un exceso de tamaño o de corriente'])}. Los topes se cambian en Ajustes.`;
  }
  const x = d.best ? d.best.peakHour : safe.reduce((b, y) => (y.score > b.score ? y : b));
  if (d.status === 'flat') return `Plato: a las ${hm(x.min)} hay ${f1(x.open)} m en boya con ${f0(x.per)} s. Solo para tablón grande.`;
  const fs = factorsOf(x);
  const lead = `Lo mejor de tus horas libres es a las ${hm(x.min)}, con nota ${f1(x.score)}`;
  const short = freeMin < 90 ? ` Además, solo tienes ${freeMin} min libres con luz.` : '';
  return fs.length ? `${lead}. La bajan ${joinY(fs)}.${short}` : `${lead}: no hay un factor claro; varios están algo por debajo de lo ideal.${short}`;
}
const WHY_LEAD = { off: 'Por qué está descartado', check: 'Por qué hay que revisarlo', flat: 'Por qué está plato', danger: 'Por qué está heavy' };

/* Detalle del día: motivo y temperaturas */
const _renderDetail7 = renderDetail;
renderDetail = function () {
  _renderDetail7();
  const d = state.days[state.dayIdx]; if (!d) return;
  const head = $('#detail .det-head'), light = $('#detail .det-light');
  const why = dayWhy(d);
  if (why && head) head.after(el('p', { class: `det-why st-${d.status}` }, el('b', { text: `${WHY_LEAD[d.status] || 'Motivo'}: ` }), why));
  const t = dayTemps(d);
  if (light && (t.airMin != null || t.sea != null)) {
    const parts = [];
    if (t.airMin != null) parts.push(Math.round(t.airMin) === Math.round(t.airMax) ? `aire a ${degC(t.airMin)}` : `aire de ${f0(t.airMin)} a ${degC(t.airMax)}`);
    if (t.sea != null) parts.push(`agua a ${degC(t.sea)}`);
    light.after(el('p', { class: 'det-temp', text: `Temperatura con luz: ${parts.join(' y ')}.` }));
  }
};
/* Tabla hora a hora: columna de temperatura */
const _hourlyTable = hourlyTable;
hourlyTable = function (d) {
  const wrap = _hourlyTable(d);
  const hr = wrap.querySelector('thead tr'), wind = hr && [...hr.children].find(th => th.textContent === 'Viento');
  if (wind) wind.after(el('th', { scope: 'col', text: 'Temp.' }));
  for (const tr of wrap.querySelectorAll('tbody tr')) {
    const x = d.hours.find(h => h.min === +tr.dataset.m), cw = tr.querySelector('.c-wind');
    if (!x || !cw) continue;
    cw.after(el('td', { class: 'c-temp' }, el('span', { class: 'k', text: 'Aire ' }), degC(x.temp), x.sst != null ? el('span', { class: 'sea', text: ` · agua ${degC(x.sst)}` }) : null));
  }
  return wrap;
};
/* Hora seleccionada */
const _renderReadLine7 = renderReadLine;
renderReadLine = function () {
  _renderReadLine7();
  const box = $('#readLine'); if (!box) return;
  const d = state.days[state.dayIdx], x = d && d.hours.find(h => h.min === state.hour);
  if (x && x.ok && x.danger) {
    const over = [x.open > S.maxOpen ? `altura ${f1(x.open)} m > tope ${f1(S.maxOpen)} m` : null, x.en.kj > S.maxEnergy ? `energía ${fk(x.en.kj)} kJ > tope ${fk(S.maxEnergy)} kJ` : null].filter(Boolean);
    if (over.length) box.append(el('span', { class: 'rl-over', text: `Heavy por ${over.join(' y ')}` }));
  }
  if (!x || (x.temp == null && x.sst == null)) return;
  box.append(el('span', { class: 'rl-temp', text: [x.temp != null ? `Aire ${degC(x.temp)}` : null, x.sst != null ? `agua ${degC(x.sst)}` : null].filter(Boolean).join(', ') }));
};

fetchJSON(SST_URL).then(sst => {
  if (!sst || !sst.hourly || !Array.isArray(sst.hourly.time)) return;
  lastSST = { hourly: { time: sst.hourly.time, sea_surface_temperature: sst.hourly.sea_surface_temperature } };
  if (state.raw && state.source !== 'demo') safeRender(true);
}).catch(() => null);
/* Ajustes: aviso de que los topes también mueven la nota */
const _buildSettings7 = buildSettings;
buildSettings = function () {
  _buildSettings7();
  const sec = $('#rMaxE') && $('#rMaxE').closest('.set-sec');
  if (sec) sec.append(el('p', { class: 'fine', text: 'Si subes un tope por encima del valor por defecto (3,5 m o 1.500 kJ), la nota también deja de penalizar ese tamaño o esa energía: el tramo óptimo se alarga lo mismo que subas el tope.' }));
};
if (state.raw) safeRender(true);
Object.assign(window.HSR, { dayWhy, dayTemps, factorsOf });
