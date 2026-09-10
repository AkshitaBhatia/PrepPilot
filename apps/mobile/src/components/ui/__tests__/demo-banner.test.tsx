import { isDemoMode } from '../../../config/env';
import { renderWithTheme, screen } from '../../../test-utils/render';
import { DemoBanner } from '../demo-banner';

jest.mock('../../../config/env', () => ({
  ...jest.requireActual('../../../config/env'),
  isDemoMode: jest.fn(),
}));

const mockedIsDemoMode = isDemoMode as jest.MockedFunction<typeof isDemoMode>;

describe('DemoBanner', () => {
  it('renders nothing in a normal build', () => {
    mockedIsDemoMode.mockReturnValue(false);

    renderWithTheme(<DemoBanner />);

    expect(screen.queryByTestId('demo-banner')).toBeNull();
  });

  /**
   * Demo mode bypasses sign-in and stores everything locally. Nothing else about
   * the app looks different, so a reviewer could easily mistake it for real,
   * synced data — the banner is the only thing preventing that.
   */
  it('announces a demo session unmistakably', () => {
    mockedIsDemoMode.mockReturnValue(true);

    renderWithTheme(<DemoBanner />);

    expect(screen.getByTestId('demo-banner')).toBeOnTheScreen();
    expect(screen.getByText(/Demo mode/)).toBeOnTheScreen();
    expect(screen.getByText(/not signed in/)).toBeOnTheScreen();
  });
});
