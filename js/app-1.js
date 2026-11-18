'use strict';
/* =========================================================
   1. Configuración
   ========================================================= */
const LAT = 43.374, LON = -1.775, TZ = 'Europe/Paris';
const Q = `latitude=${LAT}&longitude=${LON}&timezone=Europe%2FParis&forecast_days=7`;
const URLS = {
  marine: `https://marine-api.open-meteo.com/v1/marine?${Q}&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period`,
  extra: `https://marine-api.open-meteo.com/v1/marine?${Q}&hourly=swell_wave_peak_period,sea_level_height_msl`,
  weather: `https://api.open-meteo.com/v1/forecast?${Q}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m&daily=sunrise,sunset&wind_speed_unit=kn`
};
const LINKS = [
  { id: 'viewsurf', label: 'Cámara Viewsurf', sub: 'Les Deux Jumeaux en directo', url: 'https://pv.viewsurf.com/850/Hendaye-Plage-des-jumeaux' },
  { id: 'surfline', label: 'Surfline', sub: 'Spot de Hendaye', url: 'https://www.surfline.com/surf-report/hendaye/584204204e65fad6a7709001' },
  { id: 'surfforecast', label: 'Surf-Forecast', sub: 'Tabla de 6 días', url: 'https://es.surf-forecast.com/breaks/Hendaye-Plage/forecasts/latest/six_day' },
  { id: 'sfcams', label: 'Más cámaras', sub: 'Listado de Surf-Forecast', url: 'https://es.surf-forecast.com/breaks/Hendaye-Plage/webcams/latest' },
  { id: 'tides', label: 'Mareas oficiales', sub: 'SHOM, San Juan de Luz', url: 'https://maree.info/141' }
];
const WK = [[0, 510], [1020, 1440]];          // L–J: antes de 08:30 y desde las 17:00
const DEF = {
  avail: { 0: [[0, 1440]], 1: WK, 2: WK, 3: WK, 4: WK, 5: [[0, 510], [900, 1440]], 6: [[0, 1440]] },
  shoreFactor: 0.5, twilight: 25, goodScore: 6, minSession: 30, tideOffset: 0, tideManual: null,
  maxOpen: 3.5, maxEnergy: 1500 // tope de seguridad para nivel medio
};
const K_SET = 'hsr:ajustes:v1', K_CACHE = 'hsr:cache:v1', K_THEME = 'hsr:tema', K_VAC = 'hsr:vacaciones';
const H0 = 6 * 60, H1 = 22 * 60; // horas visibles: de 06:00 a 22:00
const M2 = 745.236; // período de la marea semidiurna lunar, en minutos

/* =========================================================
   2. Utilidades
   ========================================================= */
const pad2 = n => String(n).padStart(2, '0');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const norm360 = d => ((d % 360) + 360) % 360;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const lc = s => !s || /^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1); // respeta «SW molesto»
function interp(x, T) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) {
    if (x <= T[i][0]) { const [x0, y0] = T[i - 1], [x1, y1] = T[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return T[T.length - 1][1];
}
const hm = m => { m = Math.round(m); if (m >= 1440) return '24:00'; m = ((m % 1440) + 1440) % 1440; return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); };
const parseHM = s => { const r = /^(\d{1,2}):(\d{2})/.exec(s || ''); if (!r) return null; const v = (+r[1]) * 60 + (+r[2]); return v >= 0 && v <= 1440 ? v : null; };
const dayNum = ds => Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10)) / 864e5;
const dateFromNum = n => new Date(n * 864e5).toISOString().slice(0, 10);
const dowOf = ds => new Date(dayNum(ds) * 864e5).getUTCDay();
const parseT = s => ({ date: s.slice(0, 10), min: (+s.slice(11, 13)) * 60 + (+s.slice(14, 16)) });
const absOf = (date, min) => dayNum(date) * 1440 + min;

