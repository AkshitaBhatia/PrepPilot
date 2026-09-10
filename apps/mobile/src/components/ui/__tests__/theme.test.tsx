import { darkColors, lightColors } from '@preppilot/shared';
import { render } from '@testing-library/react-native';
import { fireEvent, renderWithTheme, screen } from '../../../test-utils/render';
import { Button } from '../button';
import { Text } from '../text';
import { useThemeContext } from '../../../theme/theme-context';

function ThemeSwitcher() {
  const { theme, setMode, followsDevice } = useThemeContext();

  return (
    <>
      <Text>{`mode:${theme.mode}`}</Text>
      <Text>{`followsDevice:${String(followsDevice)}`}</Text>
      <Button label="Go light" onPress={() => setMode('light')} />
      <Button label="Follow device" onPress={() => setMode(null)} />
    </>
  );
}

describe('ThemeProvider', () => {
  it('applies the dark palette by default', () => {
    renderWithTheme(<Text>Mathematics</Text>);

    expect(screen.getByText('Mathematics')).toHaveStyle({ color: darkColors.textPrimary });
  });

  it('applies the light palette when selected', () => {
    renderWithTheme(<Text>Mathematics</Text>, { mode: 'light' });

    expect(screen.getByText('Mathematics')).toHaveStyle({ color: lightColors.textPrimary });
  });

  it('switches mode at runtime', () => {
    renderWithTheme(<ThemeSwitcher />);

    expect(screen.getByText('mode:dark')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Go light' }));
    expect(screen.getByText('mode:light')).toBeOnTheScreen();
  });

  it('reports whether it is following the device setting', () => {
    renderWithTheme(<ThemeSwitcher />);

    expect(screen.getByText('followsDevice:false')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Follow device' }));
    expect(screen.getByText('followsDevice:true')).toBeOnTheScreen();
  });

  it('throws a clear error when used outside a provider', () => {
    // The failing render logs the React error boundary output; silence it.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ThemeSwitcher />)).toThrow(/must be used within a ThemeProvider/);
    spy.mockRestore();
  });
});
