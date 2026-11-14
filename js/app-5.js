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
  if (x.danger) return el('div', { class: 'board-box' }, el('p', { class: 'board-title', text: title }), el('p', { class: 'fine', text: 'Ninguna: el mar está pasado para nivel medio.' }));
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
const ses = { list: null, loading: false, error: null, sending: false, msg: null, form: null };
function newForm(date, min) {
  const now = nowP(), m = min != null ? min : Math.floor(now.min / 60) * 60;
  return { who: ideas.author || null, date: date || now.date, time: hm(m), dur: 90, board: '', rating: 0, note: '' };
}
ses.form = newForm();
function openSessionForm(date, min) {
  const keep = ses.form; ses.form = newForm(date, min); ses.form.who = keep.who; ses.msg = null; renderSessions();
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
  return { n: it.number, url: it.html_url, title: it.title, data };
}
async function loadSessions() {
  if (!ideas.token || ses.loading) { renderSessions(); return; }
  ses.loading = true; renderSessions();
  try {
    const r = await fetch(`${DATA_API}/issues?state=all&per_page=30&sort=created&direction=desc`, { headers: ghHeaders() });
    if (r.status === 404) throw new Error('No encuentro el repositorio Surf_Radar_datos o la llave no tiene acceso a él.');
    if (r.status === 401) throw new Error('La llave de GitHub no es válida o ha caducado.');
    if (!r.ok) throw new Error(`GitHub respondió con un error (HTTP ${r.status}).`);
    const data = await r.json();
    ses.list = (Array.isArray(data) ? data : []).filter(i => !i.pull_request).map(parseSession);
    ses.error = null; store.set(K_SESSIONS, ses.list);
  } catch (e) { ses.error = e; if (!ses.list) { const c = store.get(K_SESSIONS, null); if (Array.isArray(c)) ses.list = c; } }
  ses.loading = false; renderSessions();
}
async function saveSession() {
  const f = ses.form, who = authorOf(f.who), start = parseHM(f.time), now = nowP();
  const err = t => { ses.msg = { err: true, text: t }; renderSessions(); };
  if (!ideas.token) return err('Hace falta la llave de GitHub (la de las sugerencias) con acceso a Surf_Radar_datos.');
  if (!who) return err('Elige quién ha surfeado: Estefy o David.');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.date) || start == null) return err('Revisa el día y la hora de entrada.');
  if (f.date > now.date || dayNum(now.date) - dayNum(f.date) > 7) return err('Solo se pueden registrar sesiones de hoy o de los 7 días anteriores.');
  if (!f.rating) return err('Pon una valoración de 1 a 5.');
  ses.sending = true; ses.msg = { text: 'Guardando la sesión con sus condiciones…' }; renderSessions();
  try {
    let hs = [];
    try { hs = await hoursFor(f.date); } catch (e) { hs = []; }
    const from = Math.floor(start / 60) * 60, to = start + f.dur;
    const inS = hs.filter(x => x.ok && x.min >= from && x.min < to);
    const entry = inS[0] || null, p = SURFERS[who.name], rec = entry ? boardFor(entry, p) : null;
    const rec2 = { version: 1, surfista: who.name, nivel: p.level, fecha: f.date, entrada: hm(start), salida: hm(Math.min(to, 1440)), duracion_min: f.dur,
      tabla_usada: f.board.trim() || null, valoracion: f.rating, comentario: f.note.trim() || null,
      tabla_recomendada: rec ? { tipo: rec.name, largo: rec.len.join('–'), volumen_l: rec.vol ? rec.vol.join('–') : null } : null,
      condiciones: inS.map(condOf), fuente: 'Modelo Open-Meteo (pronóstico), no observación', registrada: new Date().toISOString() };
    const c0 = entry ? condOf(entry) : null;
    const lines = [
      `Sesión de ${who.name} el ${dayFull(f.date).toLowerCase()}, de ${hm(start)} a ${hm(Math.min(to, 1440))}.`, '',
      `- Valoración: ${f.rating}/5 (${RATING[f.rating - 1]})`,
      `- Tabla usada: ${f.board.trim() || 'sin indicar'}`,
      `- Tabla recomendada por la app: ${rec ? rec.text : 'sin datos'}`,
      c0 ? `- Condiciones a la entrada: ${f1(c0.boya_m)} m en boya (~${f1(c0.hendaya_m)} m en Hendaya), ${f0(c0.periodo_s)} s, ${fk(c0.energia_kj)} kJ, swell ${c0.swell_dir}, viento ${f0(c0.viento_kn)} kn ${c0.viento_dir} (${c0.viento_tipo})${c0.marea_pct != null ? `, marea ${c0.marea_pct} % ${c0.marea}` : ''}. Nota de la app: ${c0.nota_app == null ? 'pasado' : f1(c0.nota_app)}.` : '- Condiciones: no disponibles para esa hora.',
      f.note.trim() ? `- Comentario: ${f.note.trim()}` : null, '',
      FENCE + 'json', JSON.stringify(rec2, null, 2), FENCE
    ].filter(v => v != null);
    const r = await fetch(`${DATA_API}/issues`, { method: 'POST', headers: sesHeaders(), body: JSON.stringify({ title: `Sesión ${f.date} ${hm(start)} de ${who.name}`, body: lines.join(NL) }) });
    if (r.status === 404) throw new Error('No encuentro el repositorio Surf_Radar_datos o la llave no tiene acceso a él. Añádelo a la llave en GitHub.');
    if (r.status === 401) throw new Error('La llave de GitHub no es válida o ha caducado.');
    if (r.status === 403) throw new Error('La llave no tiene permiso para crear incidencias en Surf_Radar_datos.');
    if (!r.ok) throw new Error(`GitHub respondió con un error (HTTP ${r.status}). Inténtalo de nuevo.`);
    const item = parseSession(await r.json());
    ses.list = [item].concat(ses.list || []); store.set(K_SESSIONS, ses.list);
    const keepWho = f.who; ses.form = newForm(); ses.form.who = keepWho;
    ses.msg = { ok: true, text: inS.length ? `Sesión guardada con las condiciones de ${inS.length} ${inS.length === 1 ? 'hora' : 'horas'}.` : 'Sesión guardada, pero sin condiciones: no había datos para esa hora.' };
  } catch (e) {
    ses.msg = { err: true, text: e.message && e.message.length > 20 ? e.message : 'No se pudo conectar con GitHub. Revisa la conexión e inténtalo de nuevo.' };
  }
  ses.sending = false; renderSessions();
}
function sessionItem(s) {
  const d = s.data;
  if (!d) return el('li', { class: 'ses-item' }, el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title }));
  const c = d.condiciones && d.condiciones[0];
  const a = authorOf(d.surfista);
  return el('li', { class: 'ses-item' },
    el('div', { class: 'idea-top' },
      el('span', { class: `who-tag ${a ? a.cls : 'who-x'}` }, el('i', { class: 'who-dot', 'aria-hidden': 'true' }), d.surfista),
      el('span', { class: 'idea-title', text: `${dayShortRel(d.fecha, nowP())}, ${d.entrada}–${d.salida}` }),
      el('span', { class: 'ses-rate', 'aria-label': `Valoración ${d.valoracion} de 5`, text: '★'.repeat(d.valoracion) + '☆'.repeat(5 - d.valoracion) })),
    el('p', { class: 'idea-body', text: [d.tabla_usada ? `Tabla: ${d.tabla_usada}` : null, c ? `${f1(c.boya_m)} m en boya, ${f0(c.periodo_s)} s, viento ${c.viento_tipo}` : null, d.comentario].filter(Boolean).join('. ') }));
}
function renderSessions() {
  let box = $('#sessions');
  if (!box) { box = el('section', { id: 'sessions', class: 'ideas sessions', 'aria-labelledby': 'sesTitle' }); $('#ideas').before(box); }
  const f = ses.form, now = nowP();
  const who = el('div', { class: 'idea-who', role: 'radiogroup', 'aria-labelledby': 'sesWho' }, el('span', { id: 'sesWho', text: '¿Quién ha surfeado?' }),
    IDEA_AUTHORS.map(a => el('button', { type: 'button', class: `who-btn ${a.cls}`, role: 'radio', 'aria-checked': f.who === a.name ? 'true' : 'false', onclick: () => { f.who = a.name; if (ses.msg && ses.msg.err) ses.msg = null; renderSessions(); } },
      el('i', { class: 'who-dot', 'aria-hidden': 'true' }), a.name)));
  const minDate = dateFromNum(dayNum(now.date) - 7);
  const durSel = el('select', { id: 'sesDur', onchange: e => { f.dur = +e.target.value; } }, [30, 60, 90, 120, 150, 180, 240].map(v => { const o = el('option', { value: v, text: v < 60 ? `${v} min` : `${Math.floor(v / 60)} h${v % 60 ? ' 30 min' : ''}` }); if (v === f.dur) o.selected = true; return o; }));
  const p = f.who ? SURFERS[f.who] : null;
  const hint = (() => { try { const d = state.days.find(x => x.date === f.date), m = parseHM(f.time); const x = d && m != null ? hourAt(d, Math.floor(m / 60) * 60) : null; const r = x && p ? boardFor(x, p) : null; return r ? `Recomendada: ${r.text}` : `Ej.: mid-length de 7'6", 52 L`; } catch (e) { return ''; } })();
  const rate = el('div', { class: 'rate-row', role: 'radiogroup', 'aria-label': 'Valoración' }, RATING.map((t, i) => el('button', { type: 'button', class: 'rate-btn', role: 'radio', 'aria-checked': f.rating === i + 1 ? 'true' : 'false', title: t, onclick: () => { f.rating = i + 1; renderSessions(); } }, el('b', { text: String(i + 1) }), el('small', { text: t }))));
  const m = ses.msg;
  const form = !ideas.token
    ? el('div', { class: 'idea-msg' }, el('span', { text: 'Para registrar sesiones hace falta la llave de GitHub (la misma de las sugerencias) con acceso al repositorio privado Surf_Radar_datos. Guárdala en «Publicar sin salir de la app», en el apartado de sugerencias.' }))
    : el('div', { class: 'idea-form' }, who,
      el('div', { class: 'ses-grid' },
        el('label', { class: 'surf-field' }, 'Día', el('input', { type: 'date', min: minDate, max: now.date, value: f.date, onchange: e => { f.date = e.target.value; renderSessions(); } })),
        el('label', { class: 'surf-field' }, 'Entrada', el('input', { type: 'time', step: 300, value: f.time, onchange: e => { f.time = e.target.value; renderSessions(); } })),
        el('label', { class: 'surf-field' }, 'Duración', durSel)),
      el('label', { class: 'surf-field' }, 'Tabla usada', el('input', { type: 'text', maxlength: 80, value: f.board, placeholder: hint, oninput: e => { f.board = e.target.value; } })),
      el('div', { class: 'surf-field' }, el('span', { text: 'Valoración' }), rate),
      el('label', { class: 'surf-field' }, 'Comentario (opcional)', el('textarea', { rows: 2, maxlength: 1000, placeholder: 'Cómo estaba el agua, si la tabla iba bien…', oninput: e => { f.note = e.target.value; } }, )),
      el('div', { class: 'idea-actions' }, el('button', { class: 'btn primary', type: 'button', onclick: saveSession, disabled: ses.sending, text: ses.sending ? 'Guardando…' : 'Guardar sesión' })),
      m ? el('div', { class: `idea-msg${m.err ? ' err' : m.ok ? ' ok' : ''}`, role: 'status' }, el('span', { text: m.text })) : null);
  const ta = form.querySelector('textarea'); if (ta) ta.value = f.note;
  const list = el('div', { class: 'idea-lists' });
  if (ideas.token) {
    if (ses.list == null) list.append(el('p', { class: 'fine', text: ses.loading ? 'Cargando sesiones…' : 'Todavía no se han cargado las sesiones.' }));
    else if (!ses.list.length) list.append(el('p', { class: 'fine', text: 'Todavía no hay sesiones registradas.' }));
    else list.append(el('ul', { class: 'idea-list' }, ses.list.slice(0, 10).map(sessionItem)));
    if (ses.error) list.append(el('p', { class: 'fine', text: `No se pudo consultar el registro: ${ses.error.message || ses.error}` }));
  }
  const year = (ses.list || []).filter(s => s.data && s.data.fecha && s.data.fecha.slice(0, 4) === now.date.slice(0, 4)).length;
  box.replaceChildren(...[
    el('h2', { id: 'sesTitle', text: 'Registro de sesiones' }),
    el('p', { class: 'fine', text: 'Apuntad cada baño: la app guarda las condiciones de esas horas para analizar a final de año qué os funciona y si conviene cambiar de tabla. Se guarda en un repositorio privado.' }),
    form,
    ideas.token ? el('div', { class: 'idea-head' }, el('h3', { text: ses.list && ses.list.length ? `Últimas sesiones (${year} este año)` : 'Últimas sesiones' }),
      el('button', { class: 'link-btn', type: 'button', onclick: () => loadSessions(), disabled: ses.loading, text: ses.loading ? 'Cargando…' : 'Actualizar' })) : null,
    ideas.token ? list : null
  ].filter(Boolean));
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
Object.assign(window.HSR, { boardFor, boardKey, SURFERS: () => SURFERS, ses, saveSession, loadSessions, openSessionForm, renderSessions, saveToken, removeToken });