const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function parisParts(d) {
  const p = {};
  for (const x of PARIS.formatToParts(d || new Date())) p[x.type] = x.value;
  let hh = +p.hour; if (hh === 24) hh = 0;
  return { date: `${p.year}-${p.month}-${p.day}`, min: hh * 60 + (+p.minute) };
}
let NOW_OVERRIDE = null; // solo para pruebas
function nowP() { const n = NOW_OVERRIDE ? { ...NOW_OVERRIDE } : parisParts(); n.abs = absOf(n.date, n.min); return n; }

const NF1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const f1 = x => (x == null || !isFinite(x)) ? '–' : NF1.format(x);
const f0 = x => (x == null || !isFinite(x)) ? '–' : NF0.format(Math.round(x));
const PTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = d => d == null || !isFinite(d) ? '–' : PTS[Math.round(norm360(d) / 22.5) % 16];

const DOW_S = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DOW_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MON_S = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MON_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function dayShortRel(date, now) {
  const diff = dayNum(date) - dayNum(now.date);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return `${DOW_S[dowOf(date)]} ${+date.slice(8, 10)}`;
}
function dayLong(date, now) {
  const diff = dayNum(date) - dayNum(now.date), name = DOW_L[dowOf(date)], dd = +date.slice(8, 10);
  if (diff === 0) return `Hoy, ${name} ${dd}`;
  if (diff === 1) return `Mañana, ${name} ${dd}`;
  return `${cap(name)} ${dd} ${MON_S[+date.slice(5, 7) - 1]}`;
}
const dayFull = date => `${cap(DOW_L[dowOf(date)])} ${+date.slice(8, 10)} de ${MON_L[+date.slice(5, 7) - 1]}`;

function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v; // solo SVG generado por la propia app
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(3)) if (c != null && c !== false) n.append(c.nodeType ? c : String(c));
  return n;
}
const $ = s => document.querySelector(s);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ARROW_PATH = 'M0 -6.5L4.2 4L0 1.6L-4.2 4Z';
function arrowEl(deg, cls) {
  if (deg == null || !isFinite(deg)) return null;
  const s = `<svg class="arr ${cls || ''}" viewBox="-8 -8 16 16" width="14" height="14" aria-hidden="true"><path d="${ARROW_PATH}" transform="rotate(${Math.round(norm360(deg + 180))})"/></svg>`;
  const span = document.createElement('span'); span.innerHTML = s; return span.firstChild;
}
const ICON_EXT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

/* =========================================================
   3. Persistencia (localStorage puede no existir: siempre con try/catch)
   ========================================================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
function cleanWins(list) {
  const w = (Array.isArray(list) ? list : [])
    .filter(p => Array.isArray(p) && p.length === 2)
    .map(([a, b]) => [clamp(Math.round(+a), 0, 1440), clamp(Math.round(+b), 0, 1440)])
    .filter(([a, b]) => isFinite(a) && isFinite(b) && b > a)
    .sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const p of w) { const l = out[out.length - 1]; if (l && p[0] <= l[1]) l[1] = Math.max(l[1], p[1]); else out.push(p.slice()); }
  return out;
}
function normalizeSettings(s) {
  const out = JSON.parse(JSON.stringify(DEF));
  if (s && typeof s === 'object') {
    if (s.avail && typeof s.avail === 'object') for (let d = 0; d < 7; d++) if (Array.isArray(s.avail[d])) out.avail[d] = cleanWins(s.avail[d]);
    for (const k of ['shoreFactor', 'twilight', 'goodScore', 'minSession', 'tideOffset', 'maxOpen', 'maxEnergy']) if (typeof s[k] === 'number' && isFinite(s[k])) out[k] = s[k];
    if (s.tideManual && typeof s.tideManual.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.tideManual.date) && parseHM(s.tideManual.time) != null) out.tideManual = { date: s.tideManual.date, time: s.tideManual.time };
  }
  out.shoreFactor = clamp(out.shoreFactor, .3, .7);
  out.twilight = clamp(Math.round(out.twilight), 0, 45);
  out.goodScore = clamp(out.goodScore, 3, 9.5);
  out.minSession = clamp(Math.round(out.minSession), 15, 180);
  out.tideOffset = clamp(Math.round(out.tideOffset), -240, 240);
  out.maxOpen = clamp(Math.round(out.maxOpen * 10) / 10, 2, 6);
  out.maxEnergy = clamp(Math.round(out.maxEnergy / 50) * 50, 1500, 2000);
  return out;
}
let S = normalizeSettings(store.get(K_SET, null));

/* =========================================================
   4. Datos: Open-Meteo, caché y modo de ejemplo
   ========================================================= */
