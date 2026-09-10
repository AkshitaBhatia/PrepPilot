/**
 * ARIA props for controls whose state matters.
 *
 * React Native's `accessibilityState` and `accessibilityValue` stopped reaching
 * the DOM in react-native-web 0.21 — it translates neither, so on web a checkbox
 * announced its name and role but never whether it was ticked, and every
 * progress bar announced no value at all. Nothing failed loudly; the information
 * was simply absent from the accessibility tree.
 *
 * React Native itself accepts `aria-*` props and maps them back onto the legacy
 * ones, so these travel on both platforms. Components pass the legacy props too,
 * because that is what the native side has always read and what the tests
 * assert.
 */

export interface AriaToggleState {
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly expanded?: boolean;
  readonly selected?: boolean;
}

/** Omits absent keys: `aria-checked="false"` on a control that has no checked state is wrong. */
export function ariaState(state: AriaToggleState): Record<string, boolean> {
  const props: Record<string, boolean> = {};
  if (state.checked !== undefined) props['aria-checked'] = state.checked;
  if (state.disabled !== undefined) props['aria-disabled'] = state.disabled;
  if (state.busy !== undefined) props['aria-busy'] = state.busy;
  if (state.expanded !== undefined) props['aria-expanded'] = state.expanded;
  if (state.selected !== undefined) props['aria-selected'] = state.selected;
  return props;
}

export interface AriaRangeValue {
  readonly min?: number;
  readonly max?: number;
  readonly now?: number;
  readonly text?: string;
}

/**
 * A range's value. `aria-valuetext` carries the spoken form — "33.3%" rather
 * than "33" — and is what a screen reader prefers when present.
 */
export function ariaValue(value: AriaRangeValue): Record<string, number | string> {
  const props: Record<string, number | string> = {};
  if (value.min !== undefined) props['aria-valuemin'] = value.min;
  if (value.max !== undefined) props['aria-valuemax'] = value.max;
  if (value.now !== undefined) props['aria-valuenow'] = value.now;
  if (value.text !== undefined) props['aria-valuetext'] = value.text;
  return props;
}
