'use strict';
/* =========================================================
   15. Marea por rangos y franja recomendada de 2 horas como máximo
   ========================================================= */
// Este archivo evita las barras invertidas: el conector de GitHub puede transformarlas al subirlo
// Marea (0 % bajamar, 100 % pleamar): ideal del 40 al 80 % subiendo; aceptable del 25 al 40 % subiendo,
// del 80 al 95 % y bajando del 80 al 40 %; evitar por debajo del 25 % (peor bajando); floja por encima del 95 %.
// Junto al dique (Sokoburu) es mejor la marea alta, y con marea baja asoman rocas.
const PLAN_MAX = 120; // la franja recomendada dura como mucho 2 h
const EXTRA_MAX = 60; // rato extra que se valora antes y después de la franja
const TQ_RISE = [[0, .55], [.24, .65], [.25, .8], [.4, 1], [.8, 1], [.95, .85], [1, .75]];
const TQ_FALL = [[0, .45], [.24, .58], [.25, .72], [.4, .86], [.8, .92], [.95, .82], [1, .75]];
const TQ_DIQ = [[0, .45], [.24, .55], [.25, .75], [.6, 1], [1, 1]];
const TQ_LABEL = { ideal: 'Ideal', ok: 'Aceptable', bad: 'Evitar', na: 'Sin dato' };

/* Calidad de la marea en un momento: factor de la nota (0,45–1), color y etiqueta */
function tideQ(t, sec) {
  if (!t) return { f: 1, key: 'na', label: TQ_LABEL.na };
  const r = clamp(t.rel, 0, 1);
  if (sec === 'sok') {
    const key = r < .25 ? 'bad' : r >= .6 ? 'ideal' : 'ok';
    return { f: interp(r, TQ_DIQ), key, label: TQ_LABEL[key] };
  }
  const key = r < .25 || r > .95 ? 'bad' : t.rising && r >= .4 && r <= .8 ? 'ideal' : 'ok';
  return { f: interp(r, t.rising ? TQ_RISE : TQ_FALL), key, label: r > .95 ? 'Floja' : TQ_LABEL[key] };
}
tideFactor = function (t) { return tideQ(t).f; };

/* Nota de cada hora: la marea cuenta entera (antes solo su raíz cuadrada) */
const _analyze8 = analyze;
analyze = function (h) {
  const x = _analyze8(h);
  if (!x.ok || x.danger) return x;
  x.base = 10 * interp(x.open, openTable(x.per)) * Math.pow(interp(x.en.kj, enTable()), .6) * Math.pow(x.perI.f, .4)
    * Math.pow(x.dirI.f, .9) * Math.pow(x.windI.f, .9); // nota sin la marea
  x.tq = tideQ(x.tide, x.sector ? x.sector.key : null);
  x.score = clamp(x.base * x.tq.f, 1, 10);
  if (x.flat) x.score = Math.min(x.score, 3);
  return x;
};

/* Nota minuto a minuto: oleaje y viento interpolados entre horas, marea en su minuto exacto */
function minuteScorer(d) {
  const hs = d.hours.filter(x => x.ok && !x.danger && x.base != null);
  const memo = new Map();
  return m => {
    if (memo.has(m)) return memo.get(m);
    let a = null, b = null;
    for (const x of hs) { if (x.min <= m) a = x; if (x.min >= m) { b = x; break; } }
    const nx = a && b ? (m - a.min <= b.min - m ? a : b) : (a || b);
    let v = null;
    if (nx) {
      const base = a && b && b.min > a.min && b.min - a.min <= 60 ? a.base + (b.base - a.base) * (m - a.min) / (b.min - a.min) : nx.base;
      const t = state.tide.fn(absOf(d.date, m)), q = tideQ(t, nx.sector ? nx.sector.key : null);
      let sc = clamp(base * q.f, 1, 10);
      if (nx.flat) sc = Math.min(sc, 3);
      v = { sc, t, q };
    }
    memo.set(m, v);
    return v;
  };
}
function samplePts(s, e) {
  const pts = [s];
  for (let m = Math.floor(s / 5) * 5 + 5; m < e; m += 5) pts.push(m);
  if (e > s) pts.push(e);
  return pts;
}
function avgOver(sf, s, e) {
  let sum = 0, n = 0;
  for (const m of samplePts(s, e)) { const v = sf(m); if (v) { sum += v.sc; n++; } }
  return n ? sum / n : null;
}
/* Cómo va la marea en un tramo: color mayoritario, porcentajes y pleamar o bajamar dentro */
function tideSpan(d, sf, s, e) {
  if (!state.tide || state.tide.mode === 'none') return null;
  const vs = samplePts(s, e).map(sf).filter(v => v && v.t);
  if (!vs.length) return null;
  const n = { ideal: 0, ok: 0, bad: 0, na: 0 };
  let rs = 0;
  for (const v of vs) { n[v.q.key]++; rs += v.t.rel; }
  const key = n.bad * 2 >= vs.length ? 'bad' : n.ideal >= vs.length * .6 ? 'ideal' : 'ok';
  const label = key === 'ideal' ? 'ideal' : key === 'ok' ? 'aceptable' : rs / vs.length < .5 ? 'a evitar' : 'floja';
  const ex = d.tideEx.find(x => x.min > s && x.min < e) || null;
  return { key, label, r0: vs[0].t.rel, r1: vs[vs.length - 1].t.rel, rising: vs[0].t.rising, ex };
}

