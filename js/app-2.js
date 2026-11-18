'use strict';
// Zona gris: repunte surfeable (1,4–2,2 m en boya con viento favorable o cross-off) que aparece
// cerca del ocaso o, ya sin luz, cerca de una pleamar o bajamar
function greyZone(d, now) {
  const isToday = d.date === now.date;
  if (isToday && now.min > d.dusk - 15) return null; // ya no hay luz para adelantarse
  const nearTide = m => { let b = null; for (const e of d.tideEx) { const dd = Math.abs(e.min - m); if (dd <= 90 && (!b || dd < Math.abs(b.min - m))) b = e; } return b; };
  const cand = d.hours.filter(x => x.ok && !x.danger && x.min >= d.set && x.min <= 23 * 60 && isAvailAt(d, x.min)
    && (x.min <= H1 || nearTide(x.min)));
  if (!cand.length) return null;
  const ref = hourAt(d, d.set - 60); // la última luz buena: una hora antes de la puesta de sol
  if (!ref || !ref.ok) return null;
  const hits = [];
  for (const x of cand) {
    if (x.min <= ref.min) continue;
    const surfable = x.open >= 1.4 && x.open <= 2.2 && x.windI.fav && x.dirI.f >= .6 && x.score >= 4;
    const repunte = x.open - ref.open >= .15 || ref.open < 1.4 || !ref.windI.fav;
    if (surfable && repunte) hits.push({ x, tide: nearTide(x.min) });
  }
  if (!hits.length) return null;
  const pk = hits.reduce((b, h) => (h.x.score > b.x.score ? h : b));
  // Entrada sugerida: 1–2 h antes del repunte, dentro de tu última franja con luz
  const wins = availOf(d.dow).map(([a, b]) => [Math.max(a, d.dawn), Math.min(b, d.dusk)]).filter(([a, b]) => b - a > 0);
  const last = wins.length ? wins[wins.length - 1] : null;
  let entry = null;
  if (last) {
    const [wa, wb] = last;
    let es = clamp(pk.x.min - 120, wa, wb), ee = clamp(pk.x.min - 60, wa, wb);
    if (ee - es < 15) { es = Math.max(wa, wb - 60); ee = wb; }
    if (isToday) es = Math.max(es, Math.ceil(now.min / 5) * 5);
    if (ee - es >= 10) {
      const oe = valAt(d, es, 'open');
      entry = { s: es, e: ee, openAt: oe, ratio: oe != null && pk.x.open ? oe / pk.x.open : null };
    }
  }
  return { peak: pk.x, hits, ref, entry, tideNear: pk.tide || null }; // la marea solo se menciona si coincide con el repunte
}
function bestLight(d) {
  let b = null;
  for (const x of d.hours) if (x.ok && !x.danger && x.min >= d.dawn && x.min <= d.dusk && (!b || x.score > b.score)) b = x;
  if (b) return b;
  for (const x of d.hours) if (x.ok && x.min >= d.dawn && x.min <= d.dusk && (!b || x.open > b.open)) b = x;
  return b;
}
function buildDays(hours, sun, now) {
  const by = new Map();
  for (const h of hours) { if (!by.has(h.date)) by.set(h.date, []); by.get(h.date).push(h); }
  const out = [];
  for (const [date, hs] of by) {
    if (dayNum(date) < dayNum(now.date)) continue;
    const sn = sun.get(date) || sunNOAA(date);
    const d = { date, dow: dowOf(date), rise: sn.rise, set: sn.set };
    d.dawn = d.rise - S.twilight; d.dusk = d.set + S.twilight;
    d.hours = hs.map(analyze);
    const d0 = absOf(date, 0);
    d.tideEx = state.tide.ex.filter(e => e.abs >= d0 - 60 && e.abs < d0 + 1500).map(e => ({ min: e.abs - d0, val: e.val, type: e.type }));
    d.wins = windowsFor(d, now);
    d.franjas = [];
    for (const [s, e] of d.wins) for (const [p, q] of splitSafe(d, s, e)) {
      if (q - p < S.minSession) continue;
      const f = makeFranja(d, p, q);
      if (f) d.franjas.push(f);
    }
    d.best = d.franjas.reduce((b, f) => (!b || f.rank > b.rank ? f : b), null);
    d.grey = greyZone(d, now);
    // Estado del día
    const light = d.hours.filter(x => x.ok && x.min >= d.dawn && x.min <= d.dusk);
    const evalH = d.hours.filter(x => x.ok && d.wins.some(([s, e]) => x.min + 30 > s && x.min - 30 < e));
    const base = evalH.length ? evalH : light;
    const dl = light.filter(x => x.danger);
    d.dangerSome = dl.length > 0;
    d.dangerSpan = dl.length ? [dl[0].min, dl[dl.length - 1].min] : null;
    const bp = d.best ? d.best.peak : 0;
    const allDanger = base.length > 0 && base.every(x => x.danger);
    const allFlat = base.length > 0 && base.every(x => x.flat || x.danger) && base.some(x => x.flat);
    if (bp >= S.goodScore) d.status = 'good';
    else if (allDanger || (bp < 4 && light.length && dl.length * 2 >= light.length)) d.status = 'danger';
    else if (allFlat) d.status = 'flat';
    else if (bp >= 4 || d.grey) d.status = 'check';
    else d.status = 'off';
    d.show = d.best ? d.best.peakHour : bestLight(d);
    out.push(d);
  }
  return out;
}
function findNext(days) {
  const all = [];
  for (const d of days) for (const f of d.franjas) all.push({ d, f });
  const good = all.filter(o => o.f.peak >= S.goodScore).sort((p, q) => (p.d.date < q.d.date ? -1 : p.d.date > q.d.date ? 1 : p.f.bs - q.f.bs));
  const best = all.reduce((b, o) => (!b || o.f.rank > b.f.rank ? o : b), null);
  return { next: good[0] || null, best };
}
function bandAt(d, m) {
  if (m < d.dawn || m >= d.dusk) return { cls: 'night', label: 'Noche cerrada', short: 'Noche' };
  if (!isAvailAt(d, m)) return { cls: 'busy', label: 'Franja de trabajo', short: 'Trabajo' };
  if (m < d.rise || m >= d.set) return { cls: 'tw', label: 'Zona gris (crepúsculo)', short: 'Zona gris' };
  return { cls: 'free', label: 'Luz diurna disponible', short: 'Luz' };
}
function bandSegments(d, from, to) {
  const pts = new Set([from, to, d.dawn, d.rise, d.set, d.dusk]);
  for (const [a, b] of availOf(d.dow)) { pts.add(a); pts.add(b); }
  const arr = [...pts].filter(p => p >= from && p <= to).sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1];
    if (b - a < 1) continue;
    const cls = bandAt(d, (a + b) / 2).cls, l = segs[segs.length - 1];
    if (l && l.cls === cls && l.b === a) l.b = b; else segs.push({ a, b, cls });
  }
  return segs;
}

