'use strict';
/* =========================================================
   13. Tabla recomendada y registro de sesiones
   ========================================================= */
// Este archivo evita las barras invertidas: el conector de GitHub puede transformarlas al subirlo
const DATA_REPO = 'D-Grandes/Surf_Radar_datos', DATA_API = `https://api.github.com/repos/${DATA_REPO}`;
const K_SURFERS = 'hsr:surfistas:v1', K_SESSIONS = 'hsr:sesiones:v1';
const FENCE = String.fromCharCode(96).repeat(3);
const LEVELS = ['principiante', 'intermedio', 'avanzado'];
const SURFER_DEF = { Estefy: { level: 'intermedio', weight: null, height: null }, David: { level: 'intermedio', weight: null, height: null } };
function loadSurfers() {
  const s = store.get(K_SURFERS, null), out = JSON.parse(JSON.stringify(SURFER_DEF));
  if (s && typeof s === 'object') for (const n of Object.keys(out)) if (s[n]) {
    if (LEVELS.includes(s[n].level)) out[n].level = s[n].level;
    for (const k of ['weight', 'height']) { const v = +s[n][k]; if (s[n][k] != null && isFinite(v) && v > 0) out[n][k] = v; }
  }
  return out;
}
let SURFERS = loadSurfers(), draftSurfers = null;

/* Tabla recomendada (orientativa, para nivel medio por defecto) */
// len: largo en pulgadas para 1,75 m de altura; adj: cuánto se ajusta con la altura; gf: litros por kg
const BOARDS = {
  long: { name: 'Tablón (longboard)', len: [108, 114], adj: 0, gf: [0.85, 1.0], why: 'Ola pequeña o floja: el tablón rema y coge casi todo' },
  mid: { name: 'Mid-length o evolutiva', len: [88, 96], adj: .5, gf: [0.62, 0.72], why: 'Ola pequeña: prima la remada sin renunciar a maniobrar' },
  fish: { name: 'Fish o híbrida con volumen', len: [68, 74], adj: 1, gf: [0.46, 0.52], why: 'Ola media con poca fuerza: volumen y anchura para no quedarse clavado' },
  short: { name: 'Tabla corta con volumen', len: [72, 76], adj: 1, gf: [0.41, 0.46], why: 'Ola con tamaño y fuerza: más control en la pared' },
  step: { name: 'Step-up (corta algo más larga)', len: [76, 81], adj: 1, gf: [0.42, 0.47], why: 'Mar grande y con período: más largo para remar antes y aguantar la velocidad' }
};
const LEVEL_GF = { principiante: .15, intermedio: 0, avanzado: -.05 };
const ftIn = i => `${Math.floor(i / 12)}'${i % 12}"`;
function boardKey(x, level) {
  if (!x || !x.ok || x.danger) return null;
  let k;
  if (x.flat || x.shore < .6) k = 'long';
  else if (x.shore < .9) k = 'mid';
  else if (x.shore < 1.3) k = x.en.kj >= 500 && x.per >= 10 ? 'short' : 'fish';
  else if (x.shore < 1.6) k = 'short';
  else k = 'step';
  if (level === 'principiante') k = { step: 'fish', short: 'fish', fish: 'mid' }[k] || k;
  return k;
}
function boardFor(x, p) {
  const k = boardKey(x, p.level); if (!k) return null;
  const b = BOARDS[k];
  const shift = p.height ? Math.round((p.height - 175) / 5 * b.adj) : 0;
  const len = b.len.map(v => v + shift);
  const messy = x.windI && (x.windI.tone === 'bad' || x.windI.tone === 'warn') && (k === 'fish' || k === 'short' || k === 'step');
  const g = (LEVEL_GF[p.level] || 0) + (messy ? .03 : 0);
  const vol = p.weight ? b.gf.map(f => Math.round(p.weight * (f + g))) : null;
  return { key: k, name: b.name, len: len.map(ftIn), vol, text: `${b.name}, ${ftIn(len[0])}–${ftIn(len[1])}${vol ? `, ${vol[0]}–${vol[1]} L` : ''}`, why: b.why + (messy ? '. Con viento revuelto, mejor tirar a más volumen' : '') };
}
// Cada medida en un bloque que no se parte de línea
const recParts = r => [`${r.name}, `, el('span', { class: 'nw', text: `${r.len[0]}–${r.len[1]}` }), r.vol ? ', ' : null, r.vol ? el('span', { class: 'nw', text: `${r.vol[0]}–${r.vol[1]} L` }) : null];
function boardBox(x, title) {
  if (!x || !x.ok) return null;
  if (x.danger) return el('div', { class: 'board-box' }, el('p', { class: 'board-title', text: title }), el('p', { class: 'fine', text: 'Ninguna: mar heavy para nivel medio.' }));
  const recs = Object.keys(SURFERS).map(n => ({ n, r: boardFor(x, SURFERS[n]) })).filter(o => o.r);
  if (!recs.length) return null;
  const same = recs.every(o => o.r.text === recs[0].r.text);
  const noWeight = Object.keys(SURFERS).some(n => !SURFERS[n].weight);
  return el('div', { class: 'board-box' },
    el('p', { class: 'board-title', text: title }),
    same ? el('p', { class: 'board-rec' }, el('b', { text: 'Para los dos: ' }), recParts(recs[0].r))
      : el('ul', { class: 'board-list' }, recs.map(o => el('li', {}, el('b', { text: `${o.n}: ` }), recParts(o.r)))),
    el('p', { class: 'fine', text: `${recs[0].r.why}.${noWeight ? ' Añade el peso de cada uno en Ajustes para ver el volumen en litros.' : ''}` }));
}

