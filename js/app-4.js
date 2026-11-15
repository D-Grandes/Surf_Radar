'use strict';
/* =========================================================
   12. Sugerencias de mejora (se guardan como Issues de GitHub)
   ========================================================= */
// Este archivo evita las barras invertidas: el conector de GitHub puede transformarlas al subirlo
const NL = String.fromCharCode(10), CR = String.fromCharCode(13);
const REPO = 'D-Grandes/Surf_Radar', API = `https://api.github.com/repos/${REPO}`;
const IDEA_AUTHORS = [{ name: 'Estefy', cls: 'who-e' }, { name: 'David', cls: 'who-d' }];
const K_IDEAS = 'hsr:ideas:v1', K_AUTHOR = 'hsr:autor', K_TOKEN = 'hsr:gh-token';
const IDEA_FOOT = NL + NL + '---' + NL;
const DATE_S = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, day: 'numeric', month: 'short' });
const ideas = { list: null, loading: false, sending: false, error: null, fetchedAt: null, author: store.get(K_AUTHOR, null), draft: '', msg: null, token: store.get(K_TOKEN, null), tokenOpen: false };
const authorOf = n => IDEA_AUTHORS.find(a => a.name.toLowerCase() === String(n || '').trim().toLowerCase()) || null;
const ghHeaders = () => Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, ideas.token ? { Authorization: `Bearer ${ideas.token}` } : {});

