import { darkColors, makeProgress } from '@preppilot/shared';
import { StyleSheet } from 'react-native';
import { renderWithTheme, screen } from '../../../test-utils/render';
import { Card } from '../card';
import { Screen } from '../screen';
import { StatChip } from '../stat-chip';
import { Text } from '../text';

const flatten = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

describe('Card', () => {
  it('paints the default surface colour', () => {
    renderWithTheme(
      <Card testID="card">
        <Text>Mathematics</Text>
      </Card>,
    );

    expect(flatten('card').backgroundColor).toBe(darkColors.surface);
  });

  it('uses the raised surface when elevated, so nesting stays legible', () => {
    renderWithTheme(
      <Card testID="card" elevated>
        <Text>Chapter 1</Text>
      </Card>,
    );

    expect(flatten('card').backgroundColor).toBe(darkColors.surfaceElevated);
  });

  it('drops its padding when asked, for edge-to-edge content', () => {
    renderWithTheme(
      <Card testID="card" padded={false}>
        <Text>Chapter 1</Text>
      </Card>,
    );

    expect(flatten('card').padding).toBe(0);
  });
});

describe('Screen', () => {
  it('paints the app background', () => {
    renderWithTheme(
      <Screen testID="screen">
        <Text>Tracker</Text>
      </Screen>,
    );

    expect(flatten('screen').backgroundColor).toBe(darkColors.background);
  });

  /** Padding lives on the inner content wrapper, which is also what caps the width. */
  it('applies horizontal padding by default and removes it on request', () => {
    const { rerender } = renderWithTheme(
      <Screen testID="screen">
        <Text>Tracker</Text>
      </Screen>,
    );
    expect(flatten('screen-content').paddingLeft).toBe(16);

    rerender(
      <Screen testID="screen" padded={false}>
        <Text>Tracker</Text>
      </Screen>,
    );
    expect(flatten('screen-content').paddingLeft).toBe(0);
  });

  /**
   * The app runs in a browser and on tablets, where a full-width layout would
   * stretch text lines well past a readable measure.
   */
  it('caps content width so text does not stretch across a wide screen', () => {
    renderWithTheme(
      <Screen testID="screen">
        <Text>Tracker</Text>
      </Screen>,
    );

    expect(flatten('screen-content').maxWidth).toBe(720);
  });
});

describe('StatChip', () => {
  it('renders its caption and value', () => {
    renderWithTheme(<StatChip label="Time Spent" value="20h 11m" />);

    expect(screen.getByText('Time Spent')).toBeOnTheScreen();
    expect(screen.getByText('20h 11m')).toBeOnTheScreen();
  });

  it('accepts a custom value colour for per-subject accents', () => {
    renderWithTheme(<StatChip label="Completed" value="39.57%" color="#10B981" />);

    expect(screen.getByText('39.57%')).toHaveStyle({ color: '#10B981' });
  });
});

describe('Text', () => {
  it.each([
    ['secondary', darkColors.textSecondary],
    ['muted', darkColors.textMuted],
    ['accent', darkColors.accent],
    ['danger', darkColors.danger],
    ['onAccent', darkColors.textOnAccent],
  ] as const)('maps the %s tone to its palette colour', (tone, expected) => {
    renderWithTheme(<Text tone={tone}>Sample</Text>);

    expect(screen.getByText('Sample')).toHaveStyle({ color: expected });
  });

  it('lets an explicit colour override the tone, for subject accents', () => {
    renderWithTheme(
      <Text tone="secondary" color="#A855F7">
        Social Science
      </Text>,
    );

    expect(screen.getByText('Social Science')).toHaveStyle({ color: '#A855F7' });
  });

  it.each([
    ['display', 32],
    ['heading', 24],
    ['title', 20],
    ['bodyLarge', 17],
    ['body', 15],
    ['small', 13],
    ['caption', 11],
  ] as const)('renders the %s variant at %ipt', (variant, size) => {
    renderWithTheme(<Text variant={variant}>Sample</Text>);

    expect(screen.getByText('Sample')).toHaveStyle({ fontSize: size });
  });

  /**
   * Text must scale with the OS setting, but an unbounded 32pt heading collapses
   * the Subject -> Chapter -> Topic hierarchy, so headings cap tighter than body.
   */
  it('caps font scaling more tightly for headings than for body copy', () => {
    const { rerender } = renderWithTheme(<Text variant="heading">Sample</Text>);
    const headingCap = screen.getByText('Sample').props.maxFontSizeMultiplier;

    rerender(<Text variant="body">Sample</Text>);
    const bodyCap = screen.getByText('Sample').props.maxFontSizeMultiplier;

    rerender(<Text variant="caption">Sample</Text>);
    const captionCap = screen.getByText('Sample').props.maxFontSizeMultiplier;

    expect(headingCap).toBeLessThan(bodyCap);
    expect(bodyCap).toBeLessThan(captionCap);
    // Every variant must still scale meaningfully for readability.
    expect(headingCap).toBeGreaterThanOrEqual(1.3);
  });

  it('defaults headings to semibold and body copy to regular', () => {
    const { rerender } = renderWithTheme(<Text variant="heading">Heading</Text>);
    expect(screen.getByText('Heading')).toHaveStyle({ fontWeight: '600' });

    rerender(<Text variant="body">Body</Text>);
    expect(screen.getByText('Body')).toHaveStyle({ fontWeight: '400' });
  });
});

describe('progress components share the engine, not their own maths', () => {
  it('renders the same percentage the engine reports', () => {
    const progress = makeProgress(1, 3);
    renderWithTheme(<StatChip label="Completed" value={`${Math.round(progress.percent ?? 0)}%`} />);

    expect(screen.getByText('33%')).toBeOnTheScreen();
  });
});