/* Franja recomendada: el mejor bloque de hasta 2 h dentro de cada hueco con luz y libre */
makeFranja = function (d, s, e) {
  const c = d.hours.filter(x => x.ok && !x.danger && x.min + 30 > s && x.min - 30 < e);
  if (!c.length || e - s <= 0) return null;
  const sf = minuteScorer(d), L = Math.min(PLAN_MAX, e - s);
  const starts = new Set([s, e - L]);
  for (let m = Math.ceil(s / 15) * 15; m < e - L; m += 15) starts.add(m);
  let bs = null, top = -1;
  for (const b of [...starts].sort((p, q) => p - q)) {
    const v = avgOver(sf, b, b + L);
    if (v != null && v > top + 1e-9) { top = v; bs = b; }
  }
  if (bs == null) return null;
  let be = bs + L;
  // Si un extremo es claramente peor que el resto (1,5 puntos o más), se recorta de 15 en 15 min (mínimo 1 h)
  const minLen = Math.min(L, Math.max(60, S.minSession));
  for (let k = 0; k < 8 && be - bs - 15 >= minLen; k++) {
    const dh = avgOver(sf, bs + 15, be) - avgOver(sf, bs, bs + 15), dt = avgOver(sf, bs, be - 15) - avgOver(sf, be - 15, be);
    if (Math.max(dh, dt) < 1.5) break;
    if (dh >= dt) bs += 15; else be -= 15;
  }
  const avg = avgOver(sf, bs, be), mid = (bs + be) / 2;
  const inside = c.filter(x => x.min >= bs && x.min <= be);
  const pk = inside.length ? inside.reduce((p, x) => (x.score > p.score ? x : p))
    : c.reduce((p, x) => (Math.abs(x.min - mid) < Math.abs(p.min - mid) ? x : p));
  const f = { s, e, bs, be, dur: be - bs, peak: avg, peakHour: pk, short: e - s < 60, rank: avg * (.85 + .15 * Math.min(1, (be - bs) / 90)) };
  f.tide = tideSpan(d, sf, bs, be);
  f.extra = extraFor(d, sf, f);
  return f;
};

/* Rato extra: hasta 1 h antes o después, dentro del hueco con luz y libre */
function extraFor(d, sf, f) {
  const side = (a, b) => {
    if (b - a < 15) return null;
    const avg = avgOver(sf, a, b);
    return avg == null ? null : { s: a, e: b, avg, tide: tideSpan(d, sf, a, b) };
  };
  const before = side(Math.max(f.s, f.bs - EXTRA_MAX), f.bs), after = side(f.be, Math.min(f.e, f.be + EXTRA_MAX));
  const best = before && after ? (after.avg >= before.avg ? 'after' : 'before') : before ? 'before' : after ? 'after' : null;
  return { before, after, best, similar: !!(before && after && Math.abs(before.avg - after.avg) < .3) };
}
// Por qué no se puede alargar más por un lado
function edgeWhy(d, m, side) {
  const now = nowP();
  if (side === 'before') {
    if (d.date === now.date && m <= Math.ceil(now.min / 5) * 5 + 1) return 'ahora';
    if (m <= d.dawn + 1) return 'luz';
    return isAvailAt(d, m - 1) ? 'heavy' : 'horario';
  }
  if (m >= d.dusk - 1) return 'luz';
  return isAvailAt(d, m) ? 'heavy' : 'horario';
}
const EDGE_TXT = {
  ahora: ['ya es la hora', 'ya es la hora'], luz: ['aún no hay luz', 'se acaba la luz'],
  horario: ['fuera de tu horario', 'fuera de tu horario'], heavy: ['mar heavy', 'mar heavy']
};
const edgeTxt = (d, f, side) => EDGE_TXT[edgeWhy(d, side === 'before' ? f.s : f.e, side)][side === 'before' ? 0 : 1];

