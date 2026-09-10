import { StyleSheet } from 'react-native';
import { fireEvent, renderWithTheme, screen } from '../../../test-utils/render';
import { Checkbox } from '../checkbox';

describe('Checkbox', () => {
  it('exposes its checked state to assistive technology', () => {
    renderWithTheme(<Checkbox checked onToggle={() => {}} label="Decimal" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Decimal' });
    expect(checkbox).toBeOnTheScreen();
    expect(checkbox.props.accessibilityState.checked).toBe(true);
  });

  it('reports the inverse value when pressed', () => {
    const onToggle = jest.fn();
    renderWithTheme(<Checkbox checked={false} onToggle={onToggle} label="Real Number" />);

    fireEvent.press(screen.getByRole('checkbox', { name: 'Real Number' }));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('unchecks a checked topic', () => {
    const onToggle = jest.fn();
    renderWithTheme(<Checkbox checked onToggle={onToggle} label="Decimal" />);

    fireEvent.press(screen.getByRole('checkbox', { name: 'Decimal' }));

    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('does not fire when disabled', () => {
    const onToggle = jest.fn();
    renderWithTheme(<Checkbox checked={false} onToggle={onToggle} label="Decimal" disabled />);

    fireEvent.press(screen.getByRole('checkbox', { name: 'Decimal' }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  /**
   * Completion must survive greyscale and impaired colour vision, so the two
   * states differ in shape rather than only in fill and stroke colour.
   */
  it('draws a tick only when checked, so state is not colour-only', () => {
    const { rerender } = renderWithTheme(
      <Checkbox checked={false} onToggle={() => {}} label="Decimal" />,
    );
    expect(screen.queryByTestId('checkbox-tick')).toBeNull();

    rerender(<Checkbox checked onToggle={() => {}} label="Decimal" />);
    expect(screen.getByTestId('checkbox-tick')).toBeOnTheScreen();
  });

  /** The visual box is 24dp, below the 44dp accessibility minimum, so it relies on hitSlop. */
  it('expands its touch target beyond the visual box', () => {
    renderWithTheme(<Checkbox checked={false} onToggle={() => {}} label="Decimal" />);

    expect(screen.getByRole('checkbox', { name: 'Decimal' }).props.hitSlop).toBe(10);
  });
});

/**
 * An empty circle says nothing about what tapping it does. A faint tick reads as
 * one waiting to be turned on — so the tick is always drawn and the state is
 * carried by its weight and the fill behind it.
 */
describe('the two states', () => {
  it('draws a tick even when unchecked', () => {
    renderWithTheme(<Checkbox checked={false} label="Decimal" onToggle={() => {}} />);

    expect(screen.getByTestId('checkbox-tick-empty')).toBeOnTheScreen();
  });

  it('draws the checked tick when checked', () => {
    renderWithTheme(<Checkbox checked label="Decimal" onToggle={() => {}} />);

    expect(screen.getByTestId('checkbox-tick')).toBeOnTheScreen();
    expect(screen.queryByTestId('checkbox-tick-empty')).toBeNull();
  });

  /**
   * Completion must stay distinguishable without colour, so the states differ in
   * fill as well as hue — not only in the shade of the tick.
   */
  it('fills the circle only when checked', () => {
    const { unmount } = renderWithTheme(
      <Checkbox checked={false} label="Decimal" onToggle={() => {}} />,
    );
    const unchecked = screen.getByRole('checkbox', { name: 'Decimal' });
    const uncheckedFill = StyleSheet.flatten(unchecked.props.style).backgroundColor;
    unmount();

    renderWithTheme(<Checkbox checked label="Decimal" onToggle={() => {}} />);
    const checked = screen.getByRole('checkbox', { name: 'Decimal' });
    const checkedFill = StyleSheet.flatten(checked.props.style).backgroundColor;

    expect(uncheckedFill).toBe('transparent');
    expect(checkedFill).not.toBe('transparent');
  });
});