/* =========================================================
   8. Estado y carga
   ========================================================= */
const state = { raw: null, source: null, error: null, loading: false, days: [], plan: { next: null, best: null }, tide: { mode: 'none', ex: [], fn: () => null }, tideRaw: [], dayIdx: 0, selDate: null, hour: null, vacation: store.get(K_VAC, false) === true };

function recompute() {
  if (!state.raw) { state.days = []; state.plan = { next: null, best: null }; return; }
  const { hours, sun } = mergeRaw(state.raw);
  const hasLevel = hours.filter(h => h.slh != null).length >= 24;
  state.tideRaw = hasLevel ? detectExtremes(hours) : [];
  state.tide = buildTide(hours, state.tideRaw);
  const now = nowP();
  state.days = buildDays(hours, sun, now);
  state.plan = findNext(state.days);
  let i = state.selDate ? state.days.findIndex(d => d.date === state.selDate) : -1;
  if (i < 0) { i = 0; state.hour = null; }
  state.dayIdx = i;
  const d = state.days[i];
  state.selDate = d ? d.date : null;
  if (d && (state.hour == null || state.hour < H0 || state.hour > H1 || !d.hours.some(x => x.min === state.hour))) state.hour = defaultHour(d, now);
}
function defaultHour(d, now) {
  const lim = m => clamp(Math.round(m / 60) * 60, H0, H1);
  if (d.date === now.date) return lim(now.min);
  if (d.best) return lim(d.best.peakHour.min);
  return lim(d.show ? d.show.min : 720);
}
async function load() {
  if (state.loading) return;
  state.loading = true; setBusy(true); renderStatus();
  try {
    const raw = await loadLive();
    state.raw = raw; state.source = 'live'; state.error = null;
    store.set(K_CACHE, raw);
  } catch (err) {
    state.error = err;
    if (state.source !== 'demo') {
      const c = store.get(K_CACHE, null);
      if (cacheUsable(c, nowP())) { state.raw = c; state.source = 'cache'; }
      else if (!state.raw || state.source !== 'live') { state.raw = null; state.source = null; }
      else state.source = 'cache-mem';
    }
  }
  state.loading = false; setBusy(false);
  safeRender(true);
}
function startDemo() {
  state.raw = makeDemo(nowP().date); state.source = 'demo'; state.error = null; state.selDate = null;
  safeRender(true);
}
function safeRender(full) {
  try { recompute(); full ? render() : renderLight(); }
  catch (err) {
    console.error(err);
    $('#hero').replaceChildren(el('p', { class: 'lead', text: 'Algo ha fallado al calcular el pronóstico.' }), el('p', { class: 'fine', text: String(err && err.message || err) }), el('div', { class: 'btn-row' }, el('button', { class: 'btn', type: 'button', onclick: () => load(), text: 'Reintentar' })));
  }
}

