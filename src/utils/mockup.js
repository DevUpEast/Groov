// Web-only hooks for the iOS mockup host page (mockup/). Everything here is a
// no-op on native. Contract "mockup-v1":
//   query params on the app URL: theme=light|dark|system, insets=top,right,bottom,left,
//     route=<path> (consumed by parseDeepLink), guest=1 (auto anonymous session),
//     demo=1 (seed starter habits + 30 days of history), lang=<locale code> (UI language
//     for this page load, not persisted), nudge=1 (a sample AI nudge card on Today), mockup=1
//   window messages from the host: { type: 'mockup:theme', theme }, { type: 'mockup:navigate', route }
//   messages to the host: { type: 'mockup:statusbar', style }, { type: 'mockup:ready' }
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

function params() {
  if (!isWeb) return new URLSearchParams();
  try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); }
}

export const mockupParams = {
  get active() { return isWeb && params().get('mockup') === '1'; },
  get guest() { return isWeb && params().get('guest') === '1'; },
  get demo() { return isWeb && params().get('demo') === '1'; },
  get lang() { return (isWeb && params().get('lang')) || null; },
  // nudge=1: Today shows a fixed sample AI nudge card (review shots; no AI call).
  get nudge() { return isWeb && params().get('nudge') === '1'; },
  get theme() { const t = params().get('theme'); return t === 'light' || t === 'dark' ? t : null; },
  get insets() {
    const raw = params().get('insets');
    if (!raw) return null;
    const [top, right, bottom, left] = raw.split(',').map(n => Math.max(0, Number(n) || 0));
    return { top, right, bottom, left };
  },
};

// Subscribe to host messages. Returns an unsubscribe function.
export function onMockupMessage(handler) {
  if (!isWeb) return () => {};
  const listener = (e) => {
    const m = e && e.data;
    if (m && typeof m === 'object' && typeof m.type === 'string' && m.type.startsWith('mockup:')) handler(m);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export function postToMockupHost(msg) {
  if (!isWeb || window.parent === window) return;
  try { window.parent.postMessage(msg, '*'); } catch {}
}