/* Ajustes: datos de cada surfista (solo en este dispositivo) */
const _buildSettings = buildSettings;
buildSettings = function () {
  if ($('#sheet').hidden || !draftSurfers) draftSurfers = JSON.parse(JSON.stringify(SURFERS));
  _buildSettings();
  const sec = el('section', { class: 'set-sec' }, el('h3', { text: 'Surfistas (para recomendar la tabla)' }),
    el('p', { class: 'fine', text: 'El peso decide el volumen y la altura afina el largo. Se guardan solo en este dispositivo.' }));
  for (const n of Object.keys(draftSurfers)) {
    const p = draftSurfers[n];
    const num = (label, key, min, max, unit) => el('label', { class: 'surf-field' }, `${label} (${unit})`,
      el('input', { type: 'number', inputmode: 'numeric', min, max, value: p[key] == null ? '' : p[key], onchange: e => { const v = +e.target.value; p[key] = e.target.value !== '' && isFinite(v) && v >= min && v <= max ? v : null; } }));
    sec.append(el('div', { class: 'surf-row' }, el('p', { class: 'set-dayname', text: n }),
      el('div', { class: 'surf-fields' },
        el('label', { class: 'surf-field' }, 'Nivel', el('select', { onchange: e => { p.level = e.target.value; } }, LEVELS.map(l => { const o = el('option', { value: l, text: cap(l) }); if (l === p.level) o.selected = true; return o; }))),
        num('Peso', 'weight', 30, 160, 'kg'), num('Altura', 'height', 120, 220, 'cm'))));
  }
  const body = $('#sheetBody'); body.insertBefore(sec, body.children[1] || null);
};
$('#btnSave').addEventListener('click', () => { // se ejecuta antes que el Guardar original
  if (draftSurfers) { SURFERS = JSON.parse(JSON.stringify(draftSurfers)); store.set(K_SURFERS, SURFERS); }
}, true);

/* Dónde se muestra la tabla: panel principal y hora seleccionada */
const _renderHero = renderHero;
renderHero = function () {
  _renderHero();
  const pick = state.plan.next || state.plan.best; if (!pick) return;
  const box = boardBox(pick.f.peakHour, 'Tabla recomendada'); if (!box) return;
  const why = $('#hero .why'); if (why) why.before(box);
};
const _renderReadLine = renderReadLine;
renderReadLine = function () {
  _renderReadLine();
  const rl = $('#readLine'); if (!rl) return;
  let host = $('#boardLine');
  if (!host) { host = el('div', { id: 'boardLine', class: 'board-line' }); rl.after(host); }
  const d = state.days[state.dayIdx], x = d && d.hours.find(h => h.min === state.hour);
  const now = nowP(), canLog = d && d.date <= now.date && dayNum(now.date) - dayNum(d.date) <= 7 && (d.date < now.date || state.hour <= now.min + 60);
  host.replaceChildren(...[
    x ? boardBox(x, `Tabla para las ${hm(x.min)}`) : null,
    canLog ? el('button', { class: 'btn small', type: 'button', onclick: () => openSessionForm(d.date, state.hour), text: `Registrar una sesión a las ${hm(state.hour)}` }) : null
  ].filter(Boolean));
};

