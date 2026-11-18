'use strict';
function legendBlock() {
  const it = (cls, txt) => el('span', {}, el('i', { class: `sw ${cls}` }), txt);
  return el('div', { class: 'legend' }, it('bar', 'Hendaya estimada (m)'), it('line', 'Boya / mar abierto (m)'), it('free', 'Luz diurna disponible'), it('tw', 'Zona gris (crepúsculo)'), state.vacation ? null : it('busy', 'Franja de trabajo'), it('night', 'Noche cerrada'));
}
function hourlyTable(d) {
  const now = nowP();
  const greyMins = new Set(d.grey ? d.grey.hits.map(h => h.x.min) : []);
  const cols = ['Hora', 'Estado', 'Nota', 'Aviso', 'Boya → Hendaya', 'Período', 'Energía', 'Swell', 'Viento', 'Marea', 'Sector'];
  const body = el('tbody');
  for (const x of d.hours) {
    if (x.min < H0 || x.min > H1) continue;
    const b = bandAt(d, x.min), isNow = d.date === now.date && Math.floor(now.min / 60) * 60 === x.min;
    const cls = ['hr', `st-${b.cls}`, x.danger ? 'is-danger' : '', x.flat ? 'is-flat' : '', greyMins.has(x.min) ? 'is-grey' : '', isNow ? 'is-now' : ''].filter(Boolean).join(' ');
    body.append(el('tr', { class: cls, 'data-m': x.min, tabindex: '0', 'aria-label': `${hm(x.min)}, ${b.label}`,
      onclick: () => selectHour(x.min, false), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectHour(x.min, false); } } },
      el('th', { scope: 'row', class: 'c-time' }, el('b', { text: hm(x.min) }), isNow ? el('small', { text: 'ahora' }) : null),
      el('td', { class: 'c-state' }, el('span', { class: `lt ${b.cls}`, text: b.label })),
      el('td', { class: 'c-score' }, scoreBadge(x)),
      el('td', { class: 'c-flag' }, flagFor(x, greyMins.has(x.min))),
      el('td', { class: 'c-size' }, ...(x.ok ? [el('span', { class: 'k', text: 'Boya ' }), `${f1(x.open)} m`, el('span', { class: 'to', text: ' → ' }), el('span', { class: 'k', text: 'Hendaya ' }), el('b', { text: `~${f1(x.shore)} m` })] : ['Sin datos de oleaje'])),
      el('td', { class: 'c-per' }, x.ok ? `${f0(x.per)} s` : '–'),
      el('td', { class: 'c-en' }, x.ok ? `${fk(x.en.kj)} kJ` : '–'),
      el('td', { class: 'c-swell' }, ...(x.ok ? [arrowEl(x.dir, 'sw'), ` ${compass(x.dir)} `, el('small', { text: `${Math.round(norm360(x.dir))}°` })] : ['–'])),
      el('td', { class: 'c-wind' }, ...(x.windDir != null ? [arrowEl(x.windDir), ` ${f0(x.wind)} kn ${compass(x.windDir)} `, windChip(x)] : ['–'])),
      el('td', { class: 'c-tide' }, ...(x.tide ? [el('span', { class: 'k', text: 'Marea ' }), `${Math.round(x.tide.rel * 100)} % ${x.tide.rising ? '▲' : '▼'}`, el('small', { text: ` ${tideLabel(x.tide.rel).toLowerCase()}` })] : [el('span', { class: 'k', text: 'Marea ' }), '–'])),
      el('td', { class: 'c-sector' }, el('span', { class: 'k', text: 'Sector ' }), x.ok ? (x.sector ? SECTORS[x.sector.key].name : 'No recomendado') : '–')));
  }
  return el('div', { class: 'hh-wrap' }, el('table', { class: 'hh', id: 'hourTable' },
    el('caption', { class: 'sr', text: `Previsión hora a hora del ${dayFull(d.date)}, de 06:00 a 22:00` }),
    el('thead', {}, el('tr', {}, cols.map(t => el('th', { scope: 'col', text: t })))), body));
}
function renderDetail() {
  const d = state.days[state.dayIdx], box = $('#detail'), now = nowP();
  if (!d) { box.replaceChildren(); state.renderedDate = null; return; }
  state.renderedDate = d.date;
  box.setAttribute('aria-labelledby', `tab-${state.dayIdx}`);
  const chartWrap = el('div', { class: 'chart-wrap', id: 'chartWrap', tabindex: '0', role: 'group', 'aria-label': 'Gráfico de 06:00 a 22:00. Usa las flechas izquierda y derecha para cambiar de hora.' });
  chartWrap.addEventListener('click', e => pickHour(e, chartWrap));
  chartWrap.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pickHour(e, chartWrap); });
  chartWrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); selectHour((state.hour || H0) + (e.key === 'ArrowRight' ? 60 : -60), false); }
  });
  const best = d.best;
  box.replaceChildren(...[
    el('div', { class: 'det-head' }, el('h2', { text: dayFull(d.date) }),
      el('div', { class: 'chips' }, statusChip(d), d.dangerSome && d.status !== 'danger' ? el('span', { class: 'st danger', text: '🚫 Heavy a ratos' }) : null, d.grey ? el('span', { class: 'st gz', text: '⚠ Posible baño' }) : null)),
    el('p', { class: 'det-light' }, `Luz útil ${hm(d.dawn)}–${hm(d.dusk)} `, el('small', { text: `(amanecer ${hm(d.rise)}, atardecer ${hm(d.set)}, más ${S.twilight} min de crepúsculo)` })),
    tideLine(d),
    best ? el('p', { class: 'det-best' }, 'Mejor franja: ', el('b', { text: `${hm(best.bs)}–${hm(best.be)}` }), ` con nota ${f1(best.peak)} en ${SECTORS[best.peakHour.sector.key].name}.`) : null,
    d.dangerSome ? el('p', { class: 'danger-note' }, el('b', { text: '🚫 HEAVY (Nivel Medio)' }), ` ${d.dangerSpan[0] === d.dangerSpan[1] ? `a las ${hm(d.dangerSpan[0])}` : `de ${hm(d.dangerSpan[0])} a ${hm(d.dangerSpan[1])}`}: exceso de tamaño o de corriente. Esas horas no se recomiendan.`) : null,
    d.grey ? greyBanner(d) : null,
    el('section', { class: 'panel', id: 'hourPanel' },
      el('div', { class: 'panel-head' }, el('h3', { class: 'block-title', text: 'Hora a hora, de 06:00 a 22:00' }), el('span', { class: 'fine', text: state.vacation ? 'Modo Vacaciones: todas las horas con luz' : 'Horario laboral' })),
      legendBlock(), chartWrap,
      el('div', { id: 'readLine', class: 'readline', 'aria-live': 'polite' }),
      hourlyTable(d),
      el('p', { class: 'table-key', text: 'Toca una fila o una hora del gráfico para resaltarla. Las flechas indican hacia dónde va el swell o el viento. Marea: 0 % es bajamar y 100 % pleamar; ▲ subiendo, ▼ bajando.' })),
    franjaList(d, now),
    d.grey ? greyCard(d) : null
  ].filter(Boolean));
  drawCharts(); renderReadLine(); highlightRows(false);
}
function selectHour(m, scrollRow) {
  state.hour = clamp(Math.round(m / 60) * 60, H0, H1);
  drawCharts(true); renderReadLine(); highlightRows(scrollRow);
}
function pickHour(e, wrap) {
  const svg = wrap.querySelector('svg'); if (!svg) return;
  const r = svg.getBoundingClientRect();
  const from = +svg.dataset.from, to = +svg.dataset.to, padL = +svg.dataset.padl, pw = +svg.dataset.pw, W = +svg.getAttribute('width');
  const px = (e.clientX - r.left) * (W / r.width);
  const h = clamp(Math.round((from + (px - padL) / pw * (to - from)) / 60) * 60, H0, H1);
  if (h !== state.hour) selectHour(h, false);
}
function highlightRows(scroll) {
  const tb = $('#hourTable'); if (!tb) return;
  tb.querySelectorAll('tr.sel').forEach(n => n.classList.remove('sel'));
  const tr = tb.querySelector(`tr[data-m="${state.hour}"]`);
  if (tr) { tr.classList.add('sel'); if (scroll) tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function renderReadLine() {
  const box = $('#readLine'); if (!box) return;
  const d = state.days[state.dayIdx], x = d && d.hours.find(h => h.min === state.hour);
  if (!x) { box.replaceChildren(el('span', { class: 'muted', text: 'Toca una hora del gráfico o de la tabla.' })); return; }
  if (!x.ok) { box.replaceChildren(el('b', { text: hm(x.min) }), el('span', { class: 'muted', text: 'Sin datos de oleaje para esta hora.' })); return; }
  const b = bandAt(d, x.min);
  box.replaceChildren(...[
    el('b', { text: hm(x.min) }), el('span', { class: `lt ${b.cls}`, text: b.label }), scoreBadge(x),
    x.danger ? el('span', { class: 'flag bad', text: '🚫 HEAVY (Nivel Medio)' }) : x.flat ? el('span', { class: 'flag flat', text: 'Plato / Solo tablón grande' }) : null,
    el('span', { text: `Boya ${f1(x.open)} m → Hendaya ~${f1(x.shore)} m` }),
    el('span', { text: `${f0(x.per)} s, ${fk(x.en.kj)} kJ` }),
    el('span', {}, arrowEl(x.dir, 'sw'), ` ${compass(x.dir)}`),
    el('span', {}, arrowEl(x.windDir), ` ${f0(x.wind)} kn ${compass(x.windDir)} `, windChip(x)),
    x.tide ? el('span', { text: `Marea ${Math.round(x.tide.rel * 100)} % ${x.tide.rising ? '▲' : '▼'}` }) : null,
    el('span', { text: x.sector ? SECTORS[x.sector.key].name : 'No recomendado' })
  ].filter(v => v != null));
}
function drawCharts(mainOnly) {
  const d = state.days[state.dayIdx]; if (!d) return;
  const w = $('#chartWrap');
  if (w) w.innerHTML = chartSVG(d, { width: w.clientWidth, from: H0 - 30, to: H1 + 30, id: 'm' });
  if (mainOnly) return;
  const g = $('#gzChart');
  if (g && d.grey) {
    const from = Math.max(H0, d.grey.peak.min - 300) - 30, to = Math.min(23 * 60, Math.max(d.grey.peak.min + 60, H1)) + 30;
    g.innerHTML = chartSVG(d, { width: g.clientWidth, from, to, id: 'g', mini: true });
  }
}
function barPath(cx, w, yTop, yBase, r) {
  const h = yBase - yTop; if (h < .5) return '';
  r = Math.min(r, w / 2, h);
  const x0 = (cx - w / 2).toFixed(1), x1 = (cx + w / 2).toFixed(1);
  return `M${x0} ${yBase}V${(yTop + r).toFixed(1)}Q${x0} ${yTop.toFixed(1)} ${(cx - w / 2 + r).toFixed(1)} ${yTop.toFixed(1)}H${(cx + w / 2 - r).toFixed(1)}Q${x1} ${yTop.toFixed(1)} ${x1} ${(yTop + r).toFixed(1)}V${yBase}Z`;
}
function chartSVG(d, o) {
  const W = Math.max(280, Math.floor(o.width || 340)), from = o.from, to = o.to, mini = !!o.mini, id = o.id;
  const padL = 44, padR = 8, pw = W - padL - padR;
  const X = m => padL + (m - from) / (to - from) * pw;
  const bw = pw / ((to - from) / 60);
  const hrs = d.hours.filter(x => x.min > from && x.min < to), okH = hrs.filter(x => x.ok);
  const showTide = !mini && state.tide.mode !== 'none';
  const aTop = 18, aH = mini ? 96 : 124, aBot = aTop + aH;
  const bTop = aBot + (mini ? 0 : 10), bH = mini ? 0 : 20, bBot = bTop + bH;
  const cTop = bBot + (showTide ? 14 : 0), cH = showTide ? 44 : 0, cBot = cTop + cH;
  const rTop = cBot + (mini ? 0 : showTide ? 18 : 10), rH = mini ? 0 : 40, rBot = rTop + rH;
  const xTop = rBot + 4, H = xTop + 14;
  const bandBot = mini ? aBot : cBot;
  let s = `<svg class="chart" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-from="${from}" data-to="${to}" data-padl="${padL}" data-pw="${pw}" aria-hidden="true">`;
  s += `<defs><pattern id="hp-${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="hatch-line"/></pattern></defs>`;
  for (const g of bandSegments(d, from, to)) {
    const x1 = X(g.a), x2 = X(g.b);
    s += `<rect class="band ${g.cls}" x="${x1.toFixed(1)}" y="${aTop}" width="${(x2 - x1).toFixed(1)}" height="${bandBot - aTop}"${g.cls === 'busy' ? ` fill="url(#hp-${id})"` : ''}/>`;
  }
  if (!mini && state.hour != null && state.hour > from && state.hour < to) s += `<rect class="selcol" x="${(X(state.hour) - bw / 2).toFixed(1)}" y="${aTop - 4}" width="${bw.toFixed(1)}" height="${rBot - aTop + 4}" rx="3"/>`;
  // Alturas: Hendaya (barras) y boya (línea), con el tope de seguridad si se acerca
  const maxOpen = okH.length ? Math.max(...okH.map(x => x.open)) : 1;
  const showCap = maxOpen > S.maxOpen - .6;
  const yMax = Math.max(1, Math.ceil((Math.max(maxOpen, showCap ? S.maxOpen : 0) + .2) * 2) / 2), step = yMax <= 2 ? .5 : 1;
  const YA = v => aBot - v / yMax * aH;
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    const y = YA(v).toFixed(1), lab = f1(v).replace(',0', '');
    s += `<line class="${v === 0 ? 'base' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"/>`;
    s += `<text x="${padL - 6}" y="${y}" dy=".32em" text-anchor="end">${v + step > yMax + 1e-9 ? lab + ' m' : lab}</text>`;
  }
  if (showCap) {
    const yc = YA(S.maxOpen).toFixed(1);
    s += `<line class="cap" x1="${padL}" x2="${W - padR}" y1="${yc}" y2="${yc}"/><text class="captxt" x="${W - padR - 2}" y="${(+yc - 4).toFixed(1)}" text-anchor="end">Tope ${f1(S.maxOpen)} m</text>`;
  }
  const barW = Math.max(3, Math.min(14, bw * .6));
  for (const x of okH) s += `<path class="bar" d="${barPath(X(x.min), barW, YA(x.shore), aBot, 3)}"/>`;
  if (okH.length > 1) s += `<polyline class="buoy" points="${okH.map(x => `${X(x.min).toFixed(1)},${YA(x.open).toFixed(1)}`).join(' ')}"/>`;
  if (okH.length) {
    const mo = okH.reduce((b, x) => (x.open > b.open ? x : b));
    s += `<text class="plabel" x="${clamp(X(mo.min), padL + 16, W - padR - 16).toFixed(1)}" y="${(YA(mo.open) - 7).toFixed(1)}" text-anchor="middle">${f1(mo.open)}</text>`;
    const ms = okH.reduce((b, x) => (x.shore > b.shore ? x : b));
    if (YA(ms.shore) - YA(ms.open) > 18) s += `<text class="plabel" x="${clamp(X(ms.min), padL + 12, W - padR - 12).toFixed(1)}" y="${(YA(ms.shore) - 5).toFixed(1)}" text-anchor="middle">${f1(ms.shore)}</text>`;
    const sx = okH.find(x => x.min === state.hour);
    if (sx && !mini) s += `<circle class="dot buoy-dot" cx="${X(sx.min).toFixed(1)}" cy="${YA(sx.open).toFixed(1)}" r="4"/>`;
  }
  // Nota por hora (rojo con «!» si está HEAVY)
  if (!mini) {
    s += `<text class="lbl" x="${padL - 6}" y="${bTop + bH / 2}" dy=".32em" text-anchor="end">Nota</text>`;
    for (const x of okH) {
      const k = x.danger ? 'dz' : scoreClass(x.score), cx = X(x.min);
      s += `<rect class="cell ${k}" x="${(cx - bw / 2 + 1).toFixed(1)}" y="${bTop}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bH}" rx="3"/>`;
      if (bw >= 11) s += `<text class="celltxt ${k}" x="${cx.toFixed(1)}" y="${bTop + bH / 2}" dy=".34em" text-anchor="middle">${x.danger ? '!' : Math.round(x.score)}</text>`;
    }
  }
  if (showTide) {
    s += `<text class="lbl" x="${padL - 6}" y="${cTop + cH / 2}" dy=".32em" text-anchor="end">Marea</text>`;
    const pts = [];
    for (let m = from; m <= to; m += 15) { const t = state.tide.fn(absOf(d.date, m)); if (t) pts.push([m, t.level]); }
    if (pts.length > 2) {
      let lo = Infinity, hi = -Infinity; for (const [, v] of pts) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const YC = v => cBot - 4 - (v - lo) / ((hi - lo) || 1) * (cH - 16);
      s += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${cBot}" y2="${cBot}"/>`;
      s += `<polyline class="tideline" points="${pts.map(([m, v]) => `${X(m).toFixed(1)},${YC(v).toFixed(1)}`).join(' ')}"/>`;
      for (const e of d.tideEx) {
        if (e.min <= from || e.min >= to) continue;
        const ex = X(e.min), ey = YC(e.val), high = e.type === 'high';
        s += `<circle class="dot tidedot" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5"/>`;
        s += `<text class="tlabel" x="${clamp(ex, padL + 24, W - padR - 24).toFixed(1)}" y="${(high ? ey - 7 : ey + 14).toFixed(1)}" text-anchor="middle">${high ? 'PM' : 'BM'} ${hm(e.min)}</text>`;
      }
    }
  }
  if (!mini) {
    const r1 = rTop + 10, r2 = rTop + 30, every = bw >= 12 ? 1 : 2;
    s += `<text class="lbl" x="${padL - 6}" y="${r1}" dy=".32em" text-anchor="end">Swell</text><text class="lbl" x="${padL - 6}" y="${r2}" dy=".32em" text-anchor="end">Viento</text>`;
    for (const x of hrs) {
      if ((x.min / 60) % every) continue;
      const cx = X(x.min).toFixed(1);
      if (x.ok) s += `<path class="arr-sw" d="${ARROW_PATH}" transform="translate(${cx} ${r1}) rotate(${Math.round(norm360(x.dir + 180))}) scale(.9)"/>`;
      if (x.windDir != null) s += `<path class="arr-wd ${x.windI.tone}" d="${ARROW_PATH}" transform="translate(${cx} ${r2}) rotate(${Math.round(norm360(x.windDir + 180))}) scale(${(.65 + Math.min(1, (x.wind || 0) / 20) * .35).toFixed(2)})"/>`;
    }
  }
  const every = mini ? (bw >= 30 ? 1 : 2) : (bw >= 15 ? 2 : 3);
  for (let h = Math.ceil((from + 30) / 60); h * 60 < to; h++) {
    if (h % every) continue;
    s += `<text x="${X(h * 60).toFixed(1)}" y="${xTop + 9}" text-anchor="middle">${pad2(h)}</text>`;
  }
  const now = nowP();
  if (d.date === now.date && now.min > from && now.min < to) {
    const nx = X(now.min).toFixed(1);
    s += `<line class="nowline" x1="${nx}" x2="${nx}" y1="${aTop - 2}" y2="${bandBot}"/>`;
    if (!mini) s += `<text class="nowtxt" x="${clamp(+nx, padL + 14, W - padR - 14).toFixed(1)}" y="${aTop - 6}" text-anchor="middle">ahora</text>`;
  }
  if (mini && d.grey) {
    const g = d.grey;
    if (g.entry && g.entry.e > from && g.entry.s < to) {
      const x1 = X(Math.max(g.entry.s, from)), x2 = X(Math.min(g.entry.e, to));
      s += `<rect class="entry" x="${x1.toFixed(1)}" y="${aTop}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="${aH}" rx="2"/><text class="entrytxt" x="${((x1 + x2) / 2).toFixed(1)}" y="${aTop - 6}" text-anchor="middle">entrada</text>`;
    }
    if (d.dusk > from && d.dusk < to) {
      const dx = X(d.dusk);
      s += `<line class="dusk" x1="${dx.toFixed(1)}" x2="${dx.toFixed(1)}" y1="${aTop}" y2="${aBot}"/><text x="${clamp(dx + 4, padL, W - padR - 70).toFixed(1)}" y="${aTop + 10}">oscuro ${hm(d.dusk)}</text>`;
    }
    if (g.peak.min > from && g.peak.min < to) s += `<circle class="gzdot" cx="${X(g.peak.min).toFixed(1)}" cy="${YA(g.peak.open).toFixed(1)}" r="5"/>`;
  }
  return s + '</svg>';
}
function selectDay(i, hourMin, scrollTo) {
  if (i < 0 || i >= state.days.length) return;
  const d = state.days[i];
  state.dayIdx = i; state.selDate = d.date;
  state.hour = hourMin != null ? clamp(Math.round(hourMin / 60) * 60, H0, H1) : defaultHour(d, nowP());
  renderTabs(); renderDetail();
  const strip = $('#days'), tab = $(`#tab-${i}`);
  if (strip && tab && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: tab.offsetLeft - strip.clientWidth / 2 + tab.offsetWidth / 2, behavior: 'smooth' });
  const target = scrollTo === 'gz' ? $('#gzCard') : $('#detail');
  if (!target || !scrollTo) return;
  // Al tocar una pestaña, baja hasta el detalle solo si ha quedado fuera de la vista
  if (scrollTo === 'auto' && target.getBoundingClientRect().top < window.innerHeight * .7) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* =========================================================
   10. Ajustes: horarios, cálculo y mareas
   ========================================================= */
let draft = null, resetArmed = false;
function openSettings() {
  draft = JSON.parse(JSON.stringify(S)); resetArmed = false; $('#btnReset').textContent = 'Restablecer valores';
  buildSettings();
  $('#sheet').hidden = false; document.body.classList.add('noscroll');
  setTimeout(() => $('#setTitle').focus(), 30);
}
function closeSettings() { $('#sheet').hidden = true; document.body.classList.remove('noscroll'); $('#btnSettings').focus(); }
const hmIn = m => m >= 1440 ? '23:59' : hm(m);
function rangeRow(label, id, min, max, step, val, fmt, onInput, help) {
  const out = el('output', { for: id, text: fmt(val) });
  return el('div', { class: 'set-row' },
    el('label', { for: id, text: label }), out,
    el('input', { type: 'range', id, min, max, step, value: val, oninput: e => { const v = +e.target.value; out.textContent = fmt(v); onInput(v); } }),
    help ? el('p', { class: 'fine', text: help }) : null);
}
function tideStatusText() {
  const t = state.tide;
  if (t.mode === 'model') return S.tideOffset ? `Modelo de Open-Meteo, desplazado ${S.tideOffset > 0 ? '+' : '−'}${Math.abs(S.tideOffset)} min con tu pleamar de referencia.` : 'Modelo de Open-Meteo sin ajustar. Su precisión en la costa es limitada: conviene sincronizarlo.';
  if (t.mode === 'manual') return `Sin datos del modelo: estimadas a partir de tu pleamar del ${S.tideManual.date.split('-').reverse().join('/')} a las ${S.tideManual.time} (ciclo de 12 h 25 min, solo horas).`;
  return 'Sin datos de marea. Introduce la hora de una pleamar para estimarlas.';
}
function buildSettings() {
  const body = $('#sheetBody'), keep = body.scrollTop;
  const sw = el('section', { class: 'set-sec' },
    el('h3', { text: 'Mis ventanas disponibles (horario laboral)' }),
    el('p', { class: 'fine', text: 'Horas en las que podrías surfear cuando no estás de vacaciones. La app solo usa la parte con luz: del amanecer al atardecer, más el margen de crepúsculo.' }),
    state.vacation ? el('p', { class: 'note', text: 'El Modo Vacaciones está activado: ahora se puntúan todas las horas con luz. Estas ventanas vuelven a aplicarse al desactivarlo.' }) : null);
  for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
    const wins = draft.avail[dow];
    const list = el('div', { class: 'set-wins' });
    wins.forEach((w, i) => list.append(el('div', { class: 'set-win' },
      el('input', { type: 'time', value: hmIn(w[0]), 'aria-label': `${DOW_L[dow]}, desde`, onchange: e => { const v = parseHM(e.target.value); if (v != null) w[0] = v; } }),
      el('span', { text: 'a' }),
      el('input', { type: 'time', value: hmIn(w[1]), 'aria-label': `${DOW_L[dow]}, hasta`, onchange: e => { const v = parseHM(e.target.value); if (v != null) w[1] = v >= 1439 ? 1440 : v; } }),
      el('button', { class: 'icon-btn small', type: 'button', 'aria-label': `Quitar franja del ${DOW_L[dow]}`, onclick: () => { wins.splice(i, 1); buildSettings(); }, html: ICON_X }))));
    if (!wins.length) list.append(el('p', { class: 'fine', style: 'padding-top:7px', text: 'Sin franjas: día descartado.' }));
    list.append(el('button', { class: 'btn small ghost', type: 'button', onclick: () => { wins.push([1020, 1260]); buildSettings(); }, text: 'Añadir franja' }));
    sw.append(el('div', { class: 'set-day' }, el('p', { class: 'set-dayname', text: cap(DOW_L[dow]) }), list));
  }
  const ss = el('section', { class: 'set-sec' }, el('h3', { text: 'Tope de seguridad (nivel medio)' }),
    rangeRow('Altura máxima en boya', 'rMaxH', 2, 6, .1, draft.maxOpen, v => `${f1(v)} m`, v => { draft.maxOpen = v; }, 'Por encima, la hora se marca «🚫 HEAVY (Nivel Medio)» y nunca se recomienda.'),
    rangeRow('Energía máxima', 'rMaxE', 1000, 10000, 100, draft.maxEnergy, v => `${fk(v)} kJ`, v => { draft.maxEnergy = v; }, 'Por encima hay exceso de corriente y de tamaño. Basta con superar uno de los dos topes (altura o energía) para que la hora salga como HEAVY.'));
  const sc = el('section', { class: 'set-sec' }, el('h3', { text: 'Cálculo' }),
    rangeRow('Tamaño en Hendaya', 'rFactor', 30, 70, 5, Math.round(draft.shoreFactor * 100), v => `${v} %`, v => { draft.shoreFactor = v / 100; }, 'Regla de la mitad: porcentaje del mar abierto que llega a la orilla por la protección de Cabo Higuer.'),
    rangeRow('Margen de crepúsculo', 'rTw', 0, 45, 5, draft.twilight, v => `${v} min`, v => { draft.twilight = v; }, 'Minutos de luz útil antes del amanecer y después del atardecer.'),
    rangeRow('Nota para «Bueno»', 'rGood', 4, 8, .5, draft.goodScore, v => f1(v), v => { draft.goodScore = v; }, 'Desde esta nota un día cuenta como bueno y entra en «Próxima mejor ventana».'),
    rangeRow('Sesión mínima', 'rMin', 15, 90, 15, draft.minSession, v => `${v} min`, v => { draft.minSession = v; }, 'Los huecos con luz más cortos no se proponen.'));
  const today = nowP().date;
  const msg = el('p', { class: 'tide-msg', role: 'status' });
  const dIn = el('input', { type: 'date', value: (draft.tideManual && draft.tideManual.date) || today, 'aria-label': 'Fecha de la pleamar' });
  const tIn = el('input', { type: 'time', value: (draft.tideManual && draft.tideManual.time) || '', 'aria-label': 'Hora de la pleamar' });
  const st = el('section', { class: 'set-sec' }, el('h3', { text: 'Mareas' }),
    el('p', { class: 'fine', text: tideStatusText() }),
    el('p', { text: 'Para sincronizarlas, copia la hora de una pleamar de la tabla oficial:' }),
    el('div', { class: 'tide-form' },
      el('label', {}, 'Fecha', dIn), el('label', {}, 'Hora de la pleamar', tIn),
      el('button', { class: 'btn small', type: 'button', onclick: () => syncTide(dIn.value, tIn.value, msg), text: 'Sincronizar' })),
    msg,
    el('div', { class: 'btn-row', style: 'margin-top:4px' },
      (draft.tideOffset || draft.tideManual) ? el('button', { class: 'btn small ghost', type: 'button', onclick: () => { draft.tideOffset = 0; draft.tideManual = null; msg.className = 'tide-msg'; msg.textContent = 'Ajuste quitado. Pulsa Guardar.'; }, text: 'Quitar ajuste' }) : null,
      el('a', { class: 'btn small ghost', href: LINKS[4].url, target: '_blank', rel: 'noopener noreferrer' }, 'Tabla oficial', el('span', { 'aria-hidden': 'true', html: ICON_EXT }))));
  body.replaceChildren(sw, ss, sc, st);
  body.scrollTop = keep;
}
function syncTide(dateStr, timeStr, msg) {
  const m = parseHM(timeStr);
  const say = (t, err) => { msg.className = 'tide-msg' + (err ? ' err' : ''); msg.textContent = t; };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') || m == null) return say('Introduce la fecha y la hora de la pleamar.', true);
  const t = absOf(dateStr, m);
  const highs = state.tideRaw.filter(e => e.type === 'high');
  if (state.tide.mode !== 'manual' && highs.length >= 2) {
    const near = highs.reduce((b, e) => (Math.abs(e.abs - t) < Math.abs(b.abs - t) ? e : b));
    const off = Math.round(t - near.abs);
    if (Math.abs(off) > 240) return say('Esa hora no coincide con ninguna pleamar del modelo (más de 4 h de diferencia). Revisa la fecha.', true);
    draft.tideOffset = off; draft.tideManual = { date: dateStr, time: timeStr.slice(0, 5) };
    return say(`Listo: el modelo se desplaza ${off >= 0 ? '+' : '−'}${Math.abs(off)} min. Pulsa Guardar.`);
  }
  draft.tideManual = { date: dateStr, time: timeStr.slice(0, 5) }; draft.tideOffset = 0;
  say('Listo: mareas estimadas a partir de esta pleamar. Pulsa Guardar.');
}
function saveSettings() {
  for (let d = 0; d < 7; d++) draft.avail[d] = cleanWins(draft.avail[d]);
  S = normalizeSettings(draft);
  store.set(K_SET, S);
  closeSettings(); safeRender(true);
}