async function fetchJSON(url, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), ms || 15000);
  try {
    const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function loadLive() {
  const extraP = fetchJSON(URLS.extra).catch(() => null); // marea y período de pico: opcionales
  const [marine, weather] = await Promise.all([fetchJSON(URLS.marine), fetchJSON(URLS.weather)]);
  const extra = await extraP;
  if (!marine || !marine.hourly || !Array.isArray(marine.hourly.time) || !weather || !weather.hourly || !Array.isArray(weather.hourly.time)) throw new Error('Respuesta incompleta de Open-Meteo');
  return { marine, weather, extra, fetchedAt: Date.now() };
}
function cacheUsable(c, now) {
  try {
    if (!c || !c.marine || !c.weather || !c.fetchedAt) return false;
    if (Date.now() - c.fetchedAt > 48 * 3600e3) return false;
    const t = c.weather.hourly.time; return t[t.length - 1].slice(0, 10) >= now.date;
  } catch (e) { return false; }
}

function mergeRaw(raw) {
  const W = raw.weather.hourly, M = raw.marine.hourly, E = raw.extra && raw.extra.hourly ? raw.extra.hourly : null;
  const unit = raw.weather.hourly_units && raw.weather.hourly_units.wind_speed_10m;
  const k = unit && /km/.test(unit) ? 1 / 1.852 : unit && /m\/s/.test(unit) ? 1.94384 : 1;
  const mI = new Map(M.time.map((t, i) => [t, i]));
  const eI = E && Array.isArray(E.time) ? new Map(E.time.map((t, i) => [t, i])) : null;
  const v = (arr, i) => (arr && i != null && arr[i] != null && isFinite(arr[i])) ? +arr[i] : null;
  const hours = W.time.map((t, i) => {
    const { date, min } = parseT(t);
    const mi = mI.get(t), ei = eI ? eI.get(t) : null;
    const wind = v(W.wind_speed_10m, i), gust = v(W.wind_gusts_10m, i);
    return {
      t, date, min, abs: absOf(date, min),
      hs: v(M.wave_height, mi), wdir: v(M.wave_direction, mi), wper: v(M.wave_period, mi),
      sh: v(M.swell_wave_height, mi), sdir: v(M.swell_wave_direction, mi), sper: v(M.swell_wave_period, mi),
      speak: E ? v(E.swell_wave_peak_period, ei) : null, slh: E ? v(E.sea_level_height_msl, ei) : null,
      wind: wind == null ? null : wind * k, windDir: v(W.wind_direction_10m, i), gust: gust == null ? null : gust * k,
      temp: v(W.temperature_2m, i)
    };
  });
  const sun = new Map();
  const D = raw.weather.daily;
  if (D && Array.isArray(D.time)) D.time.forEach((d, i) => {
    const r = D.sunrise && D.sunrise[i], s = D.sunset && D.sunset[i];
    if (r && s) sun.set(d, { rise: parseT(r).min, set: parseT(s).min });
  });
  return { hours, sun };
}

/* Sol (NOAA): solo para el modo de ejemplo o si faltara el dato de la API */
function parisOffset(date) {
  const p = parisParts(new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 12, 0)));
  return p.min - 720 + (dayNum(p.date) - dayNum(date)) * 1440;
}
function sunNOAA(date) {
  const n = dayNum(date) - dayNum(date.slice(0, 4) + '-01-01') + 1;
  const g = 2 * Math.PI / 365 * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const de = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const la = LAT * Math.PI / 180;
  const cosH = Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(de)) - Math.tan(la) * Math.tan(de);
  const H = Math.acos(clamp(cosH, -1, 1)) * 180 / Math.PI;
  const off = parisOffset(date);
  return { rise: Math.round(720 - 4 * (LON + H) - eq + off), set: Math.round(720 - 4 * (LON - H) - eq + off) };
}