/* Registro de sesiones (repositorio privado Surf_Radar_datos) */
const RATING = ['Mala', 'Floja', 'Normal', 'Buena', 'Buenísima'];
const ses = { list: null, loading: false, error: null, sending: false, msg: null, form: null, editing: null };
function newForm(date, min) {
  const now = nowP(), m = min != null ? min : Math.floor(now.min / 60) * 60;
  return { who: ideas.author || null, date: date || now.date, time: hm(m), dur: 90, board: '', rating: 0, note: '' };
}
ses.form = newForm();
function openSessionForm(date, min) {
  const keep = ses.form; ses.editing = null; ses.form = newForm(date, min); ses.form.who = keep.who; ses.msg = null; renderSessions();
  $('#sessions').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const r1 = v => v == null || !isFinite(v) ? null : Math.round(v * 10) / 10, r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
function condOf(x) {
  return { hora: hm(x.min), boya_m: r2(x.open), hendaya_m: r2(x.shore), periodo_s: r1(x.per), energia_kj: Math.round(x.en.kj), swell_dir: compass(x.dir), swell_grados: Math.round(norm360(x.dir)),
    viento_kn: r1(x.wind), viento_dir: compass(x.windDir), viento_tipo: x.windI.label, marea_pct: x.tide ? Math.round(x.tide.rel * 100) : null, marea: x.tide ? (x.tide.rising ? 'subiendo' : 'bajando') : null,
    nota_app: x.danger ? null : r1(x.score), pasado: !!x.danger, plato: !!x.flat, sector: x.sector ? SECTORS[x.sector.key].name : null };
}
function analyzeWith(tide, h) { const saved = state.tide; state.tide = tide; try { return analyze(h); } finally { state.tide = saved; } }
// Horas analizadas de ese día: de los datos cargados o, si es un día pasado, pidiendo a Open-Meteo los últimos 7 días
async function hoursFor(date) {
  if (state.raw) {
    const hs = mergeRaw(state.raw).hours.filter(h => h.date === date);
    if (hs.length >= 20) return hs.map(h => analyzeWith(state.tide, h));
  }
  const u = s => s.replace('forecast_days=7', 'past_days=7&forecast_days=1');
  const extraP = fetchJSON(u(URLS.extra)).catch(() => null);
  const [marine, weather] = await Promise.all([fetchJSON(u(URLS.marine)), fetchJSON(u(URLS.weather))]);
  const all = mergeRaw({ marine, weather, extra: await extraP }).hours;
  const tide = buildTide(all, all.filter(h => h.slh != null).length >= 24 ? detectExtremes(all) : []);
  return all.filter(h => h.date === date).map(h => analyzeWith(tide, h));
}
function sesHeaders() { return Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()); }
function parseSession(it) {
  const b = (it.body || '').split(CR).join('');
  const i = b.indexOf(FENCE + 'json'), j = i >= 0 ? b.indexOf(FENCE, i + 7) : -1;
  let data = null; try { if (i >= 0 && j > i) data = JSON.parse(b.slice(i + 7, j)); } catch (e) { data = null; }
  return { n: it.number, url: it.html_url, title: it.title, closed: it.state === 'closed', data };
}
async function loadSessions() {
  if (!ideas.token || ses.loading) { renderSessions(); return; }
  ses.loading = true; renderSessionList();
  try {
    const r = await fetch(`${DATA_API}/issues?state=all&per_page=30&sort=created&direction=desc`, { headers: ghHeaders(), cache: 'no-cache' }); // sin la copia de 60 s del navegador
    if (r.status === 404) throw new Error('No encuentro el repositorio Surf_Radar_datos o la llave no tiene acceso a él.');
    if (r.status === 401) throw new Error('La llave de GitHub no es válida o ha caducado.');
    if (!r.ok) throw new Error(`GitHub respondió con un error (HTTP ${r.status}).`);
    const data = await r.json();
    ses.list = (Array.isArray(data) ? data : []).filter(i => !i.pull_request && i.state !== 'closed').map(parseSession); // las eliminadas se cierran
    ses.error = null; store.set(K_SESSIONS, ses.list);
  } catch (e) { ses.error = e; if (!ses.list) { const c = store.get(K_SESSIONS, null); if (Array.isArray(c)) ses.list = c; } }
  ses.loading = false; renderSessionList();
}
// Ventana de confirmación propia (evita guardar o borrar por un toque sin querer)
function confirmBox(o) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    let bg = null;
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
    const close = v => { bg.remove(); document.removeEventListener('keydown', onKey, true); document.body.classList.remove('noscroll'); if (prev && prev.focus) prev.focus({ preventScroll: true }); resolve(v); };
    const cancel = el('button', { class: 'btn', type: 'button', onclick: () => close(false), text: o.cancel || 'Cancelar' });
    const ok = el('button', { class: `btn primary${o.danger ? ' danger' : ''}`, type: 'button', onclick: () => close(true), text: o.ok });
    bg = el('div', { class: 'confirm-bg', onclick: e => { if (e.target === bg) close(false); } },
      el('div', { class: 'confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'cfTitle', 'aria-describedby': 'cfText' },
        el('h2', { id: 'cfTitle', text: o.title }), el('p', { id: 'cfText', text: o.text }), el('div', { class: 'confirm-actions' }, cancel, ok)));
    document.body.append(bg); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey, true); cancel.focus();
  });
}
const recText = t => t ? `${t.tipo}, ${t.largo}${t.volumen_l ? `, ${t.volumen_l} L` : ''}` : 'sin datos';
const sesLabel = d => `${d.surfista} del ${dayFull(d.fecha).toLowerCase()}, de ${d.entrada} a ${d.salida}`;
async function saveSession() {
  const f = ses.form, who = authorOf(f.who), start = parseHM(f.time), now = nowP();
  const editing = ses.editing ? (ses.list || []).find(s => s.n === ses.editing && s.data) : null, old = editing ? editing.data : null;
  const err = t => { ses.msg = { err: true, text: t }; renderSessions(); };
  if (!ideas.token) return err('Hace falta la llave de GitHub (la de las sugerencias) con acceso a Surf_Radar_datos.');
  if (!who) return err('Elige quién ha surfeado: Estefy o David.');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.date) || start == null) return err('Revisa el día y la hora de entrada.');
  const timingChanged = !old || old.fecha !== f.date || old.entrada !== hm(start) || old.duracion_min !== f.dur;
  if (timingChanged && (f.date > now.date || dayNum(now.date) - dayNum(f.date) > 7)) return err('Solo se pueden registrar sesiones de hoy o de los 7 días anteriores.');
  if (!f.rating) return err('Pon una valoración de 1 a 5.');
  if (editing && !(await confirmBox({ title: 'Guardar los cambios', text: `Se actualizará la sesión de ${sesLabel(old)}.${timingChanged ? ' Como cambian el día o las horas, se volverán a calcular sus condiciones.' : ''}`, ok: 'Guardar cambios' }))) return;
  ses.sending = true; ses.msg = { text: editing ? 'Guardando los cambios…' : 'Guardando la sesión con sus condiciones…' }; renderSessions();
  try {
    let conds, recObj;
    const p = SURFERS[who.name];
    if (timingChanged) {
      let hs = [];
      try { hs = await hoursFor(f.date); } catch (e) { hs = []; }
      const from = Math.floor(start / 60) * 60, to0 = start + f.dur;
      const inS = hs.filter(x => x.ok && x.min >= from && x.min < to0);
      const rec = inS[0] ? boardFor(inS[0], p) : null;
      conds = inS.map(condOf);
      recObj = rec ? { tipo: rec.name, largo: rec.len.join('–'), volumen_l: rec.vol ? rec.vol.join('–') : null } : null;
    } else { conds = old.condiciones || []; recObj = old.tabla_recomendada || null; }
    const to = start + f.dur, c0 = conds[0] || null;
    const rec2 = { version: 1, surfista: who.name, nivel: p.level, fecha: f.date, entrada: hm(start), salida: hm(Math.min(to, 1440)), duracion_min: f.dur,
      tabla_usada: f.board.trim() || null, valoracion: f.rating, comentario: f.note.trim() || null,
      tabla_recomendada: recObj, condiciones: conds, fuente: 'Modelo Open-Meteo (pronóstico), no observación',
      registrada: old && old.registrada ? old.registrada : new Date().toISOString() };
    if (old) rec2.editada = new Date().toISOString();
    const lines = [
      `Sesión de ${who.name} el ${dayFull(f.date).toLowerCase()}, de ${hm(start)} a ${hm(Math.min(to, 1440))}.`, '',
      `- Valoración: ${f.rating}/5 (${RATING[f.rating - 1]})`,
      `- Tabla usada: ${f.board.trim() || 'sin indicar'}`,
      `- Tabla recomendada por la app: ${recText(recObj)}`,
      c0 ? `- Condiciones a la entrada: ${f1(c0.boya_m)} m en boya (~${f1(c0.hendaya_m)} m en Hendaya), ${f0(c0.periodo_s)} s, ${fk(c0.energia_kj)} kJ, swell ${c0.swell_dir}, viento ${f0(c0.viento_kn)} kn ${c0.viento_dir} (${c0.viento_tipo})${c0.marea_pct != null ? `, marea ${c0.marea_pct} % ${c0.marea}` : ''}. Nota de la app: ${c0.nota_app == null ? 'heavy' : f1(c0.nota_app)}.` : '- Condiciones: no disponibles para esa hora.',
      f.note.trim() ? `- Comentario: ${f.note.trim()}` : null,
      old ? `- Editada desde la app el ${dayFull(now.date).toLowerCase()} a las ${hm(now.min)}.` : null, '',
      FENCE + 'json', JSON.stringify(rec2, null, 2), FENCE
    ].filter(v => v != null);
    const payload = JSON.stringify({ title: `Sesión ${f.date} ${hm(start)} de ${who.name}`, body: lines.join(NL) });
    const r = await fetch(editing ? `${DATA_API}/issues/${editing.n}` : `${DATA_API}/issues`, { method: editing ? 'PATCH' : 'POST', headers: sesHeaders(), body: payload });
    if (r.status === 404) throw new Error('No encuentro el repositorio Surf_Radar_datos o la llave no tiene acceso a él. Añádelo a la llave en GitHub.');
    if (r.status === 401) throw new Error('La llave de GitHub no es válida o ha caducado.');
    if (r.status === 403) throw new Error('La llave no tiene permiso para modificar incidencias en Surf_Radar_datos.');
    if (!r.ok) throw new Error(`GitHub respondió con un error (HTTP ${r.status}). Inténtalo de nuevo.`);
    const item = parseSession(await r.json());
    ses.list = editing ? (ses.list || []).map(x => x.n === item.n ? item : x) : [item].concat(ses.list || []);
    store.set(K_SESSIONS, ses.list);
    const keepWho = f.who; ses.editing = null; ses.form = newForm(); ses.form.who = keepWho;
    ses.msg = { ok: true, text: editing ? (conds.length ? 'Cambios guardados.' : 'Cambios guardados, pero sin condiciones: no había datos para la nueva hora.') : conds.length ? `Sesión guardada con las condiciones de ${conds.length} ${conds.length === 1 ? 'hora' : 'horas'}.` : 'Sesión guardada, pero sin condiciones: no había datos para esa hora.' };
  } catch (e) {
    ses.msg = { err: true, text: e.message && e.message.length > 20 ? e.message : 'No se pudo conectar con GitHub. Revisa la conexión e inténtalo de nuevo.' };
  }
  ses.sending = false; renderSessions();
}
function editSession(s) {
  const d = s.data;
  ses.editing = s.n;
  ses.form = { who: d.surfista, date: d.fecha, time: d.entrada, dur: d.duracion_min || 90, board: d.tabla_usada || '', rating: d.valoracion || 0, note: d.comentario || '' };
  ses.msg = null; renderSessions();
  // Deja el cursor al final del comentario. Al hacerlo dentro del mismo toque, el iPhone abre el teclado
  const t = $('#sesNote');
  if (t) { t.focus({ preventScroll: true }); try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) { /* sin selección */ } t.scrollIntoView({ block: 'center' }); }
  else $('#sessions').scrollIntoView({ block: 'start' });
}
function cancelEdit() { const w = ses.form.who; ses.editing = null; ses.form = newForm(); ses.form.who = w; ses.msg = null; renderSessions(); }
// «Eliminar» cierra la incidencia como descartada: deja de verse y de contar, pero se puede recuperar en GitHub
async function deleteSession(s) {
  if (!(await confirmBox({ title: 'Eliminar sesión', text: `¿Eliminar la sesión de ${sesLabel(s.data)}? Dejará de aparecer y no contará en el análisis.`, ok: 'Eliminar', danger: true }))) return;
  try {
    const r = await fetch(`${DATA_API}/issues/${s.n}`, { method: 'PATCH', headers: sesHeaders(), body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }) });
    if (r.status === 401) throw new Error('La llave de GitHub no es válida o ha caducado.');
    if (!r.ok) throw new Error(`No se pudo eliminar (HTTP ${r.status}). Inténtalo de nuevo.`);
    ses.list = (ses.list || []).filter(x => x.n !== s.n); store.set(K_SESSIONS, ses.list);
    if (ses.editing === s.n) { const w = ses.form.who; ses.editing = null; ses.form = newForm(); ses.form.who = w; }
    ses.msg = { ok: true, text: 'Sesión eliminada.' };
  } catch (e) { ses.msg = { err: true, text: e.message && e.message.length > 20 ? e.message : 'No se pudo conectar con GitHub. Inténtalo de nuevo.' }; }
  renderSessions();
}
function sessionItem(s) {
  const d = s.data;
  if (!d) return el('li', { class: 'ses-item' }, el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title }));
  const c = d.condiciones && d.condiciones[0];
  const a = authorOf(d.surfista);
  return el('li', { class: `ses-item${ses.editing === s.n ? ' editing' : ''}` },
    el('div', { class: 'idea-top' },
      el('span', { class: `who-tag ${a ? a.cls : 'who-x'}` }, el('i', { class: 'who-dot', 'aria-hidden': 'true' }), d.surfista),
      el('span', { class: 'idea-title', text: `${dayShortRel(d.fecha, nowP())}, ${d.entrada}–${d.salida}` }),
      el('span', { class: 'ses-rate', 'aria-label': `Valoración ${d.valoracion} de 5`, text: '★'.repeat(d.valoracion) + '☆'.repeat(5 - d.valoracion) })),
    el('p', { class: 'idea-body ses-tap', title: 'Toca para editar', onclick: () => editSession(s), text: [d.tabla_usada ? `Tabla: ${d.tabla_usada}` : null, c ? `${f1(c.boya_m)} m en boya, ${f0(c.periodo_s)} s, viento ${c.viento_tipo}` : null, d.comentario].filter(Boolean).join('. ') }),
    el('div', { class: 'ses-actions' },
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => editSession(s), text: ses.editing === s.n ? 'Editando…' : 'Editar', disabled: ses.editing === s.n }),
      el('button', { class: 'btn small ghost del', type: 'button', onclick: () => deleteSession(s), text: 'Eliminar' })));
}
// Marca la opción elegida en un grupo de botones sin redibujar el formulario
function markChecked(btn) { for (const b of btn.parentElement.querySelectorAll('[role=radio]')) b.setAttribute('aria-checked', b === btn ? 'true' : 'false'); }
function boardHint(f) {
  try {
    const p = f.who ? SURFERS[f.who] : null, d = state.days.find(x => x.date === f.date), m = parseHM(f.time);
    const x = d && m != null ? hourAt(d, Math.floor(m / 60) * 60) : null, r = x && p ? boardFor(x, p) : null;
    return r ? `Recomendada: ${r.text}` : `Ej.: mid-length de 7'6", 52 L`;
  } catch (e) { return ''; }
}
function refreshHint() { const b = $('#sesBoard'); if (b) b.placeholder = boardHint(ses.form); }
function clearErrMsg() { if (ses.msg && ses.msg.err) { ses.msg = null; const mm = $('#sesMsg'); if (mm) mm.remove(); } }
// La lista se redibuja por separado: así no se pierde lo que se está escribiendo en el formulario
function sessionListNodes() {
  const now = nowP(), list = el('div', { class: 'idea-lists' });
  if (ses.list == null) list.append(el('p', { class: 'fine', text: ses.loading ? 'Cargando sesiones…' : 'Todavía no se han cargado las sesiones.' }));
  else if (!ses.list.length) list.append(el('p', { class: 'fine', text: 'Todavía no hay sesiones registradas.' }));
  else list.append(el('ul', { class: 'idea-list' }, ses.list.slice(0, 10).map(sessionItem)));
  if (ses.error) list.append(el('p', { class: 'fine', text: `No se pudo consultar el registro: ${ses.error.message || ses.error}` }));
  const year = (ses.list || []).filter(s => s.data && s.data.fecha && s.data.fecha.slice(0, 4) === now.date.slice(0, 4)).length;
  return [el('div', { class: 'idea-head' }, el('h3', { text: ses.list && ses.list.length ? `Últimas sesiones (${year} este año)` : 'Últimas sesiones' }),
    el('button', { class: 'link-btn', type: 'button', onclick: () => loadSessions(), disabled: ses.loading, text: ses.loading ? 'Cargando…' : 'Actualizar' })), list];
}
function renderSessionList() {
  const host = $('#sesListWrap');
  if (!host || !ideas.token) { renderSessions(); return; }
  host.replaceChildren(...sessionListNodes());
}
function renderSessions() {
  let box = $('#sessions');
  if (!box) { box = el('section', { id: 'sessions', class: 'ideas sessions', 'aria-labelledby': 'sesTitle' }); $('#ideas').before(box); }
  // Conserva el campo activo si el formulario se tiene que redibujar
  const act = document.activeElement, actId = act && box.contains(act) ? act.id : null;
  const sel = actId && typeof act.selectionStart === 'number' ? [act.selectionStart, act.selectionEnd] : null;
  const f = ses.form, now = nowP();
  const who = el('div', { class: 'idea-who', role: 'radiogroup', 'aria-labelledby': 'sesWho' }, el('span', { id: 'sesWho', text: '¿Quién ha surfeado?' }),
    IDEA_AUTHORS.map(a => el('button', { type: 'button', class: `who-btn ${a.cls}`, role: 'radio', 'aria-checked': f.who === a.name ? 'true' : 'false', onclick: e => { f.who = a.name; markChecked(e.currentTarget); clearErrMsg(); refreshHint(); } },
      el('i', { class: 'who-dot', 'aria-hidden': 'true' }), a.name)));
  const editing = ses.editing ? (ses.list || []).find(s => s.n === ses.editing && s.data) : null;
  if (ses.editing && !editing) ses.editing = null;
  const locked = !!editing && dayNum(now.date) - dayNum(editing.data.fecha) > 7; // ya no se pueden recalcular sus condiciones
  const minDate = locked ? editing.data.fecha : dateFromNum(dayNum(now.date) - 7);
  const durSel = el('select', { id: 'sesDur', disabled: locked, onchange: e => { f.dur = +e.target.value; } }, [30, 60, 90, 120, 150, 180, 240].concat([30, 60, 90, 120, 150, 180, 240].includes(f.dur) ? [] : [f.dur]).sort((a, b) => a - b).map(v => { const o = el('option', { value: v, text: v < 60 ? `${v} min` : `${Math.floor(v / 60)} h${v % 60 ? ' 30 min' : ''}` }); if (v === f.dur) o.selected = true; return o; }));
  const rate = el('div', { class: 'rate-row', role: 'radiogroup', 'aria-label': 'Valoración' }, RATING.map((t, i) => el('button', { type: 'button', class: 'rate-btn', role: 'radio', 'aria-checked': f.rating === i + 1 ? 'true' : 'false', title: t, onclick: e => { f.rating = i + 1; markChecked(e.currentTarget); clearErrMsg(); } }, el('b', { text: String(i + 1) }), el('small', { text: t }))));
  const m = ses.msg;
  const form = !ideas.token
    ? el('div', { class: 'idea-msg' }, el('span', { text: 'Para registrar sesiones hace falta la llave de GitHub (la misma de las sugerencias) con acceso al repositorio privado Surf_Radar_datos. Guárdala en «Publicar sin salir de la app», en el apartado de sugerencias.' }))
    : el('div', { class: 'idea-form' },
      editing ? el('div', { class: 'ses-edit' }, el('span', {}, 'Editando la sesión de ', el('b', { text: sesLabel(editing.data) })), el('button', { class: 'link-btn', type: 'button', onclick: cancelEdit, text: 'Cancelar edición' })) : null,
      who,
      el('div', { class: 'ses-grid' },
        el('label', { class: 'surf-field' }, 'Día', el('input', { id: 'sesDate', type: 'date', min: minDate, max: now.date, value: f.date, disabled: locked, onchange: e => { f.date = e.target.value; refreshHint(); } })),
        el('label', { class: 'surf-field' }, 'Entrada', el('input', { id: 'sesTime', type: 'time', step: 300, value: f.time, disabled: locked, onchange: e => { f.time = e.target.value; refreshHint(); } })),
        el('label', { class: 'surf-field' }, 'Duración', durSel)),
      locked ? el('p', { class: 'fine', text: 'Es una sesión de hace más de 7 días: puedes cambiar quién, la tabla, la valoración y el comentario, pero no el día ni las horas.' }) : null,
      el('label', { class: 'surf-field' }, 'Tabla usada', el('input', { id: 'sesBoard', type: 'text', maxlength: 80, value: f.board, placeholder: boardHint(f), oninput: e => { f.board = e.target.value; } })),
      el('div', { class: 'surf-field' }, el('span', { text: 'Valoración' }), rate),
      el('label', { class: 'surf-field' }, 'Comentario (opcional)', el('textarea', { id: 'sesNote', rows: 2, maxlength: 1000, placeholder: 'Cómo estaba el agua, si la tabla iba bien…', oninput: e => { f.note = e.target.value; } })),
      el('div', { class: 'idea-actions' }, el('button', { class: 'btn primary', type: 'button', onclick: saveSession, disabled: ses.sending, text: ses.sending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar sesión' })),
      m ? el('div', { id: 'sesMsg', class: `idea-msg${m.err ? ' err' : m.ok ? ' ok' : ''}`, role: 'status' }, el('span', { text: m.text })) : null);
  const ta = form.querySelector('textarea'); if (ta) ta.value = f.note;
  box.replaceChildren(...[
    el('h2', { id: 'sesTitle', text: 'Registro de sesiones' }),
    el('p', { class: 'fine', text: 'Apuntad cada baño: la app guarda las condiciones de esas horas para analizar a final de año qué os funciona y si conviene cambiar de tabla. Se guarda en un repositorio privado.' }),
    form,
    ideas.token ? el('div', { id: 'sesListWrap', class: 'ses-list-wrap' }, ...sessionListNodes()) : null
  ].filter(Boolean));
  if (actId) { const n = document.getElementById(actId); if (n) { n.focus({ preventScroll: true }); if (sel && typeof n.setSelectionRange === 'function') { try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* sin selección */ } } } }
}
// La llave de las sugerencias también da acceso al registro
const _saveToken = saveToken, _removeToken = removeToken;
saveToken = function (v) { _saveToken(v); loadSessions(); };
removeToken = function () { _removeToken(); ses.list = null; renderSessions(); };

(function initSessions() {
  const c = store.get(K_SESSIONS, null); if (Array.isArray(c)) ses.list = c;
  renderSessions(); loadSessions();
  if (state.raw) { renderHero(); renderReadLine(); }
})();
Object.assign(window.HSR, { boardFor, boardKey, SURFERS: () => SURFERS, ses, saveSession, loadSessions, openSessionForm, renderSessions, saveToken, removeToken, editSession, deleteSession, cancelEdit });