/* =========================================================
   11. Tema y arranque
   ========================================================= */
function effectiveTheme() { const t = document.documentElement.dataset.theme; if (t) return t; return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const b = $('#btnTheme'), dark = effectiveTheme() === 'dark';
  b.innerHTML = dark ? ICON_SUN : ICON_MOON;
  b.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  if (t === 'light' || t === 'dark') meta.forEach(m => m.setAttribute('content', t === 'dark' ? '#061018' : '#E8EFF1'));
}
$('#btnTheme').addEventListener('click', () => { const t = effectiveTheme() === 'dark' ? 'light' : 'dark'; store.set(K_THEME, t); applyTheme(t); });
$('#btnRefresh').addEventListener('click', () => load());
$('#btnSettings').addEventListener('click', openSettings);
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSettings(); });
$('#btnSave').addEventListener('click', saveSettings);
$('#btnReset').addEventListener('click', () => {
  if (!resetArmed) { resetArmed = true; $('#btnReset').textContent = 'Pulsa otra vez para confirmar'; return; }
  draft = JSON.parse(JSON.stringify(DEF)); resetArmed = false; $('#btnReset').textContent = 'Restablecer valores'; buildSettings();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSettings(); });
window.addEventListener('resize', debounce(() => drawCharts(false), 150));

