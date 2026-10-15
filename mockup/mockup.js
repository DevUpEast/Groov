// iOS mockup host page. Wraps any web build of a mobile app in an iPhone frame.
//
// URL state (all optional): ?app=groov&device=iphone16pro&theme=dark&route=today
//   &scale=fit|1|0.75|0.5&chrome=0 (hide controls)&frame=0 (hide bezel)
// Apps come from apps.json. An app can opt into the "mockup-v1" postMessage contract:
//   host -> app: { type: 'mockup:theme', theme: 'light'|'dark'|'system' }
//                { type: 'mockup:navigate', route: 'today' }
//   app -> host: { type: 'mockup:statusbar', style: 'light'|'dark' }
//                { type: 'mockup:ready' }
// The host also passes the state as query params on the app URL (theme, route,
// insets, plus the app's own `params` from apps.json) so apps without the contract
// still get the right safe-area insets and initial route.

const DEVICES = [
  { id: 'iphone16pro', name: 'iPhone 16 Pro', w: 402, h: 874, r: 55, top: 62, bottom: 34, island: [126, 37], notch: true },
  { id: 'iphone16promax', name: 'iPhone 16 Pro Max', w: 440, h: 956, r: 55, top: 62, bottom: 34, island: [126, 37], notch: true },
  { id: 'iphone16', name: 'iPhone 16', w: 393, h: 852, r: 50, top: 59, bottom: 34, island: [126, 37], notch: true },
  { id: 'iphone13mini', name: 'iPhone 13 mini', w: 375, h: 812, r: 44, top: 50, bottom: 34, island: [160, 32], notch: true },
  { id: 'iphonese', name: 'iPhone SE', w: 375, h: 667, r: 0, top: 20, bottom: 0, island: [0, 0], notch: false },
  { id: 'ipadmini', name: 'iPad mini', w: 744, h: 1133, r: 24, top: 24, bottom: 20, island: [0, 0], notch: false },
];

const HOST_KEYS = new Set(['app', 'device', 'theme', 'route', 'scale', 'chrome', 'frame', 'clock']);
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const state = {
  app: qs.get('app') || '',
  device: qs.get('device') || 'iphone16pro',
  theme: qs.get('theme') || 'system',
  route: qs.get('route') || '',
  scale: qs.get('scale') || 'fit',
  chrome: qs.get('chrome') !== '0',
  frame: qs.get('frame') !== '0',
};
let apps = [];

function currentApp() { return apps.find(a => a.id === state.app) || apps[0]; }
function currentDevice() { return DEVICES.find(d => d.id === state.device) || DEVICES[0]; }

function appUrl() {
  const app = currentApp();
  if (!app) return 'about:blank';
  const d = currentDevice();
  const url = new URL(app.url, location.href);
  const p = url.searchParams;
  Object.entries(app.params || {}).forEach(([k, v]) => p.set(k, v));
  // Any host query param the host itself does not use is forwarded to the app (e.g. ?demo=0).
  qs.forEach((v, k) => { if (!HOST_KEYS.has(k)) p.set(k, v); });
  p.set('theme', state.theme);
  p.set('insets', `${d.top},0,${d.bottom},0`);
  p.set('route', state.route || app.defaultRoute || '');
  p.set('mockup', '1');
  return url.toString();
}

function applyDevice() {
  const d = currentDevice();
  const phone = $('phone');
  phone.style.setProperty('--w', d.w + 'px');
  phone.style.setProperty('--h', d.h + 'px');
  phone.style.setProperty('--r', d.r + 'px');
  phone.style.setProperty('--top', d.top + 'px');
  phone.style.setProperty('--bottom', d.bottom + 'px');
  phone.style.setProperty('--island-w', d.island[0] + 'px');
  phone.style.setProperty('--island-h', d.island[1] + 'px');
  phone.classList.toggle('notchless', !d.notch);
  phone.classList.toggle('noframe', !state.frame);
  applyScale();
}

function applyScale() {
  const d = currentDevice();
  const phone = $('phone');
  const bz = state.frame ? 12 : 0;
  const stage = $('stage');
  let s = parseFloat(state.scale);
  if (state.scale === 'fit' || !Number.isFinite(s)) {
    const availW = stage.clientWidth - 48;
    const availH = stage.clientHeight - 48 - ($('hint').offsetHeight || 0);
    s = Math.min(1, availW / (d.w + bz * 2), availH / (d.h + bz * 2));
  }
  phone.style.transform = `scale(${s})`;
  // Reserve layout space for the scaled element so the stage can scroll.
  phone.style.marginBottom = `${(d.h + bz * 2) * (s - 1)}px`;
}