/* Textos */
const tpct = r => Math.round(r * 100);
const nb = s => s.split(' ').join(NBSP); // sin cortes de línea dentro de «84 → 97 % ▲»
function tideTxt(t) {
  if (!t) return '';
  if (t.ex) return nb(`${tpct(t.r0)} % → ${t.ex.type === 'high' ? 'pleamar' : 'bajamar'} ${hm(t.ex.min)} → ${tpct(t.r1)} %`);
  return nb(`${tpct(t.r0)} → ${tpct(t.r1)} % ${t.rising ? '▲' : '▼'}`);
}
const tqChip = q => el('span', { class: `tq ${q.key}`, text: q.label });
function tideRow(t, cls) {
  return el('p', { class: `tline${cls ? ' ' + cls : ''}` }, el('span', { class: `tq ${t.key}`, text: `Marea ${t.label}` }), el('span', { class: 'tl-r', text: tideTxt(t) }));
}
function extraHead(x) {
  const b = x[x.best];
  if (x.similar) return 'Da casi igual antes que después.';
  if (b.avg < 4) return 'No compensa mucho: fuera de la franja la nota baja.';
  if (!(x.before && x.after)) return x.best === 'after' ? 'Solo se puede alargar después.' : 'Solo se puede entrar antes.';
  return x.best === 'after' ? 'Mejor alargar después.' : 'Mejor entrar antes.';
}
function extraEl(d, f) {
  const x = f.extra; if (!x) return null;
  if (!x.best) return el('p', { class: 'xt xt-none' }, el('b', { text: 'Sin margen para alargar: ' }), `antes, ${edgeTxt(d, f, 'before')}; después, ${edgeTxt(d, f, 'after')}.`);
  const mark = !!(x.before && x.after) && !x.similar && x[x.best].avg >= 4;
  const item = side => {
    const o = x[side], name = side === 'before' ? 'Antes' : 'Después';
    if (!o) return el('li', { class: 'none' }, el('b', { text: name }), `: sin margen (${edgeTxt(d, f, side)}).`);
    const when = side === 'before' ? `desde las ${hm(o.s)}` : `hasta las ${hm(o.e)}`;
    const top = mark && side === x.best;
    return el('li', { class: top ? 'best' : null }, el('b', { text: name }), `, ${when}: ${nb(`nota ${f1(o.avg)}`)}`,
      o.tide ? ' · ' : '', o.tide ? el('span', { class: `tt ${o.tide.key}`, text: `marea ${tideTxt(o.tide)}` }) : null,
      top ? el('span', { class: 'tag best', text: 'Mejor' }) : null);
  };
  const order = x.best === 'before' ? ['before', 'after'] : ['after', 'before'];
  return el('div', { class: 'xt' }, el('p', { class: 'xt-h' }, el('b', { text: '¿Más rato? ' }), extraHead(x)), el('ul', {}, order.map(item)));
}
function extraShort(f) {
  const x = f.extra; if (!x) return '';
  if (!x.best) return 'Sin margen para alargar.';
  const w = side => side === 'before' ? `desde las ${hm(x.before.s)}` : `hasta las ${hm(x.after.e)}`;
  const b = x[x.best];
  if (x.similar) return `Más rato: da igual antes (${w('before')}) o después (${w('after')}).`;
  if (b.avg < 4) return `Más rato: no compensa, fuera de la franja baja a ${f1(b.avg)}.`;
  const only = !(x.before && x.after) ? 'solo cabe' : 'mejor';
  return `Más rato: ${only} ${x.best === 'after' ? 'después' : 'antes'}, ${w(x.best)} (nota ${f1(b.avg)}).`;
}