function setVacation(v) { state.vacation = !!v; store.set(K_VAC, state.vacation); safeRender(true); }
$('#btnVac').addEventListener('click', () => setVacation(!state.vacation));

applyTheme(store.get(K_THEME, null));
renderLinks();
renderVac();
(function boot() {
  const c = store.get(K_CACHE, null);
  if (cacheUsable(c, nowP())) { state.raw = c; state.source = 'cache-boot'; safeRender(true); }
  else renderStatus();
  load();
})();
setInterval(() => { if (document.visibilityState === 'visible' && state.raw) safeRender(false); }, 5 * 60 * 1000);
setInterval(() => { if (document.visibilityState === 'visible' && state.source !== 'demo') load(); }, 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || state.source === 'demo') return;
  if (!state.raw || Date.now() - state.raw.fetchedAt > 20 * 60 * 1000) load(); else safeRender(false);
});

// Acceso para pruebas automáticas
window.HSR = { state, get S() { return S; }, analyze, windInfo, dirInfo, perInfo, energyInfo, detectExtremes, buildTide, tideAt, sunNOAA, parisParts, nowP, makeDemo, mergeRaw, recompute, startDemo, setVacation, splitSafe, setNow: n => { NOW_OVERRIDE = n; }, render: () => safeRender(true) };
