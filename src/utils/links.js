// Deep-link routes (#33). Scheme: groov:// (also exp:// in Expo Go and https on web).
//
//   groov://today                 Today tab
//   groov://progress              Progress tab
//   groov://challenges            Challenge tab
//   groov://habits                Habits tab
//   groov://habits/new            Habits tab with the new-habit sheet open
//   groov://habit/<id>            Habits tab with that habit's detail sheet open
//   groov://habit/<id>/done       Mark that habit done today (then show Today)
//   groov://settings              Settings tab
//   groov://dev/design            Design-token preview (dev builds and the web mockup only;
//                                 App.js gates it, the tab does not change)
//
// parseDeepLink returns { tab, habitId?, action? } (tab null = stay on the current tab) or null for unknown links
// (including the auth callback, which AuthContext handles).

export const TAB_INDEX = { today: 0, progress: 1, challenges: 2, challenge: 2, habits: 3, settings: 4 };

export function parseDeepLink(url) {
  if (!url || typeof url !== 'string') return null;
  let path = url;
  // A `route=` query param (web / the iOS mockup host) names the path directly.
  const rq = /[?&]route=([^&#]*)/.exec(url);
  if (rq) path = 'groov://' + decodeURIComponent(rq[1]).replace(/^\/+/, '');
  // Strip scheme/host for custom schemes, http(s) and exp:// (Expo Go adds "--/").
  path = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  path = path.replace(/^[^/]*\/--\//, '');          // exp://host/--/path
  path = path.replace(/^[^/]+\.[^/]+\/?/, (m) => (m.includes('.') && !m.startsWith('habit') ? '' : m)); // https://host/
  path = path.split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '');
  if (!path || path.startsWith('auth/')) return null;
  const parts = path.split('/');
  const head = parts[0].toLowerCase();

  if (head === 'habit' && parts[1]) {
    const action = (parts[2] || '').toLowerCase();
    if (action === 'done') return { tab: 0, habitId: parts[1], action: 'done' };
    return { tab: 3, habitId: parts[1], action: 'open' };
  }
  if (head === 'habits' && (parts[1] || '').toLowerCase() === 'new') return { tab: 3, action: 'new' };
  if (head === 'dev' && (parts[1] || '').toLowerCase() === 'design') return { tab: null, action: 'designPreview' };
  if (head in TAB_INDEX) return { tab: TAB_INDEX[head] };
  return null;
}

// Dev-only routes (groov://dev/design) are dropped unless this is a dev build or the web
// mockup, so a release build treats them like an unknown link (F-01 m1).
export function isRouteAllowed(route, { dev = false, mockup = false } = {}) {
  if (!route) return false;
  if (route.action === 'designPreview') return !!(dev || mockup);
  return true;
}

// Apply a parsed route (a deep link, a quick action, or in-app navigation through
// AppContext.openRoute): dev-only routes are dropped outside dev / the mockup; a `done`
// route runs `onDone` and shows Today; anything else switches to its tab (if it names one)
// and waits as the pending route for the owning screen. Returns false when dropped.
export function dispatchRoute(route, { dev = false, mockup = false, setRequestedTab, setPendingRoute, onDone } = {}) {
  if (!isRouteAllowed(route, { dev, mockup })) return false;
  if (route.action === 'done' && route.habitId) {
    onDone?.(route);
    setRequestedTab(0);
    return true;
  }
  if (route.tab != null) setRequestedTab(route.tab);
  setPendingRoute(route);
  return true;
}

// What the Habits tab does with a pending route: 'leave' (it names another tab: drop this
// tab's sheets), 'new' (the form), 'open' (the habit's detail sheet), 'edit' (the form for
// that habit; Edit from Today's detail sheet, C-02b) or null (not for this tab, or the
// habit is gone). `habit` is set for open / edit.
export function habitsRouteAction(route, habits, tab = 3) {
  if (!route || route.tab == null) return null;
  if (routeLeavesTab(route, tab)) return { type: 'leave' };
  if (route.action === 'new') return { type: 'new' };
  if (route.action === 'open' || route.action === 'edit') {
    const habit = (habits || []).find(h => h.id === route.habitId);
    return habit ? { type: route.action, habit } : { type: 'none' };
  }
  return { type: 'none' };
}

// A pending route sends the user away from `tab` only when it names a different tab;
// a tab-less route (the design preview) never closes that screen's sheets.
export function routeLeavesTab(route, tab) {
  return !!route && route.tab != null && route.tab !== tab;
}

// Build a link for sharing / notifications / widgets.
export function habitLink(habitId, action) {
  return `groov://habit/${habitId}${action ? `/${action}` : ''}`;
}
