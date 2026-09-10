import { BrandMark } from '../../../components/ui';
import { renderWithTheme, screen } from '../../../test-utils/render';
import { SplashScreen } from '../splash-screen';

describe('SplashScreen', () => {
  it('shows the product name and its principle', () => {
    renderWithTheme(<SplashScreen />);

    expect(screen.getByText('PrepPilot')).toBeOnTheScreen();
    expect(screen.getByText('Tracker first, AI second')).toBeOnTheScreen();
  });

  /**
   * The wait is real work — opening the database, restoring a session — so it is
   * announced rather than left as a silent frame.
   */
  it('announces what it is waiting for', () => {
    renderWithTheme(<SplashScreen />);

    expect(screen.getByRole('progressbar', { name: 'Starting PrepPilot' })).toBeOnTheScreen();
  });

  it('accepts a different message', () => {
    renderWithTheme(<SplashScreen message="Restoring your syllabus" />);

    expect(screen.getByRole('progressbar', { name: 'Restoring your syllabus' })).toBeOnTheScreen();
  });
});

describe('BrandMark', () => {
  it('is decorative unless given a label', () => {
    renderWithTheme(<BrandMark label="PrepPilot" />);

    expect(screen.getByLabelText('PrepPilot')).toBeOnTheScreen();
  });

  it('renders at a requested size and fill', () => {
    renderWithTheme(<BrandMark size={48} progress={1} label="Complete" />);

    expect(screen.getByLabelText('Complete')).toBeOnTheScreen();
  });
});