/* Panel principal: marea de la franja y nota del rato extra */
const _renderHero8 = renderHero;
renderHero = function () {
  _renderHero8();
  const pick = state.plan.next || state.plan.best; if (!pick) return;
  const { d, f } = pick, hero = $('#hero');
  const time = hero.querySelector('.when-time');
  if (time && f.tide) time.after(tideRow(f.tide, 'when-tide'));
  const sc = hero.querySelector('.score-big .of'); if (sc) sc.textContent = 'media / 10';
  const why = hero.querySelector('.why'), xt = extraEl(d, f);
  if (why && xt) why.after(xt);
};

/* Detalle del día */
const _renderDetail8 = renderDetail;
renderDetail = function () {
  _renderDetail8();
  const d = state.days[state.dayIdx]; if (!d || !d.best) return;
  const p = $('#detail .det-best'); if (!p) return;
  const f = d.best;
  p.replaceChildren('Mejor franja: ', el('b', { text: `${hm(f.bs)}–${hm(f.be)}` }), ` con nota media ${f1(f.peak)} en ${SECTORS[f.peakHour.sector.key].name}.`);
  let last = p;
  if (f.tide) { const r = tideRow(f.tide, 'det-tide'); last.after(r); last = r; }
  const xt = extraEl(d, f); if (xt) last.after(xt);
};
const _franjaList8 = franjaList;
franjaList = function (d, now) {
  const box = _franjaList8(d, now);
  const items = box.querySelectorAll('.fr-list > li');
  d.franjas.forEach((f, i) => {
    const body = items[i] && items[i].children[1]; if (!body) return;
    const meta = body.querySelector('.fr-meta');
    const add = [f.tide ? tideRow(f.tide, 'fr-tide') : null, el('p', { class: 'fr-extra', text: extraShort(f) })].filter(Boolean);
    if (meta) meta.after(...add); else body.append(...add);
  });
  return box;
};

/* Tabla hora a hora: calidad de la marea y horas de la franja */
const _hourlyTable8 = hourlyTable;
hourlyTable = function (d) {
  const wrap = _hourlyTable8(d), f = d.best;
  for (const tr of wrap.querySelectorAll('tbody tr')) {
    const m = +tr.dataset.m, x = d.hours.find(h => h.min === m);
    const c = tr.querySelector('.c-tide');
    if (x && x.tq && x.tq.key !== 'na' && c) c.append(' ', tqChip(x.tq));
    if (f && m >= f.bs - 30 && m < f.be - 15) {
      tr.classList.add('in-plan');
      const th = tr.querySelector('.c-time'); if (th) th.append(el('small', { class: 'plan-tag', text: 'franja' }));
    }
  }
  return wrap;
};
const _renderReadLine8 = renderReadLine;
renderReadLine = function () {
  _renderReadLine8();
  const box = $('#readLine'), d = state.days[state.dayIdx], x = d && d.hours.find(h => h.min === state.hour);
  if (!box || !x || !x.tq || x.tq.key === 'na') return;
  const sp = [...box.children].find(n => n.tagName === 'SPAN' && n.textContent.indexOf('Marea ') === 0);
  if (sp) sp.after(tqChip(x.tq));
};
const _condList8 = condList;
condList = function (x) {
  const dl = _condList8(x);
  if (x.tq && x.tq.key !== 'na') {
    const dt = [...dl.querySelectorAll('dt')].find(n => n.textContent === 'Marea');
    if (dt && dt.nextElementSibling) dt.nextElementSibling.append(tqChip(x.tq));
  }
  return dl;
};

