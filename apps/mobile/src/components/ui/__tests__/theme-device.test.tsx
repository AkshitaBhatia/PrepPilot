import { Text, useColorScheme } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../../../theme/theme-context';

jest.mock('react-native/Libraries/Utilities/useColorScheme');

const mockedUseColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

function ModeProbe() {
  const theme = useTheme();
  return <Text>{theme.mode}</Text>;
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <ModeProbe />
    </ThemeProvider>,
  );

describe('ThemeProvider following the device', () => {
  afterEach(() => {
    mockedUseColorScheme.mockReset();
  });

  it('follows the device into light mode', () => {
    mockedUseColorScheme.mockReturnValue('light');
    renderProbe();

    expect(screen.getByText('light')).toBeOnTheScreen();
  });

  it('follows the device into dark mode', () => {
    mockedUseColorScheme.mockReturnValue('dark');
    renderProbe();

    expect(screen.getByText('dark')).toBeOnTheScreen();
  });

  /**
   * React Native reports 'unspecified' when the device expresses no preference.
   * Falling back to light would flash a white screen on a dark-themed device,
   * so dark backstops it.
   */
  it('falls back to dark rather than light when the device expresses no preference', () => {
    mockedUseColorScheme.mockReturnValue('unspecified');
    renderProbe();

    expect(screen.getByText('dark')).toBeOnTheScreen();
  });
});