/* Datos de ejemplo con la misma estructura que la API (claramente etiquetados en pantalla) */
function makeDemo(startDate) {
  const d0 = dayNum(startDate);
  const time = [], dailyTime = [], sunrise = [], sunset = [];
  const M = { time, wave_height: [], wave_direction: [], wave_period: [], swell_wave_height: [], swell_wave_direction: [], swell_wave_period: [] };
  const E = { time, swell_wave_peak_period: [], sea_level_height_msl: [] };
  const Wh = { time, wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [], temperature_2m: [] };
  let seed = (d0 % 9973) + 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const SW = [[1.1, 1.3, 320, 10.5, 11.5], [1.15, 1.95, 312, 11, 13], [2.0, 2.3, 300, 13, 14.5], [2.9, 3.1, 284, 15, 15.5], [2.1, 1.5, 322, 13, 12], [1.3, 1.0, 345, 10, 9], [0.7, 0.55, 330, 8, 7.5]];
  const WI = [h => h < 12 ? [6, 150] : [12, 315], h => h < 13 ? [5, 170] : h < 17 ? [9, 285] : [3.5, 160], () => [8, 135], () => [15, 225], h => h < 11 ? [3, 200] : [10, 320], () => [14, 350], () => [6, 95]];
  const T0 = d0 * 1440 + 5 * 60 + 10;
  for (let d = 0; d < 7; d++) {
    const date = dateFromNum(d0 + d);
    dailyTime.push(date);
    const s = sunNOAA(date); sunrise.push(`${date}T${hm(s.rise)}`); sunset.push(`${date}T${hm(s.set)}`);
    const [o0, o1, dir, p0, p1] = SW[d];
    for (let h = 0; h < 24; h++) {
      time.push(`${date}T${pad2(h)}:00`);
      const f = h / 23;
      let open = lerp(o0, o1, f);
      if (d === 1) open = h < 15 ? 1.15 : lerp(1.2, 1.95, (h - 15) / 5);
      open += (rnd() - .5) * .08;
      const per = lerp(p0, p1, f) + (rnd() - .5) * .4, sdir = dir + (rnd() - .5) * 8;
      M.wave_height.push(+open.toFixed(2)); M.swell_wave_height.push(+(open * .86).toFixed(2));
      M.wave_direction.push(Math.round(sdir + 6)); M.swell_wave_direction.push(Math.round(sdir));
      M.swell_wave_period.push(+(per * .86).toFixed(2)); M.wave_period.push(+(per * .74).toFixed(2));
      E.swell_wave_peak_period.push(+per.toFixed(2));
      const abs = (d0 + d) * 1440 + h * 60;
      const amp = 1.25 + .45 * Math.cos(2 * Math.PI * (abs - T0) / (14.77 * 1440));
      E.sea_level_height_msl.push(+(amp * Math.cos(2 * Math.PI * (abs - T0) / M2)).toFixed(2));
      const [kn, wd] = WI[d](h), kk = Math.max(0, kn + (rnd() - .5) * 2);
      Wh.wind_speed_10m.push(+kk.toFixed(1)); Wh.wind_direction_10m.push(Math.round(norm360(wd + (rnd() - .5) * 20)));
      Wh.wind_gusts_10m.push(+(kk * 1.45 + 1).toFixed(1)); Wh.temperature_2m.push(+(13 + 3 * Math.sin((h - 9) / 24 * 2 * Math.PI) + (rnd() - .5)).toFixed(1));
    }
  }
  return { marine: { hourly: M }, extra: { hourly: E }, weather: { hourly: Wh, hourly_units: { wind_speed_10m: 'kn' }, daily: { time: dailyTime, sunrise, sunset } }, fetchedAt: Date.now() };
}