/* =========================================================
   9. Interfaz
   ========================================================= */
function setBusy(on) { const b = $('#btnRefresh'); if (b) { b.classList.toggle('busy', on); b.setAttribute('aria-busy', on ? 'true' : 'false'); } }
function agoText(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  const t = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  if (min < 1) return `a las ${t}, ahora mismo`;
  if (min < 60) return `a las ${t}, hace ${min} min`;
  if (min < 24 * 60) return `a las ${t}, hace ${Math.round(min / 60)} h`;
  return `el ${new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))}`;
}
function renderStatus() {
  const b = $('#status'); b.replaceChildren(); b.className = 'status';
  if (state.loading && !state.raw) { b.textContent = 'Consultando Open-Meteo…'; return; }
  if (state.source === 'cache-boot') { b.textContent = `Datos guardados ${agoText(state.raw.fetchedAt)}. Actualizando…`; return; }
  const retry = txt => el('button', { class: 'link', type: 'button', onclick: () => load(), text: txt });
  if (state.source === 'demo') {
    b.classList.add('warn');
    b.append(el('strong', { text: 'Datos de ejemplo.' }), ' No es un pronóstico real. Abre la app en un navegador con conexión para ver Hendaya en vivo. ', retry('Probar conexión'));
    return;
  }
  if (state.source === 'cache' || state.source === 'cache-mem') {
    b.classList.add('warn');
    b.append(el('strong', { text: 'Sin conexión.' }), ` Muestro los datos guardados ${agoText(state.raw.fetchedAt)}. `, retry('Reintentar'));
    return;
  }
  if (state.source === 'live') b.textContent = `Open-Meteo, actualizado ${agoText(state.raw.fetchedAt)}${state.loading ? ' (actualizando…)' : ''}`;
}
function renderLinks() {
  $('#links').replaceChildren(
    el('h2', { class: 'side-title', text: 'Comprobar en directo' }),
    el('ul', { class: 'link-list' }, LINKS.map(l => el('li', {},
      el('a', { class: 'ext', href: l.url, target: '_blank', rel: 'noopener noreferrer' },
        el('span', { class: 'ext-main', text: l.label }), el('span', { class: 'ext-sub', text: l.sub }), el('span', { class: 'ext-ico', 'aria-hidden': 'true', html: ICON_EXT })))))
  );
}
function render() {
  renderStatus(); renderVac();
  if (!state.raw) { renderEmpty(); return; }
  renderHero(); renderTabs(); renderDetail();
}
function renderLight() { // refresco periódico sin reconstruir la tabla
  renderStatus(); renderVac();
  if (!state.raw) { renderEmpty(); return; }
  renderHero(); renderTabs();
  if (!$('#chartWrap') || state.renderedDate !== state.selDate) renderDetail(); else { drawCharts(); renderReadLine(); highlightRows(false); }
}
function renderVac() {
  const b = $('#btnVac'); if (!b) return;
  b.setAttribute('aria-checked', state.vacation ? 'true' : 'false');
  $('#vacState').textContent = state.vacation ? 'Activado: se puntúan todas las horas con luz de los 7 días' : 'Desactivado: horario laboral (antes de las 08:30, tardes y fin de semana)';
}
function renderEmpty() {
  $('#hero').replaceChildren(...[
    el('div', { class: 'hero-head' }, el('h2', { class: 'hero-label', text: 'Sin datos' }), el('span', { class: 'coords', text: '43°22′ N  1°46′ W' })),
    el('p', { class: 'lead', text: 'No se pudo conectar con Open-Meteo.' }),
    el('p', { text: 'Si estás viendo esto dentro de Claude, es lo esperado: su visor bloquea las conexiones a otras webs. Descarga el archivo y ábrelo en el navegador (doble clic en el ordenador; en Android, ábrelo con Chrome) y cargará los datos en vivo. Si ya lo has abierto así, revisa la conexión a internet.' }),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary', type: 'button', onclick: () => load(), text: 'Reintentar' }),
      el('button', { class: 'btn', type: 'button', onclick: startDemo, text: 'Ver con datos de ejemplo' })),
    state.error ? el('p', { class: 'fine', style: 'margin-top:10px', text: `Detalle técnico: ${state.error.message || state.error}` }) : null,
    el('span', { class: 'grad-b', 'aria-hidden': 'true' })
  ].filter(Boolean));
  $('#days').replaceChildren(); $('#detail').replaceChildren();
}