// Títulos: «Propuesta 4 de Estefy» (o «[Estefy] …» si alguien le pone uno descriptivo)
function ideaParse(it) {
  let title = (it.title || '').trim(), who = null, generic = false;
  const j = title.indexOf(']');
  if (title.startsWith('[') && j > 1) { who = title.slice(1, j); title = title.slice(j + 1).trim(); }
  else if (title.startsWith('Propuesta')) {
    const k = title.lastIndexOf(' de ');
    if (k > 0 && authorOf(title.slice(k + 4))) { who = title.slice(k + 4); generic = true; }
  }
  const a = authorOf(who);
  const body = (it.body || '').split(CR).join('').split(IDEA_FOOT)[0].trim();
  return { n: it.number, title, generic, author: a ? a.name : (it.user && it.user.login) || 'Sin nombre', cls: a ? a.cls : 'who-x', body, url: it.html_url, done: it.state === 'closed', comments: it.comments || 0, at: it.created_at };
}
async function loadIdeas() {
  if (ideas.loading) return;
  ideas.loading = true; renderIdeas();
  try {
    const r = await fetch(`${API}/issues?state=all&per_page=50&sort=created&direction=desc`, { headers: ghHeaders(), cache: 'no-cache' }); // sin la copia de 60 s del navegador
    if (r.status === 401 && ideas.token) throw new Error('la llave de GitHub no es válida o ha caducado');
    if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'GitHub limita las consultas seguidas; prueba dentro de un rato' : `HTTP ${r.status}`);
    const data = await r.json();
    ideas.list = (Array.isArray(data) ? data : []).filter(i => !i.pull_request).map(ideaParse);
    ideas.fetchedAt = Date.now(); ideas.error = null;
    store.set(K_IDEAS, { list: ideas.list, fetchedAt: ideas.fetchedAt });
  } catch (e) {
    ideas.error = e;
  }
  ideas.loading = false; renderIdeas();
}
function ideaBody(a, text) {
  const d = state.days[state.dayIdx];
  const ctx = d ? `Enviada por ${a.name} desde la app, mirando el ${dayFull(d.date)}${state.hour != null ? ` a las ${hm(state.hour)}` : ''}${state.vacation ? ', con el Modo Vacaciones activado' : ''}.` : `Enviada por ${a.name} desde la app.`;
  return text + IDEA_FOOT + ctx;
}
async function sendIdea() {
  const a = authorOf(ideas.author), text = ideas.draft.trim();
  if (!a) { ideas.msg = { err: true, text: 'Elige quién escribe: Estefy o David.' }; renderIdeas(); return; }
  if (text.length < 3) { ideas.msg = { err: true, text: 'Escribe la sugerencia antes de enviarla.' }; renderIdeas(true); return; }
  if (!ideas.token) { // sin llave: se abre el formulario de GitHub ya rellenado
    const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Propuesta de ${a.name}`)}&body=${encodeURIComponent(ideaBody(a, text))}`;
    window.open(url, '_blank', 'noopener');
    ideas.msg = { text: 'Se ha abierto GitHub con la sugerencia ya escrita. Pulsa «Create» (o «Submit new issue») para publicarla. Para publicar sin salir de la app, configura la publicación directa más abajo.', url };
    renderIdeas(); return;
  }
  if (ideas.sending) return;
  ideas.sending = true; ideas.msg = { text: 'Publicando…' }; renderIdeas();
  try {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, ghHeaders());
    const r = await fetch(`${API}/issues`, { method: 'POST', headers, body: JSON.stringify({ title: `Propuesta de ${a.name}`, body: ideaBody(a, text) }) });
    if (r.status === 401) throw new Error('La llave de GitHub no es válida o ha caducado. Cámbiala en «Publicación directa».');
    if (r.status === 403 || r.status === 404) throw new Error('La llave no tiene permiso para crear incidencias en Surf_Radar. Revisa que tenga «Issues: Read and write».');
    if (!r.ok) throw new Error(`GitHub respondió con un error (HTTP ${r.status}). Inténtalo de nuevo.`);
    let issue = await r.json();
    // Pone el número en el título: «Propuesta 4 de Estefy»
    try {
      const r2 = await fetch(`${API}/issues/${issue.number}`, { method: 'PATCH', headers, body: JSON.stringify({ title: `Propuesta ${issue.number} de ${a.name}` }) });
      if (r2.ok) issue = await r2.json();
    } catch (e) { /* si falla, se queda con el título sin número */ }
    const item = ideaParse(issue);
    ideas.list = [item].concat((ideas.list || []).filter(x => x.n !== item.n));
    store.set(K_IDEAS, { list: ideas.list, fetchedAt: Date.now() });
    ideas.draft = ''; ideas.msg = { ok: true, text: `Publicada como propuesta ${issue.number}.` };
  } catch (e) {
    ideas.msg = { err: true, text: e.message && e.message.length > 20 ? e.message : 'No se pudo conectar con GitHub. Revisa la conexión e inténtalo de nuevo.' };
  }
  ideas.sending = false; renderIdeas();
}
function saveToken(v) {
  const t = String(v || '').trim();
  if (!t) return;
  ideas.token = t; store.set(K_TOKEN, t); ideas.tokenOpen = false;
  ideas.msg = { ok: true, text: 'Publicación directa activada en este dispositivo.' };
  loadIdeas();
}
function removeToken() {
  ideas.token = null; try { localStorage.removeItem(K_TOKEN); } catch (e) { /* sin almacenamiento */ }
  ideas.msg = { text: 'Publicación directa desactivada en este dispositivo.' };
  renderIdeas();
}
function tokenBox() {
  if (ideas.token) {
    return el('div', { class: 'idea-token on' },
      el('span', { text: '✓ Publicación directa activada en este dispositivo.' }),
      el('button', { class: 'link-btn', type: 'button', onclick: removeToken, text: 'Quitar llave' }));
  }
  const inp = el('input', { type: 'password', id: 'ideaToken', autocomplete: 'off', spellcheck: 'false', placeholder: 'github_pat_…', 'aria-label': 'Llave de GitHub' });
  const box = el('details', { class: 'idea-token' },
    el('summary', { text: 'Publicar sin salir de la app (publicación directa)' }),
    el('p', { class: 'fine', text: 'Pega aquí la llave de GitHub (token) que ha creado David, solo con permiso para las incidencias de Surf_Radar. Se guarda únicamente en este dispositivo y se puede quitar cuando quieras.' }),
    el('div', { class: 'idea-token-row' }, inp, el('button', { class: 'btn small', type: 'button', onclick: () => saveToken(inp.value), text: 'Guardar llave' })));
  if (ideas.tokenOpen) box.open = true;
  box.addEventListener('toggle', () => { ideas.tokenOpen = box.open; });
  return box;
}
function ideaItem(x) {
  let rest = x.body;
  if (!x.generic && !x.title.endsWith('…') && rest.startsWith(x.title)) rest = rest.slice(x.title.length).trim();
  const max = x.generic ? 420 : 280;
  const short = rest.length > max ? rest.slice(0, max - 3).trimEnd() + '…' : rest;
  return el('li', { class: `idea${x.done ? ' done' : ''}${x.generic ? ' gen' : ''}` },
    el('div', { class: 'idea-top' },
      el('span', { class: `who-tag ${x.cls}` }, el('i', { class: 'who-dot', 'aria-hidden': 'true' }), x.author),
      el('span', { class: 'idea-title', text: x.generic ? `Propuesta ${x.n}` : x.title })),
    short ? el('p', { class: 'idea-body', text: short }) : null,
    el('p', { class: 'idea-meta' },
      x.generic ? null : el('span', { text: `#${x.n}` }),
      x.done ? el('span', { class: 'done-tag', text: '✓ Hecha' }) : null,
      el('span', { text: DATE_S.format(new Date(x.at)) }),
      el('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.comments ? `${x.comments} ${x.comments === 1 ? 'respuesta' : 'respuestas'}` : 'Responder en GitHub')));
}
function renderIdeas(focus) {
  const box = $('#ideas'); if (!box) return;
  const hadFocus = document.activeElement && document.activeElement.id === 'ideaText';
  const ta = el('textarea', { id: 'ideaText', rows: '4', maxlength: '4000', placeholder: 'Qué cambiarías o añadirías a la app…', 'aria-label': 'Sugerencia', oninput: e => { ideas.draft = e.target.value; } });
  ta.value = ideas.draft;
  const who = el('div', { class: 'idea-who', role: 'radiogroup', 'aria-labelledby': 'ideaWho' }, el('span', { id: 'ideaWho', text: '¿Quién escribe?' }),
    IDEA_AUTHORS.map(a => el('button', { type: 'button', class: `who-btn ${a.cls}`, role: 'radio', 'aria-checked': ideas.author === a.name ? 'true' : 'false',
      onclick: () => { ideas.author = a.name; store.set(K_AUTHOR, a.name); if (ideas.msg && ideas.msg.err) ideas.msg = null; renderIdeas(); } },
      el('i', { class: 'who-dot', 'aria-hidden': 'true' }), a.name)));
  const m = ideas.msg;
  const msg = m ? el('div', { class: `idea-msg${m.err ? ' err' : m.ok ? ' ok' : ''}`, role: 'status' }, el('span', { text: m.text }),
    m.url ? el('div', { class: 'idea-actions' },
      el('button', { class: 'btn small primary', type: 'button', onclick: () => { ideas.draft = ''; ideas.msg = null; loadIdeas(); }, text: 'Ya la he publicado' }),
      el('a', { class: 'btn small ghost', href: m.url, target: '_blank', rel: 'noopener noreferrer', text: 'Volver a abrir GitHub' })) : null) : null;
  const form = el('div', { class: 'idea-form' }, who, ta,
    el('div', { class: 'idea-actions' }, el('button', { class: 'btn primary', type: 'button', onclick: sendIdea, disabled: ideas.sending, text: ideas.sending ? 'Publicando…' : ideas.token ? 'Publicar sugerencia' : 'Enviar sugerencia' })), msg, tokenBox());
  const list = el('div', { class: 'idea-lists' });
  if (ideas.list == null) list.append(el('p', { class: 'fine', text: ideas.loading ? 'Cargando sugerencias…' : 'No se pudieron cargar las sugerencias.' }));
  else if (!ideas.list.length) list.append(el('p', { class: 'fine', text: 'Todavía no hay sugerencias.' }));
  else {
    const open = ideas.list.filter(x => !x.done), done = ideas.list.filter(x => x.done);
    if (open.length) list.append(el('h4', { class: 'idea-sub', text: `Pendientes (${open.length})` }), el('ul', { class: 'idea-list' }, open.map(ideaItem)));
    if (done.length) list.append(el('h4', { class: 'idea-sub', text: `Hechas (${done.length})` }), el('ul', { class: 'idea-list' }, done.map(ideaItem)));
  }
  if (ideas.error) list.append(el('p', { class: 'fine' }, `${ideas.list ? 'Muestro la última lista guardada. ' : ''}No se pudo consultar GitHub (${ideas.error.message || ideas.error}). `,
    el('a', { href: `https://github.com/${REPO}/issues`, target: '_blank', rel: 'noopener noreferrer', text: 'Verlas en GitHub' })));
  box.replaceChildren(
    el('h2', { id: 'ideasTitle', text: 'Sugerencias de mejora' }),
    el('p', { class: 'fine', text: ideas.token
      ? 'Para Estefy y David: apuntad aquí lo que mejoraríais de la app. Se publican al momento en GitHub como «Propuesta N» y son visibles para cualquiera.'
      : 'Para Estefy y David: apuntad aquí lo que mejoraríais de la app. Se publican en GitHub como «Propuesta N» y son visibles para cualquiera.' }),
    form,
    el('div', { class: 'idea-head' }, el('h3', { text: 'Lo que lleváis apuntado' }),
      el('button', { class: 'link-btn', type: 'button', onclick: () => loadIdeas(), disabled: ideas.loading, text: ideas.loading ? 'Cargando…' : 'Actualizar' })),
    list);
  if (hadFocus || focus) { const t = $('#ideaText'); t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length); }
}
$('#btnIdeas').addEventListener('click', () => {
  $('#ideas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => { const t = $('#ideaText'); if (t) t.focus({ preventScroll: true }); }, 450);
});
(function initIdeas() {
  const c = store.get(K_IDEAS, null);
  if (c && Array.isArray(c.list)) { ideas.list = c.list; ideas.fetchedAt = c.fetchedAt; }
  renderIdeas(); loadIdeas();
})();
Object.assign(window.HSR, { ideas, loadIdeas, sendIdea, renderIdeas, saveToken, removeToken });
