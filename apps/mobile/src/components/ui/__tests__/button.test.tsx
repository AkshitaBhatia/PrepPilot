import { StyleSheet } from 'react-native';
import { fireEvent, renderWithTheme, screen } from '../../../test-utils/render';
import { Button } from '../button';
import { PlayButton } from '../play-button';

describe('Button', () => {
  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    renderWithTheme(<Button label="Add subject" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onPress = jest.fn();
    renderWithTheme(<Button label="Add subject" onPress={onPress} disabled />);

    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  /** A double tap while a request is in flight must not submit twice. */
  it('blocks presses while loading', () => {
    const onPress = jest.fn();
    renderWithTheme(<Button label="Save" onPress={onPress} loading />);

    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('announces its busy state while loading', () => {
    renderWithTheme(<Button label="Save" onPress={() => {}} loading />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('hides the label while loading, showing a spinner instead', () => {
    renderWithTheme(<Button label="Save" onPress={() => {}} loading />);

    expect(screen.queryByText('Save')).toBeNull();
  });

  it.each(['small', 'medium', 'large'] as const)(
    'keeps the %s size at or above the touch target minimum',
    (size) => {
      renderWithTheme(<Button label="Tap" onPress={() => {}} size={size} />);

      const { minHeight } = StyleSheet.flatten(
        screen.getByRole('button', { name: 'Tap' }).props.style,
      );
      expect(minHeight).toBeGreaterThanOrEqual(44);
    },
  );
});

describe('PlayButton', () => {
  it('describes what the timer will study', () => {
    renderWithTheme(<PlayButton label="Mathematics" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Start timer for Mathematics' })).toBeOnTheScreen();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    renderWithTheme(<PlayButton label="Mathematics" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Start timer for Mathematics' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onPress = jest.fn();
    renderWithTheme(<PlayButton label="Mathematics" onPress={onPress} disabled />);

    fireEvent.press(screen.getByRole('button', { name: 'Start timer for Mathematics' }));

    expect(onPress).not.toHaveBeenCalled();
  });
});
