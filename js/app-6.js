'use strict';
/* =========================================================
   14. Navegación por secciones (barra inferior) y tabla plegable
   ========================================================= */
// Este archivo evita las barras invertidas: el conector de GitHub puede transformarlas al subirlo
const K_TABLE = 'hsr:tabla-abierta';
const VIEWS = [
  { id: 'prev', hash: '', label: 'Previsión', icon: '<svg viewBox="0 0 24 24"><path d="M3 15c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0 3.8-2 5-1"/><path d="M3 19c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0 3.8-2 5-1"/><circle cx="12" cy="7.5" r="3.2"/></svg>' },
  { id: 'ses', hash: '#sesiones', label: 'Sesiones', icon: '<svg viewBox="0 0 24 24"><path d="M12 2.5c3.6 3.4 5 8 5 12.5 0 3.4-2.2 6.5-5 6.5s-5-3.1-5-6.5c0-4.5 1.4-9.1 5-12.5z"/><path d="M12 6.5v11"/></svg>' },
  { id: 'ideas', hash: '#sugerencias', label: 'Sugerencias', icon: '<svg viewBox="0 0 24 24"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8.5 9.5h7M8.5 12.5h4"/></svg>' }
];
const ui = { view: 'prev', scroll: {} };
// Qué bloques pertenecen a cada sección
function tagSections() {
  for (const s of ['.vac-bar', '.top-row', '#days', '#detail', '.foot']) { const n = $(s); if (n) n.dataset.sec = 'prev'; }
  const ses = $('#sessions'); if (ses) ses.dataset.sec = 'ses';
  const ide = $('#ideas'); if (ide) ide.dataset.sec = 'ideas';
}
function viewFromHash() { const v = VIEWS.find(x => x.hash && x.hash === location.hash); return v ? v.id : 'prev'; }
function setView(id, opts) {
  const o = opts || {};
  if (!VIEWS.some(v => v.id === id)) id = 'prev';
  if (id !== ui.view) ui.scroll[ui.view] = window.scrollY;
  const changed = id !== ui.view;
  ui.view = id; document.body.dataset.view = id;
  for (const b of document.querySelectorAll('#tabbar .tab')) { const on = b.dataset.view === id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  if (!o.fromHash) {
    const v = VIEWS.find(x => x.id === id), want = v.hash || '#';
    if ((location.hash || '#') !== want) { try { history.pushState(null, '', v.hash || location.pathname + location.search); } catch (e) { /* sin historial */ } }
  }
  if (changed && !o.keepScroll) window.scrollTo(0, ui.scroll[id] || 0);
  updateBadges();
}
function updateBadges() {
  const pend = ideas.list ? ideas.list.filter(x => !x.done).length : 0;
  const b = $('#tabbar .tab[data-view="ideas"] .tab-badge'); if (!b) return;
  b.textContent = pend ? String(pend) : ''; b.hidden = !pend;
  b.setAttribute('aria-label', pend ? `${pend} pendientes` : '');
}
function buildTabbar() {
  const nav = el('nav', { id: 'tabbar', class: 'tabbar', 'aria-label': 'Secciones' },
    VIEWS.map(v => el('button', { type: 'button', class: 'tab', 'data-view': v.id, onclick: () => setView(v.id) },
      el('span', { class: 'tab-ico', 'aria-hidden': 'true', html: v.icon }),
      el('span', { class: 'tab-label', text: v.label }),
      v.id === 'ideas' ? el('span', { class: 'tab-badge', hidden: true }) : null)));
  $('.top').after(nav);
}

// Tabla hora a hora plegable: cerrada por defecto en el móvil
const tableOpenDefault = () => !(window.matchMedia && matchMedia('(max-width: 760px)').matches);
function tableOpen() { const v = store.get(K_TABLE, null); return v == null ? tableOpenDefault() : v === true; }
const _renderDetail = renderDetail;
renderDetail = function () {
  _renderDetail();
  const wrap = $('#detail .hh-wrap'); if (!wrap) return;
  const key = $('#detail .table-key');
  const det = el('details', { class: 'hh-toggle' }, el('summary', {},
    el('span', { class: 'hh-sum-open', text: 'Ver la tabla hora a hora (06:00–22:00)' }),
    el('span', { class: 'hh-sum-close', text: 'Ocultar la tabla hora a hora' })));
  det.open = tableOpen();
  wrap.before(det); det.append(wrap); if (key) det.append(key);
  det.addEventListener('toggle', () => { store.set(K_TABLE, det.open); });
};
const _highlightRows = highlightRows;
highlightRows = function (scroll) {
  const det = $('#detail .hh-toggle');
  if (scroll && det && !det.open) det.open = true; // «Ver hora» abre la tabla
  _highlightRows(scroll);
};
// Registrar una sesión desde el detalle del día lleva a la sección Sesiones
const _openSessionForm = openSessionForm;
openSessionForm = function (date, min) { setView('ses', { keepScroll: true }); _openSessionForm(date, min); };
// Mantiene el contador de sugerencias pendientes
const _renderIdeas = renderIdeas;
renderIdeas = function (focus) { _renderIdeas(focus); updateBadges(); };

(function initNav() {
  const old = $('#btnIdeas'); if (old) old.remove(); // la barra inferior sustituye al bocadillo
  buildTabbar(); tagSections();
  if (state.raw && $('#detail .hh-wrap')) renderDetail();
  setView(viewFromHash(), { fromHash: true, keepScroll: true });
  window.addEventListener('popstate', () => setView(viewFromHash(), { fromHash: true }));
  window.addEventListener('hashchange', () => setView(viewFromHash(), { fromHash: true }));
})();
Object.assign(window.HSR, { setView, ui });