/* =========================================================
   5. Mareas: extremos del modelo + ajuste manual o estimación
   ========================================================= */
function detectExtremes(hours) {
  const raw = [];
  for (let i = 1; i < hours.length - 1; i++) {
    const a = hours[i - 1].slh, b = hours[i].slh, c = hours[i + 1].slh;
    if (a == null || b == null || c == null) continue;
    if (hours[i + 1].abs - hours[i - 1].abs !== 120) continue;
    let type = null;
    if (b > a && b >= c) type = 'high'; else if (b < a && b <= c) type = 'low';
    if (!type) continue;
    const den = a - 2 * b + c;
    const dl = den !== 0 ? clamp(.5 * (a - c) / den, -.5, .5) : 0; // vértice de la parábola
    raw.push({ abs: hours[i].abs + dl * 60, val: b - .25 * (a - c) * dl, type });
  }
  const out = [];
  for (const e of raw) {
    const last = out[out.length - 1];
    if (!last) { out.push(e); continue; }
    if (last.type === e.type) { if ((e.type === 'high') === (e.val > last.val)) out[out.length - 1] = e; continue; }
    if (Math.abs(e.val - last.val) < .25 || e.abs - last.abs < 150) continue; // ruido del modelo
    out.push(e);
  }
  return out;
}
function interpTide(abs, e1, e2) {
  const p = clamp((abs - e1.abs) / (e2.abs - e1.abs), 0, 1);
  const c = (1 - Math.cos(Math.PI * p)) / 2;
  const rising = e1.type === 'low';
  return { rel: rising ? c : 1 - c, rising, level: e1.val + (e2.val - e1.val) * c };
}
function tideAt(abs, ex) {
  const n = ex.length;
  if (n < 2) return null;
  if (abs < ex[0].abs) return interpTide(abs, { abs: ex[0].abs - M2 / 2, val: ex[1].val, type: ex[1].type }, ex[0]);
  if (abs >= ex[n - 1].abs) return interpTide(abs, ex[n - 1], { abs: ex[n - 1].abs + M2 / 2, val: ex[n - 2].val, type: ex[n - 2].type });
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ex[mid].abs <= abs) lo = mid; else hi = mid; }
  return interpTide(abs, ex[lo], ex[hi]);
}
function buildTide(hours, rawEx) {
  if (rawEx.length >= 4) {
    let sum = 0; for (let i = 1; i < rawEx.length; i++) sum += Math.abs(rawEx[i].val - rawEx[i - 1].val);
    if (sum / (rawEx.length - 1) >= .4) {
      const ex = rawEx.map(e => ({ abs: e.abs + S.tideOffset, val: e.val, type: e.type }));
      return { mode: 'model', ex, fn: a => tideAt(a, ex) };
    }
  }
  if (S.tideManual && hours.length) {
    const t0 = absOf(S.tideManual.date, parseHM(S.tideManual.time));
    const a0 = hours[0].abs - 900, a1 = hours[hours.length - 1].abs + 900, ex = [];
    for (let k = Math.floor((a0 - t0) / M2); k <= Math.ceil((a1 - t0) / M2); k++) {
      ex.push({ abs: t0 + k * M2, val: 1, type: 'high' }, { abs: t0 + k * M2 + M2 / 2, val: -1, type: 'low' });
    }
    ex.sort((a, b) => a.abs - b.abs);
    return { mode: 'manual', ex, fn: a => tideAt(a, ex) };
  }
  return { mode: 'none', ex: [], fn: () => null };
}
const tideLabel = r => r < .15 ? 'Bajamar' : r < .4 ? 'Media-baja' : r < .6 ? 'Media marea' : r < .85 ? 'Media-alta' : 'Pleamar';
const tideShort = r => r < .15 ? 'BM' : r < .4 ? 'M-B' : r < .6 ? 'M' : r < .85 ? 'M-A' : 'PM';

