import type { ThemeMode } from '@preppilot/shared';
import { render, screen, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import type { Role } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/theme-context';

const insets = { top: 0, left: 0, right: 0, bottom: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

/**
 * Renders a component inside the providers every screen has at runtime, with a
 * fixed theme so snapshots and colour assertions do not depend on the host
 * machine's appearance setting.
 */
export function renderWithTheme(
  ui: ReactElement,
  { mode = 'dark' as ThemeMode, ...options }: RenderOptions & { mode?: ThemeMode } = {},
) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <ThemeProvider initialMode={mode}>{children}</ThemeProvider>
    </SafeAreaProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Returns the interactive element matching a role and name inside a modal.
 *
 * React Native's `Modal` renders its subtree twice in the testing tree — once for
 * the Modal host component and once for its content. Only the second copy has
 * live press handlers; pressing the first silently does nothing, which shows up
 * as a test that finds the control and then observes no effect. The rendered
 * content always comes last, so that is the copy returned here.
 *
 * Use this only for controls inside a modal. `screen.getByRole` remains correct
 * everywhere else, where a duplicate really would indicate a bug.
 */
export function getInModal(name: string, role: Role = 'button') {
  const matches = screen.getAllByRole(role, { name });
  const last = matches.at(-1);
  if (last === undefined) {
    throw new Error(`No ${role} named "${name}" found inside a modal.`);
  }
  return last;
}

export * from '@testing-library/react-native';
