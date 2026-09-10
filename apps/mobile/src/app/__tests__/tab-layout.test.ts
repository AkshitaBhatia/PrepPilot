import { LABELLED_TABS_MIN_WIDTH, TABS } from '../(app)/_layout';

jest.mock('../../db/client', () => ({ getRepositories: jest.fn(), initialiseDatabase: jest.fn() }));
jest.mock('../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

/**
 * Below the threshold the bar drops its labels, because eight of them across a
 * 375pt phone rendered as "Trac…", "Das…", "Remi…". Hiding a label also removes
 * it from the accessibility tree, so the name has to be given explicitly or the
 * bar becomes eight controls announcing nothing but "tab".
 */
describe('the tab bar', () => {
  it('names every destination', () => {
    for (const tab of TABS) {
      expect(tab.title.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives each one a distinct name and route', () => {
    expect(new Set(TABS.map((tab) => tab.title)).size).toBe(TABS.length);
    expect(new Set(TABS.map((tab) => tab.name)).size).toBe(TABS.length);
  });

  it('gives each one its own icon, so an icon-only bar is still navigable', () => {
    expect(new Set(TABS.map((tab) => tab.icon)).size).toBe(TABS.length);
  });

  it('opens on the Tracker, which PRD §19 makes the primary screen', () => {
    expect(TABS[0]?.name).toBe('index');
    expect(TABS[0]?.title).toBe('Tracker');
  });

  /**
   * The threshold has to clear what the labels actually need. Eight tabs at the
   * smallest legible size need roughly 45pt each; anything narrower truncates.
   */
  it('keeps labels only where they fit', () => {
    const perTab = LABELLED_TABS_MIN_WIDTH / TABS.length;

    expect(perTab).toBeGreaterThanOrEqual(45);
  });
});