function applyStatusStyle(style) {
  const phone = $('phone');
  phone.classList.toggle('status-dark', style === 'dark');
  phone.classList.toggle('status-light', style !== 'dark');
}

function load() {
  const f = $('screenFrame');
  f.src = appUrl();
  $('bare').href = appUrl();
  applyStatusStyle(state.theme === 'dark' ? 'light' : 'dark');
}

function post(msg) {
  try { $('screenFrame').contentWindow.postMessage(msg, '*'); } catch {}
}

function syncUrl(replace = true) {
  const p = new URLSearchParams();
  if (state.app) p.set('app', state.app);
  p.set('device', state.device);
  if (state.theme !== 'system') p.set('theme', state.theme);
  if (state.route) p.set('route', state.route);
  if (state.scale !== 'fit') p.set('scale', state.scale);
  if (!state.chrome) p.set('chrome', '0');
  if (!state.frame) p.set('frame', '0');
  const url = `${location.pathname}?${p.toString()}`;
  if (replace) history.replaceState(null, '', url);
  return location.origin + url;
}

function wireControls() {
  const appSel = $('app');
  apps.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.name; appSel.appendChild(o); });
  DEVICES.forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = `${d.name} · ${d.w}×${d.h}`; $('device').appendChild(o); });
  const app = currentApp();
  state.app = app ? app.id : '';
  appSel.value = state.app;
  $('device').value = currentDevice().id;
  $('theme').value = state.theme;
  $('scale').value = state.scale;
  $('route').value = state.route;
  const routes = $('routes');
  (app?.routes || []).forEach(r => { const o = document.createElement('option'); o.value = r; routes.appendChild(o); });

  appSel.onchange = () => { state.app = appSel.value; state.route = ''; $('route').value = ''; syncUrl(); load(); };
  $('device').onchange = () => { state.device = $('device').value; syncUrl(); applyDevice(); load(); };
  $('theme').onchange = () => { state.theme = $('theme').value; syncUrl(); post({ type: 'mockup:theme', theme: state.theme }); applyStatusStyle(state.theme === 'dark' ? 'light' : 'dark'); $('bare').href = appUrl(); };
  $('scale').onchange = () => { state.scale = $('scale').value; syncUrl(); applyScale(); };
  $('go').onclick = () => { state.route = $('route').value.trim(); syncUrl(); post({ type: 'mockup:navigate', route: state.route }); $('bare').href = appUrl(); };
  $('route').onkeydown = (e) => { if (e.key === 'Enter') $('go').click(); };
  $('reload').onclick = () => load();
  $('frameToggle').onclick = () => { state.frame = !state.frame; syncUrl(); applyDevice(); };
  $('share').onclick = async () => {
    const link = syncUrl();
    try { await navigator.clipboard.writeText(link); $('share').textContent = 'Copied'; setTimeout(() => { $('share').textContent = 'Copy link'; }, 1200); }
    catch { prompt('Copy this link', link); }
  };
  window.addEventListener('resize', applyScale);
  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'mockup:statusbar' && (m.style === 'light' || m.style === 'dark')) applyStatusStyle(m.style);
    if (m.type === 'mockup:ready') document.body.dataset.ready = '1';
  });
}

function tickClock() {
  // Apple marketing time, unless the page asks for the real clock.
  if (qs.get('clock') === 'real') {
    const d = new Date();
    $('clock').textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  } else $('clock').textContent = '9:41';
}

(async function init() {
  document.body.classList.toggle('nochrome', !state.chrome);
  try {
    const res = await fetch('apps.json', { cache: 'no-store' });
    apps = (await res.json()).apps || [];
  } catch { apps = []; }
  if (apps.length === 0) {
    $('hint').textContent = 'No apps configured. Add one to mockup/apps.json.';
  } else {
    $('hint').textContent = 'Tip: pass ?chrome=0&frame=0 for clean screenshots, ?device=… to switch devices, ?route=… to deep-link. Apps implementing the mockup-v1 contract react to theme and route changes live.';
  }
  wireControls();
  applyDevice();
  tickClock();
  setInterval(tickClock, 15000);
  load();
})();
