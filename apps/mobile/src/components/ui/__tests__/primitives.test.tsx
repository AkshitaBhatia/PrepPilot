import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { darkColors } from '@preppilot/shared';
import { renderWithTheme } from '../../../test-utils/render';
import { Card } from '../card';
import { FadeIn } from '../fade-in';
import { Icon, type IconName } from '../icon';
import { PressableScale } from '../pressable-scale';
import { Skeleton, SkeletonCard } from '../skeleton';
import { Text } from '../text';

const ICONS: IconName[] = [
  'tracker',
  'dashboard',
  'history',
  'reminders',
  'focus',
  'assistant',
  'settings',
];

describe('Icon', () => {
  it.each(ICONS)('renders the %s glyph', (name) => {
    renderWithTheme(<Icon name={name} testID={`icon-${name}`} />);

    // Rendering without throwing is the assertion; each glyph is a distinct branch.
    expect(screen.UNSAFE_root).toBeTruthy();
  });

  /** Tab icons sit beside a text label, so announcing them too is noise. */
  it('is hidden from screen readers unless given a label', () => {
    renderWithTheme(<Icon name="tracker" label="Tracker" />);

    expect(screen.getByLabelText('Tracker')).toBeOnTheScreen();
  });
});

describe('PressableScale', () => {
  it('calls onPress', () => {
    const onPress = jest.fn();
    renderWithTheme(
      <PressableScale accessibilityRole="button" accessibilityLabel="Tap me" onPress={onPress}>
        <Text>Tap me</Text>
      </PressableScale>,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap me' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /** The scale responds on touch-down, before the handler runs. */
  it('runs its press-in and press-out handlers', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    renderWithTheme(
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Tap me"
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        haptic
      >
        <Text>Tap me</Text>
      </PressableScale>,
    );

    const target = screen.getByRole('button', { name: 'Tap me' });
    fireEvent(target, 'pressIn');
    fireEvent(target, 'pressOut');

    expect(onPressIn).toHaveBeenCalled();
    expect(onPressOut).toHaveBeenCalled();
  });

  it('does not fire when disabled', () => {
    const onPress = jest.fn();
    renderWithTheme(
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Tap me"
        disabled
        onPress={onPress}
      >
        <Text>Tap me</Text>
      </PressableScale>,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap me' }));

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Skeleton', () => {
  it('announces itself as loading', () => {
    renderWithTheme(<Skeleton />);

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeOnTheScreen();
  });

  it('accepts an explicit size', () => {
    renderWithTheme(<Skeleton width={40} height={12} radius={4} />);

    const style = StyleSheet.flatten(
      screen.getByRole('progressbar', { name: 'Loading' }).props.style,
    ) as Record<string, unknown>;

    expect(style.width).toBe(40);
    expect(style.height).toBe(12);
  });

  /**
   * A group announces once. Four lines each saying "Loading" is noise, not
   * information.
   */
  it('announces a card-shaped placeholder exactly once', () => {
    renderWithTheme(<SkeletonCard />);

    expect(screen.getAllByRole('progressbar', { name: 'Loading' })).toHaveLength(1);
  });
});

describe('FadeIn', () => {
  it('renders its children', () => {
    renderWithTheme(
      <FadeIn>
        <Text>Content</Text>
      </FadeIn>,
    );

    expect(screen.getByText('Content')).toBeOnTheScreen();
  });

  it('accepts a stagger delay', () => {
    renderWithTheme(
      <FadeIn delay={120}>
        <Text>Content</Text>
      </FadeIn>,
    );

    expect(screen.getByText('Content')).toBeOnTheScreen();
  });
});

describe('Card', () => {
  it('becomes a single target when given onPress', () => {
    const onPress = jest.fn();
    renderWithTheme(
      <Card onPress={onPress} accessibilityLabel="Open subject">
        <Text>Mathematics</Text>
      </Card>,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Open subject' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /** A nested card should not also cast a shadow, or the stack looks muddy. */
  it('does not elevate a nested card', () => {
    renderWithTheme(
      <Card testID="nested" elevated>
        <Text>Chapter</Text>
      </Card>,
    );

    const style = StyleSheet.flatten(screen.getByTestId('nested').props.style) as Record<
      string,
      unknown
    >;

    expect(style.backgroundColor).toBe(darkColors.surfaceElevated);
    expect(style.shadowOpacity).toBe(0);
  });
});

/**
 * Every glyph, rendered. They are drawn inline rather than pulled from a font,
 * so a mistyped path is a silent blank square in the tab bar — and the tab bar
 * shows icons alone on a narrow screen.
 */
describe('the icon set', () => {
  const names: IconName[] = [
    'tracker',
    'dashboard',
    'history',
    'reminders',
    'focus',
    'assistant',
    'cards',
    'notes',
    'sessions',
    'courses',
    'settings',
  ];

  // Decorative icons are hidden from the accessibility tree on purpose, so the
  // default query skips them — that is the behaviour, not a problem.
  it.each(names)('draws %s', (name) => {
    renderWithTheme(<Icon name={name} testID={`icon-${name}`} />);

    expect(screen.getByTestId(`icon-${name}`, { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('hides a decorative icon from assistive technology', () => {
    renderWithTheme(<Icon name="tracker" testID="decorative" />);

    expect(
      screen.getByTestId('decorative', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
  });

  it('announces one that stands alone', () => {
    renderWithTheme(<Icon name="tracker" label="Tracker" testID="labelled" />);

    expect(screen.getByTestId('labelled').props.accessibilityLabel).toBe('Tracker');
  });
});