/* Dial de radar: swell y viento frente a la playa y a Cabo Higuer */
function dialSVG(x, size) {
  const c = size / 2, R = c - 8;
  const P = (deg, r) => { const a = deg * Math.PI / 180; return [+(c + r * Math.sin(a)).toFixed(2), +(c - r * Math.cos(a)).toFixed(2)]; };
  const arc = (d1, d2, r) => { const sw = norm360(d2 - d1), [x1, y1] = P(d1, r), [x2, y2] = P(d1 + sw, r); return `M${x1} ${y1}A${r} ${r} 0 ${sw > 180 ? 1 : 0} 1 ${x2} ${y2}`; };
  let s = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Swell del ${compass(x.dir)} y viento del ${compass(x.windDir)} frente a la playa">`;
  s += `<circle cx="${c}" cy="${c}" r="${R}" class="d-sea"/>`;
  s += `<circle cx="${c}" cy="${c}" r="${(R * .68).toFixed(1)}" class="d-contour"/><circle cx="${c}" cy="${c}" r="${(R * .38).toFixed(1)}" class="d-contour"/>`;
  const [a1, b1] = P(72, R), [a2, b2] = P(252, R);
  s += `<path class="d-land" d="M${a1} ${b1}A${R} ${R} 0 0 1 ${a2} ${b2}Z"/>`;            // tierra al SSE de la playa
  const hp = [[252, 1], [257, .66], [266, .5], [278, .56], [286, .8], [284, 1]].map(([d, r]) => P(d, r * R).join(' '));
  s += `<path class="d-land" d="M${hp.join('L')}A${R} ${R} 0 0 0 ${P(252, R).join(' ')}Z"/>`; // Cabo Higuer
  s += `<path class="d-meh" d="${arc(275, 290, R + 3)}"/><path class="d-meh" d="${arc(15, 45, R + 3)}"/>`;
  s += `<path class="d-ok" d="${arc(290, 15, R + 3)}"/><path class="d-block" d="${arc(200, 275, R + 3)}"/>`;
  for (let i = 0; i < 16; i++) { const d = i * 22.5, long = i % 4 === 0, [p1, q1] = P(d, R - (long ? 7 : 4)), [p2, q2] = P(d, R); s += `<line class="d-tick" x1="${p1}" y1="${q1}" x2="${p2}" y2="${q2}"/>`; }
  for (const [d, t] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) { const [tx, ty] = P(d, R - 15); s += `<text class="d-card" x="${tx}" y="${ty}" dy=".35em" text-anchor="middle">${t}</text>`; }
  s += `<circle cx="${c}" cy="${c}" r="2.6" class="d-me"/>`;
  if (x.windDir != null) {
    const [ax, ay] = P(x.windDir, R - 2), [bx, by] = P(x.windDir, R * .34);
    s += `<line class="d-wind" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/><path class="d-wind-h" d="M0 -5L3.6 2.5L0 .8L-3.6 2.5Z" transform="translate(${bx} ${by}) rotate(${Math.round(norm360(x.windDir + 180))})"/>`;
  }
  if (x.dir != null) {
    const [ax, ay] = P(x.dir, R - 2), [bx, by] = P(x.dir, R * .17);
    s += `<line class="d-swell" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/><path class="d-swell-h" d="M0 -7L5 3L0 1L-5 3Z" transform="translate(${bx} ${by}) rotate(${Math.round(norm360(x.dir + 180))})"/>`;
  }
  s += `<g class="d-sweep" style="transform-origin:${c}px ${c}px"><path d="M${c} ${c}L${P(0, R).join(' ')}A${R} ${R} 0 0 1 ${P(38, R).join(' ')}Z"/></g>`;
  return s + '</svg>';
}
function sectorIcon(key) {
  const pos = { sok: 3, cas: 11, jum: 19 }[key] || 11;
  return el('span', { class: 'sector-ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 22 14" width="22" height="14"><path d="M1 10 Q11 4 21 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="${pos}" cy="${pos === 11 ? 7 : 8.6}" r="3" fill="var(--sea)"/></svg>` });
}
const windChip = (x, short) => el('span', { class: `wl ${x.windI.tone}`, text: short ? x.windI.short : x.windI.label });
function scoreBadge(x) {
  if (!x.ok) return '–';
  if (x.danger) return el('span', { class: 'sc bad', title: 'HEAVY (Nivel Medio)', 'aria-label': 'Heavy, peligroso para nivel medio', text: '🚫' });
  return el('span', { class: `sc ${scoreClass(x.score)}`, text: f1(x.score) });
}
function flagFor(x, grey) {
  if (!x.ok) return null;
  if (x.danger) return el('span', { class: 'flag bad', text: '🚫 HEAVY (Nivel Medio)' });
  if (grey) return el('span', { class: 'flag gz', text: '⚠️ POSIBLE BAÑO / REVISAR MANUALMENTE' });
  if (x.flat) return el('span', { class: 'flag flat', text: 'Plato / Solo tablón grande' });
  return null;
}
function condList(x) {
  const dl = el('dl', { class: 'cond' });
  const add = (k, v, sub) => dl.append(el('div', {}, el('dt', { text: k }), el('dd', {}, v, sub ? el('small', {}, sub) : null)));
  add('Boya', `${f1(x.open)} m`, `Hendaya ~${f1(x.shore)} m`);
  add('Swell', `${compass(x.dir)}, ${f0(x.per)} s`, x.perI.label);
  add('Energía', `${fk(x.en.kj)} kJ`, x.en.label);
  add('Viento', `${f0(x.wind)} kn ${compass(x.windDir)}`, windChip(x));
  if (x.tide) add('Marea', `${tideLabel(x.tide.rel)} (${Math.round(x.tide.rel * 100)} %)`, x.tide.rising ? 'subiendo' : 'bajando');
  return dl;
}
function greySummary(g) {
  const p = g.peak;
  let t = `Repunte a ${f1(p.open)} m en boya con viento ${p.windI.label}; con la última luz había ${f1(g.ref.open)} m`;
  if (g.tideNear) t += `. Cerca de la ${g.tideNear.type === 'high' ? 'pleamar' : 'bajamar'} de las ${hm(g.tideNear.min)}`;
  return t;
}
function renderHero() {
  const hero = $('#hero'), now = nowP();
  const { next, best } = state.plan;
  const pick = next || best;
  const kids = [];
  const title = next ? 'Próxima mejor ventana' : best ? `Ninguna ventana llega a ${f0(S.goodScore)} esta semana` : 'Sin huecos con luz';
  kids.push(el('div', { class: 'hero-head' }, el('h2', { class: 'hero-label', text: title }), el('span', { class: 'coords', text: '43°22′ N  1°46′ W' })));
  if (!pick) {
    const anyDanger = state.days.some(d => d.dangerSome);
    kids.push(el('p', { class: 'lead', text: anyDanger ? 'No hay huecos con luz y mar asequible para nivel medio en los próximos 7 días.' : 'No hay huecos con luz en tus horarios en los próximos 7 días.' }),
      el('div', { class: 'btn-row' },
        state.vacation ? null : el('button', { class: 'btn', type: 'button', onclick: () => setVacation(true), text: 'Probar en Modo Vacaciones' }),
        el('button', { class: 'btn ghost', type: 'button', onclick: openSettings, text: 'Revisar mis horarios' })));
  } else {
    const { d, f } = pick, x = f.peakHour, sec = SECTORS[x.sector.key];
    if (!next) kids.push(el('p', { class: 'sub', text: 'La mejor opción disponible es esta:' }));
    const live = d.date === now.date && f.bs <= now.min + 5;
    kids.push(el('div', { class: 'hero-main' },
      el('div', {},
        el('p', { class: 'when-day', text: dayLong(d.date, now) }),
        el('p', { class: 'when-time', text: live ? `Ya, hasta las ${hm(f.be)}` : `${hm(f.bs)}–${hm(f.be)}` }),
        el('p', { class: 'when-sector' }, sectorIcon(x.sector.key), el('span', { text: `${sec.name} (${sec.zone})` }))),
      el('div', { class: 'score-big', role: 'img', 'aria-label': `Puntuación ${f1(f.peak)} sobre 10` }, el('span', { class: 'n', text: f1(f.peak) }), el('span', { class: 'of', text: 'sobre 10' }))));
    kids.push(el('div', { class: 'hero-body' },
      el('div', { class: 'dial-box' }, el('div', { class: 'dial', html: dialSVG(x, 132) }),
        el('div', { class: 'dial-key' },
          el('span', {}, el('i'), 'Swell'), el('span', {}, el('i', { class: 'w' }), 'Viento'),
          el('span', {}, el('i', { class: 'ok' }), 'Óptima'), el('span', {}, el('i', { class: 'bl' }), 'Tapada por Higuer'))),
      condList(x)));
    kids.push(el('p', { class: 'why', text: `${x.sector.why}.` }));
    if (f.bs !== f.s || f.be !== f.e) kids.push(el('p', { class: 'fine', style: 'margin-top:4px', text: `Hueco con luz completo: ${hm(f.s)}–${hm(f.e)}.` }));
    kids.push(el('div', { class: 'actions-row' }, el('button', { class: 'btn small', type: 'button', onclick: () => selectDay(state.days.indexOf(d), x.min, 'detail'), text: 'Ver ese día hora a hora' })));
  }
  const greys = state.days.filter(d => d.grey);
  if (greys.length) {
    kids.push(el('div', { class: 'gz-box' },
      el('p', { class: 'gz-title', text: '⚠️ POSIBLE BAÑO / REVISAR MANUALMENTE' }),
      el('ul', { class: 'gz-list' }, greys.map(d => el('li', {},
        el('button', { class: 'gz-item', type: 'button', onclick: () => selectDay(state.days.indexOf(d), d.grey.peak.min, 'gz') },
          el('span', { class: 'gz-when', text: `${dayShortRel(d.date, now)}, ${hm(d.grey.peak.min)}` }),
          el('span', { class: 'gz-what', text: greySummary(d.grey) })))))));
  }
  const dangers = state.days.filter(d => d.dangerSome);
  if (dangers.length) {
    kids.push(el('div', { class: 'danger-note' },
      el('b', { text: '🚫 HEAVY (Nivel Medio)' }),
      el('ul', {}, dangers.map(d => el('li', {},
        el('button', { class: 'link', type: 'button', onclick: () => selectDay(state.days.indexOf(d), d.dangerSpan[0], 'detail') },
          `${dayShortRel(d.date, now)}: ${d.dangerSpan[0] === d.dangerSpan[1] ? `a las ${hm(d.dangerSpan[0])}` : `de ${hm(d.dangerSpan[0])} a ${hm(d.dangerSpan[1])}`}`))))));
  }
  kids.push(el('span', { class: 'grad-b', 'aria-hidden': 'true' }));
  hero.replaceChildren(...kids);
}
const STATUS = {
  good: ['✓', 'Bueno', 'Bueno'], check: ['!', 'Revisar', 'Revisar'], off: ['✕', 'Descartado', 'Descartado'],
  flat: ['≈', 'Plato / Solo tablón grande', 'Plato'], danger: ['🚫', 'HEAVY (Nivel Medio)', 'HEAVY']
};
const statusChip = (d, short) => el('span', { class: `st ${d.status}`, title: STATUS[d.status][1] }, el('span', { 'aria-hidden': 'true', text: STATUS[d.status][0] }), short ? STATUS[d.status][2] : STATUS[d.status][1]);
function renderTabs() {
  const wrap = $('#days'), now = nowP();
  wrap.replaceChildren(...state.days.map((d, i) => {
    const x = d.show;
    return el('button', { class: `day-tab${d.status === 'danger' ? ' is-danger' : ''}`, type: 'button', role: 'tab', id: `tab-${i}`, 'aria-selected': i === state.dayIdx ? 'true' : 'false', 'aria-controls': 'detail', onclick: () => selectDay(i, null, 'auto') },
      el('span', { class: 'dt-day', text: dayShortRel(d.date, now) }),
      el('span', { class: 'dt-chips' }, statusChip(d, true),
        d.dangerSome && d.status !== 'danger' ? el('span', { class: 'st danger', text: '🚫 Heavy a ratos' }) : null,
        d.grey ? el('span', { class: 'st gz', text: '⚠ Posible baño' }) : null),
      el('span', { class: 'dt-light', text: `Luz ${hm(d.rise)}–${hm(d.set)}` }),
      x ? el('span', { class: 'dt-size' }, el('b', { text: `~${f1(x.shore)} m` }), ' Hendaya') : el('span', { class: 'dt-light', text: 'Sin datos de oleaje' }),
      x ? el('span', { class: 'dt-per', text: `Boya ${f1(x.open)} m, ${f0(x.per)} s` }) : null,
      x ? el('span', { class: 'dt-wind' }, arrowEl(x.windDir), el('span', {}, `${f0(x.wind)} kn `, windChip(x, true))) : null,
      x ? el('span', { class: 'dt-sector' }, ...(x.sector ? [sectorIcon(x.sector.key), SECTORS[x.sector.key].name.split(' / ')[0]] : ['No recomendado'])) : null);
  }));
}
function tideLine(d) {
  const ex = d.tideEx.filter(e => e.min >= 0 && e.min < 1440);
  if (state.tide.mode === 'none' || !ex.length) {
    return el('p', { class: 'tides' }, el('span', { class: 'muted', text: 'Mareas sin datos del modelo.' }), el('button', { class: 'btn small ghost', type: 'button', onclick: openSettings, text: 'Introducir una pleamar' }));
  }
  const p = el('p', { class: 'tides' });
  for (const e of ex) p.append(el('span', { class: 'tchip' }, el('b', { text: e.type === 'high' ? 'Pleamar' : 'Bajamar' }), ` ${hm(e.min)}`,
    state.tide.mode === 'model' ? el('small', { text: ` ${e.val >= 0 ? '+' : '−'}${f1(Math.abs(e.val))} m` }) : null));
  if (state.tide.mode === 'manual') p.append(el('small', { class: 'muted', text: 'Estimadas con tu pleamar de referencia.' }));
  else if (S.tideOffset) p.append(el('small', { class: 'muted', text: `Ajustadas ${S.tideOffset > 0 ? '+' : '−'}${Math.abs(S.tideOffset)} min con la tabla oficial.` }));
  return p;
}
function franjaList(d, now) {
  const box = el('div', { class: 'franjas' }, el('h3', { class: 'block-title', text: state.vacation ? 'Mejores franjas con luz (Modo Vacaciones)' : 'Tus mejores franjas con luz' }));
  if (!d.franjas.length) {
    const msg = d.status === 'danger' ? 'Ninguna franja con luz es asequible para nivel medio: mar heavy.'
      : d.date === now.date ? 'Hoy ya no quedan huecos con luz en tu horario.' : 'Este día no hay huecos con luz en tu horario.';
    box.append(el('p', { class: 'muted', text: msg }));
    return box;
  }
  box.append(el('ul', { class: 'fr-list' }, d.franjas.map(f => {
    const x = f.peakHour, sec = SECTORS[x.sector.key];
    return el('li', { class: 'fr' },
      el('span', { class: `sc ${scoreClass(f.peak)}`, text: f1(f.peak) }),
      el('div', {},
        el('p', { class: 'fr-time' }, el('b', { text: `${hm(f.bs)}–${hm(f.be)}` }), f.short ? el('span', { class: 'tag', text: 'Ventana corta' }) : null, x.flat ? el('span', { class: 'flag flat', text: 'Plato / Solo tablón grande' }) : null),
        el('p', { class: 'fr-sec', text: `${sec.name} (${sec.zone})` }),
        el('p', { class: 'fr-meta' }, `Boya ${f1(x.open)} m, Hendaya ~${f1(x.shore)} m, ${compass(x.dir)} ${f0(x.per)} s, ${fk(x.en.kj)} kJ, viento ${f0(x.wind)} kn `, windChip(x, true)),
        (f.bs !== f.s || f.be !== f.e) ? el('p', { class: 'fine', text: `Hueco completo: ${hm(f.s)}–${hm(f.e)}` }) : null),
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => selectHour(clamp(x.min, H0, H1), true), text: 'Ver hora' }));
  })));
  return box;
}
function greyBanner(d) {
  const g = d.grey;
  return el('button', { class: 'gz-banner', type: 'button', onclick: () => { const c = $('#gzCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    el('b', { text: '⚠️ POSIBLE BAÑO / REVISAR MANUALMENTE' }),
    el('span', { text: `${hm(g.peak.min)}: ${greySummary(g)}. Ver la evolución horaria.` }));
}
function evolutionTable(d, g) {
  const from = Math.max(H0, g.peak.min - 240);
  const rows = d.hours.filter(x => x.ok && x.min >= from && x.min <= g.peak.min);
  return el('div', { class: 'evo-wrap' }, el('table', { class: 'evo' },
    el('thead', {}, el('tr', {}, ['Hora', 'Luz', 'Boya → Hendaya', 'Viento', 'Nota'].map(t => el('th', { scope: 'col', text: t })))),
    el('tbody', {}, rows.map(x => {
      const b = bandAt(d, x.min), inEntry = g.entry && x.min + 30 > g.entry.s && x.min - 30 < g.entry.e;
      return el('tr', { class: [x.min === g.peak.min ? 'pk' : '', inEntry ? 'en' : ''].join(' ').trim() || null },
        el('th', { scope: 'row', text: hm(x.min) }),
        el('td', {}, el('span', { class: `lt ${b.cls}`, text: b.short })),
        el('td', { text: `${f1(x.open)} → ~${f1(x.shore)} m` }),
        el('td', {}, `${f0(x.wind)} kn `, windChip(x, true)),
        el('td', {}, scoreBadge(x)));
    }))));
}
function greyCard(d) {
  const g = d.grey, p = g.peak;
  const card = el('section', { class: 'gz-card', id: 'gzCard' }, el('h3', { class: 'gz-title', text: '⚠️ POSIBLE BAÑO / REVISAR MANUALMENTE' }));
  card.append(el('ul', { class: 'gz-reasons' },
    el('li', {}, `Repunte surfeable a las ${hm(p.min)}: ${f1(p.open)} m en boya (Hendaya ~${f1(p.shore)} m), ${f0(p.per)} s y ${fk(p.en.kj)} kJ, con viento de ${f0(p.wind)} kn `, windChip(p), '.'),
    el('li', { text: `Con la última luz buena (${hm(g.ref.min)}) había ${f1(g.ref.open)} m en boya y viento ${g.ref.windI.label}.` }),
    el('li', { text: `El sol se pone a las ${hm(d.set)} y oscurece del todo a las ${hm(d.dusk)}.` }),
    g.tideNear ? el('li', { text: `Coincide con la ${g.tideNear.type === 'high' ? 'pleamar' : 'bajamar'} de las ${hm(g.tideNear.min)}.` }) : null));
  if (g.entry) {
    const en = g.entry;
    card.append(el('p', { class: 'gz-entry', text: `Valora entrar de ${hm(en.s)} a ${hm(en.e)}: entre 1 y 2 h antes del repunte, todavía con luz.` }));
    if (en.ratio != null) {
      const pct = Math.round(en.ratio * 100);
      const txt = en.ratio >= .85 ? `A las ${hm(en.s)} ya habría ${f1(en.openAt)} m en boya (${pct} % del repunte): el mar debería haber entrado con luz.`
        : en.ratio >= .65 ? `A las ${hm(en.s)} habría ${f1(en.openAt)} m en boya (${pct} % del repunte): entrará a medias. Compruébalo en la cámara.`
        : `A las ${hm(en.s)} solo habría ${f1(en.openAt)} m en boya (${pct} % del repunte): probablemente el mar entre ya sin luz.`;
      card.append(el('p', { class: 'gz-verdict', text: txt }));
    }
  } else card.append(el('p', { class: 'gz-verdict', text: 'En tu horario no queda luz para adelantarte ese día.' }));
  card.append(el('h4', { class: 'gz-sub', text: 'Evolución horaria previa' }), evolutionTable(d, g));
  card.append(el('div', { class: 'gz-chart', id: 'gzChart', role: 'img', 'aria-label': 'Curva del swell en las horas previas al repunte' }));
  card.append(el('p', { class: 'fine', text: 'Barras: Hendaya estimada. Línea: boya. Recuadro discontinuo: entrada sugerida. Punto: repunte.' }));
  card.append(el('div', { class: 'mini-links' }, LINKS.filter(l => l.id === 'viewsurf' || l.id === 'surfforecast').map(l => el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label, el('span', { 'aria-hidden': 'true', html: ICON_EXT })))));
  return card;
}