/* =========================================================
   6. Motor de análisis específico de Hendaya
   ========================================================= */
// Dirección de procedencia del swell → factor (Cabo Higuer tapa W y SW)
const DIR_T = [[0, 1], [15, 1], [45, .6], [90, .12], [180, .05], [200, .05], [235, .18], [260, .42], [275, .68], [290, 1], [360, 1]];
// Nivel intermedio: altura en boya óptima de 1,5 a 2,5 m; hasta ~3 m solo con período moderado
const openTable = per => [[.5, .03], [1, .35], [1.25, .7], [1.5, .95], [2, 1], [2.5, 1], [3, interp(per, [[12, .8], [14, .55]])], [3.5, .3], [4.5, .1]];
// Energía (kJ): óptima de 300 a 1.000 kJ
const EN_T = [[0, .2], [100, .45], [300, .9], [450, 1], [1000, 1], [1250, .8], [1500, .55], [2000, .3]];
// Período (s) → calidad del oleaje
const PER_T = [[5, .3], [8, .5], [9, .6], [10, .78], [12, .9], [14, 1], [25, 1]];

function dirInfo(d) {
  const dd = norm360(d), f = interp(dd, DIR_T);
  let label;
  if (f >= .9) label = 'Óptima';
  else if (f >= .6) label = 'Buena';
  else if (dd >= 180 && dd < 290) label = f >= .3 ? 'Penalizada por Higuer' : 'Bloqueada por Higuer';
  else label = 'Desfavorable';
  return { f, label };
}
function perInfo(p) {
  const f = interp(p, PER_T), r = Math.round(p); // la etiqueta usa el mismo redondeo que se muestra
  const label = r < 9 ? 'Mar de viento, desordenado' : r < 10 ? 'Transición' : r <= 13 ? 'Mar de fondo decente' : 'Swell potente';
  return { f, label };
}
// Energía de cada ola por metro de frente: ρ·g²·H²·T² / (32π) ≈ 0,98·H²·T² kJ (escala comparable a Surf-Forecast)
function energyInfo(H, T) {
  const kj = 0.98 * H * H * T * T;
  const label = kj > S.maxEnergy ? 'Peligrosa para nivel medio' : kj > 1000 ? 'Alta' : kj >= 300 ? 'Óptima para nivel medio' : kj >= 100 ? 'Baja, de tablón' : 'Muy baja';
  return { kj, label };
}
const fk = v => (v == null || !isFinite(v)) ? '–' : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // 1.500
const WIND = {
  glassy: { label: 'GLASSY', tone: 'good' },
  off: { label: 'OFF (Offshore Ideal)', short: 'OFF', tone: 'good' },
  xoff: { label: 'CROSS-OFF', tone: 'ok' },
  swstrong: { label: 'SW MOLESTO', tone: 'warn' },
  onsoft: { label: 'ONSHORE SUAVE', tone: 'warn' },
  on: { label: 'ONSHORE', tone: 'bad' },
  cross: { label: 'CROSS-SHORE', tone: 'warn' },
  na: { label: 'SIN DATO', short: '–', tone: 'na' }
};
function windInfo(spd, dir) {
  let key;
  if (spd == null || dir == null) key = 'na';
  else {
    const d = norm360(dir);
    if (spd < 5) key = 'glassy';
    else if (d >= 80 && d < 195) key = 'off';                            // E, SE, S: limpia la ola
    else if (d >= 195 && d < 245) key = spd <= 12 ? 'xoff' : 'swstrong'; // SSW, SW
    else if (d >= 280 || d < 35) key = spd > 10 ? 'on' : 'onsoft';       // WNW, NW, N
    else key = 'cross';                                                   // W y NE
  }
  let f;
  switch (key) {
    case 'na': case 'glassy': f = 1; break;
    case 'off': f = spd <= 15 ? 1 : spd <= 25 ? lerp(1, .7, (spd - 15) / 10) : .6; break;
    case 'xoff': f = spd <= 8 ? .93 : lerp(.93, .8, (spd - 8) / 4); break;
    case 'swstrong': f = spd <= 18 ? lerp(.72, .55, (spd - 12) / 6) : .45; break;
    case 'cross': f = spd <= 8 ? lerp(.85, .65, (spd - 5) / 3) : spd <= 15 ? lerp(.65, .4, (spd - 8) / 7) : .3; break;
    default: f = spd <= 8 ? lerp(.75, .5, (spd - 5) / 3) : spd <= 15 ? lerp(.5, .25, (spd - 8) / 7) : .15;
  }
  const w = WIND[key];
  return { key, label: w.label, short: w.short || w.label, tone: w.tone, f, fav: key === 'glassy' || key === 'off' || key === 'xoff' };
}
function tideFactor(t) {
  if (!t) return 1;
  const r = t.rel;
  let f = r < .1 ? .8 : r < .25 ? .9 : r <= .75 ? 1 : r <= .9 ? .88 : .75;
  if (t.rising && r < .9) f = Math.min(1, f + .05);
  return f;
}
const SECTORS = {
  cas: { name: 'Casino', zone: 'centro', short: 'Cas.' },
  sok: { name: 'Sokoburu / El Dique', zone: 'oeste', short: 'Sok.' },
  jum: { name: 'Les Deux Jumeaux', zone: 'este', short: 'Jum.' }
};
function sectorFor(x) {
  const swWind = x.windI.key === 'swstrong';
  const current = x.open >= 2.2 && x.per >= 14; // corriente fuerte estimada (no hay dato directo)
  if (x.open > 2.5 || swWind || current) {
    const why = x.open > 2.5 ? `Mucho mar (${f1(x.open)} m en boya): el dique protege y ordena la corriente`
      : swWind ? `Viento SW de ${f0(x.wind)} nudos: el dique hace de abrigo`
      : 'Mar grande y con período: probable corriente fuerte, más controlada junto al dique';
    return { key: 'sok', why };
  }
  const t = x.tide;
  if (x.per >= 12 && x.open >= 1.2 && t && t.rel >= .3 && t.rel <= .75)
    return { key: 'jum', why: `Mar de fondo de ${f0(x.per)} s con media marea: picos más definidos en el este` };
  if (!t || t.rel <= .55 || t.rising)
    return { key: 'cas', why: x.open < 1.4 ? 'Mar pequeño: el centro rasca el máximo tamaño' : (t && t.rising ? 'Mar mediano y marea subiendo' : 'Mar mediano con marea media-baja') };
  return { key: 'cas', why: 'Opción por defecto con marea alta bajando' };
}
function analyze(h) {
  const x = Object.assign({}, h);
  x.tide = state.tide ? state.tide.fn(h.abs) : null;
  x.windI = windInfo(h.wind, h.windDir);
  x.ok = h.hs != null;
  if (!x.ok) { x.score = null; return x; }
  x.open = h.hs;
  const swDom = h.sh != null && h.sh >= .5 * h.hs;
  x.dir = swDom ? h.sdir : (h.wdir != null ? h.wdir : h.sdir);
  x.per = swDom ? (h.speak != null ? h.speak : h.sper) : (h.wper != null ? h.wper : h.sper);
  x.perKind = swDom && h.speak != null ? 'pico' : 'medio';
  if (x.dir == null) x.dir = 315;
  if (x.per == null) x.per = 8;
  x.shore = x.open * S.shoreFactor;
  x.dirI = dirInfo(x.dir); x.perI = perInfo(x.per); x.en = energyInfo(x.open, x.per);
  // Tope de seguridad para nivel medio: exceso de tamaño o de energía (corriente)
  x.danger = x.open > S.maxOpen || x.en.kj > S.maxEnergy;
  x.flat = !x.danger && (x.open < 1 || x.per < 8);
  if (x.danger) { x.score = 1; x.sector = null; return x; }
  const sc = 10 * interp(x.open, openTable(x.per)) * Math.pow(interp(x.en.kj, EN_T), .6) * Math.pow(x.perI.f, .4)
    * Math.pow(x.dirI.f, .9) * Math.pow(x.windI.f, .9) * Math.pow(tideFactor(x.tide), .5);
  x.score = clamp(sc, 1, 10);
  if (x.flat) x.score = Math.min(x.score, 3); // plato: nunca cuenta como bueno
  x.sector = sectorFor(x);
  return x;
}
const scoreClass = v => 's' + clamp(Math.round(v), 1, 10);

