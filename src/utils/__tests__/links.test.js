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
