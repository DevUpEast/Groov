import { parseDeepLink, habitLink, isRouteAllowed, routeLeavesTab } from '../links';

describe('parseDeepLink', () => {
  it('maps tab routes', () => {
    expect(parseDeepLink('groov://today')).toEqual({ tab: 0 });
    expect(parseDeepLink('groov://progress/')).toEqual({ tab: 1 });
    expect(parseDeepLink('groov://challenges')).toEqual({ tab: 2 });
    expect(parseDeepLink('groov://habits')).toEqual({ tab: 3 });
    expect(parseDeepLink('groov://settings?x=1')).toEqual({ tab: 4 });
  });
  it('maps habit routes', () => {
    expect(parseDeepLink('groov://habit/123')).toEqual({ tab: 3, habitId: '123', action: 'open' });
    expect(parseDeepLink('groov://habit/123/done')).toEqual({ tab: 0, habitId: '123', action: 'done' });
    expect(parseDeepLink('groov://habits/new')).toEqual({ tab: 3, action: 'new' });
  });
  it('handles Expo Go and web forms', () => {
    expect(parseDeepLink('exp://192.168.1.2:8081/--/habit/9')).toEqual({ tab: 3, habitId: '9', action: 'open' });
    expect(parseDeepLink('https://isaaceast.com/today')).toEqual({ tab: 0 });
  });
  it('prefers a route= query param (mockup host / sub-path hosting)', () => {
    expect(parseDeepLink('https://devupeast.github.io/Groov/apps/groov/index.html?theme=dark&route=progress')).toEqual({ tab: 1 });
    expect(parseDeepLink('https://x.y/app/?route=habit%2F42')).toEqual({ tab: 3, habitId: '42', action: 'open' });
    expect(parseDeepLink('https://x.y/app/?route=')).toBeNull();
  });
  it('ignores auth callbacks and junk', () => {
    expect(parseDeepLink('groov://auth/callback?code=abc')).toBeNull();
    expect(parseDeepLink('groov://')).toBeNull();
    expect(parseDeepLink('groov://nope')).toBeNull();
    expect(parseDeepLink(null)).toBeNull();
  });
  it('parses the dev design-preview route without a tab change', () => {
    expect(parseDeepLink('groov://dev/design')).toEqual({ tab: null, action: 'designPreview' });
    expect(parseDeepLink('https://x.y/app/?route=dev%2Fdesign')).toEqual({ tab: null, action: 'designPreview' });
    expect(parseDeepLink('groov://dev')).toBeNull();
  });
  it('drops the design preview outside dev builds and the mockup (F-01 m1)', () => {
    const design = parseDeepLink('groov://dev/design');
    expect(isRouteAllowed(design, { dev: false, mockup: false })).toBe(false);
    expect(isRouteAllowed(design, { dev: true })).toBe(true);
    expect(isRouteAllowed(design, { mockup: true })).toBe(true);
    expect(isRouteAllowed(parseDeepLink('groov://habits/new'), {})).toBe(true);
    expect(isRouteAllowed(null, { dev: true })).toBe(false);
  });
  it('only leaves a tab for a route that names another tab', () => {
    expect(routeLeavesTab({ tab: null, action: 'designPreview' }, 3)).toBe(false);
    expect(routeLeavesTab({ tab: 3, action: 'new' }, 3)).toBe(false);
    expect(routeLeavesTab({ tab: 0 }, 3)).toBe(true);
    expect(routeLeavesTab(null, 3)).toBe(false);
  });
  it('builds links', () => {
    expect(habitLink('7')).toBe('groov://habit/7');
    expect(habitLink('7', 'done')).toBe('groov://habit/7/done');
  });
});

describe('dispatchRoute (deep links and AppContext.openRoute, C-02b)', () => {
  const { dispatchRoute } = require('../links');
  const spies = () => ({ setRequestedTab: jest.fn(), setPendingRoute: jest.fn(), onDone: jest.fn() });

  it('Edit from Today: switches to Habits and leaves the route pending for that screen', () => {
    const s = spies();
    const route = { tab: 3, habitId: 'h1', action: 'edit' };
    expect(dispatchRoute(route, s)).toBe(true);
    expect(s.setRequestedTab).toHaveBeenCalledWith(3);
    expect(s.setPendingRoute).toHaveBeenCalledWith(route);
    expect(s.onDone).not.toHaveBeenCalled();
  });

  it('a done route runs onDone and shows Today, with no pending route', () => {
    const s = spies();
    dispatchRoute({ tab: 0, habitId: 'h1', action: 'done' }, s);
    expect(s.onDone).toHaveBeenCalledWith({ tab: 0, habitId: 'h1', action: 'done' });
    expect(s.setRequestedTab).toHaveBeenCalledWith(0);
    expect(s.setPendingRoute).not.toHaveBeenCalled();
  });

  it('drops dev-only routes outside dev and the mockup; a tab-less route stays on the tab', () => {
    const s = spies();
    expect(dispatchRoute({ tab: null, action: 'designPreview' }, s)).toBe(false);
    expect(s.setPendingRoute).not.toHaveBeenCalled();
    expect(dispatchRoute({ tab: null, action: 'designPreview' }, { ...s, dev: true })).toBe(true);
    expect(s.setRequestedTab).not.toHaveBeenCalled();
    expect(s.setPendingRoute).toHaveBeenCalledTimes(1);
  });

  it('parseDeepLink never produces an edit route (external links cannot open the form for a habit)', () => {
    expect(parseDeepLink('groov://habit/h1/edit')).toEqual({ tab: 3, habitId: 'h1', action: 'open' });
  });
});

describe('habitsRouteAction (the Habits tab consuming a pending route)', () => {
  const { habitsRouteAction } = require('../links');
  const habits = [{ id: 'h1', name: 'Water' }];

  it('edit and open find the habit; a missing habit does nothing', () => {
    expect(habitsRouteAction({ tab: 3, habitId: 'h1', action: 'edit' }, habits)).toEqual({ type: 'edit', habit: habits[0] });
    expect(habitsRouteAction({ tab: 3, habitId: 'h1', action: 'open' }, habits)).toEqual({ type: 'open', habit: habits[0] });
    expect(habitsRouteAction({ tab: 3, habitId: 'gone', action: 'edit' }, habits)).toEqual({ type: 'none' });
  });

  it('new opens the form; another tab leaves; a tab-less or empty route is not for this tab', () => {
    expect(habitsRouteAction({ tab: 3, action: 'new' }, habits)).toEqual({ type: 'new' });
    expect(habitsRouteAction({ tab: 0 }, habits)).toEqual({ type: 'leave' });
    expect(habitsRouteAction({ tab: null, action: 'designPreview' }, habits)).toBeNull();
    expect(habitsRouteAction(null, habits)).toBeNull();
    expect(habitsRouteAction({ tab: 3 }, habits)).toEqual({ type: 'none' });
  });
});