/* =========================================================
   7. Planificación: horarios, luz, franjas y Zonas Grises
   ========================================================= */
// En Modo Vacaciones se usa todo el día; si no, tus ventanas de Ajustes (horario laboral)
const availOf = dow => state.vacation ? [[0, 1440]] : (S.avail[dow] || []).slice().sort((a, b) => a[0] - b[0]);
const isAvailAt = (day, m) => availOf(day.dow).some(([a, b]) => m >= a && m < b);
function hourAt(day, m) {
  let best = null, bd = 1e9;
  for (const x of day.hours) { const d = Math.abs(x.min - m); if (d < bd) { bd = d; best = x; } }
  return best;
}
function valAt(day, m, key) {
  let a = null, b = null;
  for (const x of day.hours) { if (!x.ok) continue; if (x.min <= m) a = x; if (x.min >= m) { b = x; break; } }
  if (!a) return b ? b[key] : null;
  if (!b || b.min === a.min) return a[key];
  return a[key] + (b[key] - a[key]) * (m - a.min) / (b.min - a.min);
}
// Huecos con luz (amanecer a atardecer + crepúsculo) dentro de tu disponibilidad
function windowsFor(d, now) {
  const isToday = d.date === now.date, res = [];
  for (const [a, b] of availOf(d.dow)) {
    let s = Math.max(a, d.dawn); const e = Math.min(b, d.dusk);
    if (isToday) s = Math.max(s, Math.ceil(now.min / 5) * 5);
    if (e - s > 0) res.push([s, e]);
  }
  return res;
}
// Quita de un hueco las horas marcadas como PASADO / PELIGROSO
function splitSafe(d, s, e) {
  let parts = [[s, e]];
  for (const x of d.hours) {
    if (!x.ok || !x.danger) continue;
    const a = x.min - 30, b = x.min + 30;
    parts = parts.flatMap(([p, q]) => (b <= p || a >= q) ? [[p, q]] : [[p, Math.min(q, a)], [Math.max(p, b), q]].filter(([u, v]) => v - u > 0));
  }
  return parts;
}
function makeFranja(d, s, e) {
  const c = d.hours.filter(x => x.ok && !x.danger && x.min + 30 > s && x.min - 30 < e);
  if (!c.length) return null;
  let pi = 0; c.forEach((x, i) => { if (x.score > c[pi].score) pi = i; });
  const pk = c[pi], thr = pk.score - .8;
  let i0 = pi, i1 = pi;
  while (i0 > 0 && c[i0 - 1].score >= thr && c[i0 - 1].min === c[i0].min - 60) i0--;
  while (i1 < c.length - 1 && c[i1 + 1].score >= thr && c[i1 + 1].min === c[i1].min + 60) i1++;
  let bs = Math.max(s, c[i0].min - 30), be = Math.min(e, c[i1].min + 30);
  if (be - bs < S.minSession) { bs = s; be = e; }
  const dur = be - bs;
  return { s, e, bs, be, dur, peak: pk.score, peakHour: pk, short: e - s < 60, rank: pk.score * (.85 + .15 * Math.min(1, dur / 90)) };
}