/* Gráfico: curva de marea coloreada por calidad y recuadro de la franja */
const _legendBlock8 = legendBlock;
legendBlock = function () {
  const lg = _legendBlock8();
  const it = (cls, txt) => el('span', {}, el('i', { class: `sw ${cls}` }), txt);
  lg.append(it('plan', 'Franja recomendada'), it('tq-ideal', 'Marea ideal'), it('tq-ok', 'Aceptable'), it('tq-bad', 'Evitar'));
  return lg;
};
function planOverlay(d, o) {
  const W = Math.max(280, Math.floor(o.width || 340)), from = o.from, to = o.to, padL = 44, padR = 8, pw = W - padL - padR;
  const X = m => padL + (m - from) / (to - from) * pw;
  const showTide = state.tide.mode !== 'none';
  const aTop = 18, cBot = showTide ? 230 : 172; // mismas medidas que chartSVG
  let tide = '', box = '';
  if (showTide) {
    const pts = [];
    for (let m = from; m <= to; m += 15) { const t = state.tide.fn(absOf(d.date, m)); if (t) pts.push([m, t]); }
    if (pts.length > 2) {
      let lo = Infinity, hi = -Infinity; for (const [, t] of pts) { lo = Math.min(lo, t.level); hi = Math.max(hi, t.level); }
      const YC = v => cBot - 4 - (v - lo) / ((hi - lo) || 1) * 28;
      for (let i = 1; i < pts.length; i++) {
        const [m0, t0] = pts[i - 1], [m1, t1] = pts[i], mm = (m0 + m1) / 2, nx = hourAt(d, mm);
        const q = tideQ(state.tide.fn(absOf(d.date, mm)), nx && nx.sector ? nx.sector.key : null);
        if (q.key === 'na') continue;
        tide += `<line class="tqseg ${q.key}" x1="${X(m0).toFixed(1)}" y1="${YC(t0.level).toFixed(1)}" x2="${X(m1).toFixed(1)}" y2="${YC(t1.level).toFixed(1)}"/>`;
      }
    }
  }
  const f = d.best;
  if (f && f.be > from && f.bs < to) {
    const x1 = X(Math.max(f.bs, from)), x2 = X(Math.min(f.be, to));
    box = `<rect class="plan" x="${x1.toFixed(1)}" y="${aTop - 2}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="${cBot - aTop + 4}" rx="4"/>`
      + `<text class="plantxt" x="${clamp((x1 + x2) / 2, padL + 30, W - padR - 30).toFixed(1)}" y="${aTop - 6}" text-anchor="middle">${hm(f.bs)}–${hm(f.be)}</text>`;
  }
  return { tide, box };
}
const _chartSVG8 = chartSVG;
chartSVG = function (d, o) {
  let s = _chartSVG8(d, o);
  if (o.mini) return s;
  let add;
  try { add = planOverlay(d, o); } catch (err) { console.error(err); return s; }
  if (add.tide) { // justo encima de la curva de marea, debajo de sus puntos y etiquetas
    const i = s.indexOf('<polyline class="tideline"'), j = i < 0 ? -1 : s.indexOf('/>', i);
    if (j > 0) s = s.slice(0, j + 2) + add.tide + s.slice(j + 2);
  }
  if (add.box) { // detrás de barras y notas, para no tapar los números
    const a = s.indexOf('<rect class="selcol"'), b = s.lastIndexOf('<rect class="band ');
    const k = a >= 0 ? s.indexOf('/>', a) + 2 : b >= 0 ? s.indexOf('/>', b) + 2 : s.lastIndexOf('</svg>');
    s = s.slice(0, k) + add.box + s.slice(k);
  }
  return s;
};

/* Motivo del estado del día: la marea con su calidad */
factorsOf = function (x) {
  const out = [];
  const add = (f, text) => { if (f < .72) out.push({ f, text }); };
  add(interp(x.open, openTable(x.per)), x.open < 1.6 ? `poco tamaño (${f1(x.open)} m en boya)` : `demasiado tamaño para tus topes (${f1(x.open)} m en boya)`);
  add(interp(x.en.kj, enTable()), x.en.kj < 300 ? `poca energía (${fk(x.en.kj)} kJ)` : `mucha energía (${fk(x.en.kj)} kJ)`);
  add(x.perI.f, `período corto (${f0(x.per)} s, mar de viento)`);
  add(x.dirI.f, `swell del ${compass(x.dir)} (${x.dirI.label.toLowerCase()})`);
  add(x.windI.f, `viento ${x.windI.label} de ${f0(x.wind)} kn`);
  if (x.tq && x.tide && x.tq.key !== 'ideal' && x.tq.key !== 'na' && x.tq.f < .9)
    out.push({ f: x.tq.f, text: `la marea (${tpct(x.tide.rel)} % ${x.tide.rising ? 'subiendo' : 'bajando'}, ${x.tq.key === 'bad' && x.tq.label === 'Evitar' ? 'a evitar' : x.tq.label.toLowerCase()})` });
  return out.sort((a, b) => a.f - b.f).slice(0, 3).map(o => o.text);
};

Object.assign(window.HSR, { analyze, tideQ, tideFactor, minuteScorer, avgOver, tideSpan, makeFranja, extraFor, extraShort, factorsOf });
if (state.raw) safeRender(true);
