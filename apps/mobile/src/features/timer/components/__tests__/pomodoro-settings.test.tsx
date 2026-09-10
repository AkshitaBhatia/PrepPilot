import { DEFAULT_POMODORO, POMODORO_LIMITS } from '@preppilot/shared';
import { fireEvent, screen } from '@testing-library/react-native';
import { getInModal, renderWithTheme } from '../../../../test-utils/render';
import { PomodoroSettings } from '../pomodoro-settings';

function open(overrides: Partial<Parameters<typeof PomodoroSettings>[0]> = {}) {
  const onSave = jest.fn();
  const onCancel = jest.fn();
  renderWithTheme(
    <PomodoroSettings
      visible
      config={DEFAULT_POMODORO}
      onCancel={onCancel}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave, onCancel };
}

/** Presses a stepper button the given number of times. */
function press(action: 'Increase' | 'Decrease', label: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    fireEvent.press(getInModal(`${action} ${label}`));
  }
}

describe('PomodoroSettings', () => {
  it('saves every interval the student changed', () => {
    // D23 called the defaults "all configurable"; this is what makes that true.
    const { onSave } = open();

    press('Increase', 'Focus interval'); // 25 -> 30, step 5
    press('Decrease', 'Short break'); // 5 -> 4
    press('Increase', 'Long break'); // 15 -> 20, step 5
    press('Decrease', 'Intervals before a long break'); // 4 -> 3
    fireEvent.press(getInModal('Save'));

    expect(onSave).toHaveBeenCalledWith({
      workSeconds: 30 * 60,
      shortBreakSeconds: 4 * 60,
      longBreakSeconds: 20 * 60,
      cyclesBeforeLongBreak: 3,
      autoStartNextPhase: false,
    });
  });

  it('turns automatic phase changes on and reports it as a switch', () => {
    const { onSave } = open();

    const toggle = getInModal('Start the next phase automatically', 'switch');
    expect(toggle.props.accessibilityState.checked).toBe(false);

    fireEvent.press(toggle);
    fireEvent.press(getInModal('Save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ autoStartNextPhase: true }));
  });

  it('will not let a value leave its supported range', () => {
    const { onSave } = open();

    // Far more presses than the range allows: the control, not a later
    // validation message, is what keeps the value legal.
    press('Decrease', 'Focus interval', 20);
    press('Increase', 'Intervals before a long break', 20);
    fireEvent.press(getInModal('Save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        workSeconds: POMODORO_LIMITS.workMinutes.min * 60,
        cyclesBeforeLongBreak: POMODORO_LIMITS.cyclesBeforeLongBreak.max,
      }),
    );
  });

  it('disables a stepper button once its bound is reached', () => {
    open();

    press('Decrease', 'Focus interval', 4); // 25 -> 5, the minimum
    expect(getInModal('Decrease Focus interval').props.accessibilityState.disabled).toBe(true);
  });

  it('discards the draft when cancelled', () => {
    const { onSave, onCancel } = open();

    press('Increase', 'Focus interval');
    fireEvent.press(getInModal('Cancel'));

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stays out of the way when it is not open', () => {
    open({ visible: false });

    expect(screen.queryByText('Pomodoro settings')).toBeNull();
  });
});
