import { screen } from '@testing-library/react-native';
import { makeProgress } from '@preppilot/shared';
import { renderWithTheme } from '../../../test-utils/render';
import { ariaState, ariaValue } from '../aria';
import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { ProgressBar } from '../progress-bar';

/**
 * react-native-web 0.21 stopped translating `accessibilityState` and
 * `accessibilityValue` to ARIA. Nothing failed loudly — the information simply
 * vanished from the accessibility tree on web, so a checkbox announced its name
 * and role but never whether it was ticked, and every progress bar announced no
 * value at all. These assert the `aria-*` props that carry it instead.
 */
describe('ariaState', () => {
  it('omits states the control does not have', () => {
    // aria-checked="false" on a control with no checked state is a lie, not a default.
    expect(ariaState({ disabled: true })).toEqual({ 'aria-disabled': true });
  });

  it('keeps a false state, which is different from an absent one', () => {
    expect(ariaState({ checked: false })).toEqual({ 'aria-checked': false });
  });

  it('carries every state it is given', () => {
    expect(ariaState({ checked: true, disabled: false, busy: true, expanded: false })).toEqual({
      'aria-checked': true,
      'aria-disabled': false,
      'aria-busy': true,
      'aria-expanded': false,
    });
  });
});

describe('ariaValue', () => {
  it('carries the spoken form alongside the number', () => {
    expect(ariaValue({ min: 0, max: 100, now: 33, text: '33.3%' })).toEqual({
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': 33,
      'aria-valuetext': '33.3%',
    });
  });

  it('carries text alone when there is no number to report', () => {
    expect(ariaValue({ text: 'No topics yet' })).toEqual({ 'aria-valuetext': 'No topics yet' });
  });
});

describe('the controls that depend on it', () => {
  /**
   * React Native folds `aria-*` back into `accessibilityState`, so on this
   * renderer that is where the value lands — which is the native contract. The
   * web half of this fix cannot be observed here at all: it only shows up as
   * attributes in a real DOM, so it is verified against a browser build instead.
   */
  it('tells a screen reader whether a topic is ticked', () => {
    renderWithTheme(<Checkbox checked label="Decimal" onToggle={() => {}} />);

    expect(
      screen.getByRole('checkbox', { name: 'Decimal' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it('distinguishes an unticked topic from a ticked one', () => {
    renderWithTheme(<Checkbox checked={false} label="Decimal" onToggle={() => {}} />);

    expect(
      screen.getByRole('checkbox', { name: 'Decimal' }).props.accessibilityState,
    ).toMatchObject({ checked: false });
  });

  it('announces a busy button as busy, not merely disabled', () => {
    renderWithTheme(<Button label="Import" loading onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Import' }).props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it('gives a progress bar a value, not just a role', () => {
    renderWithTheme(<ProgressBar progress={makeProgress(1, 3)} label="Physics" />);

    expect(
      screen.getByRole('progressbar', { name: 'Physics' }).props.accessibilityValue,
    ).toMatchObject({ now: 33, text: '33%' });
  });

  it('says a subject with no topics has none rather than reporting zero', () => {
    renderWithTheme(<ProgressBar progress={makeProgress(0, 0)} label="Biology" />);

    const bar = screen.getByRole('progressbar', { name: 'Biology' });
    expect(bar.props.accessibilityValue.text).toBe('No topics yet');
    expect(bar.props.accessibilityValue.now).toBeUndefined();
  });
});
