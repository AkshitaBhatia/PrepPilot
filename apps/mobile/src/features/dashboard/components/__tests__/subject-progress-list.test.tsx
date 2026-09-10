import { EMPTY_PERCENT_PLACEHOLDER } from '@preppilot/shared';
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '../../../../test-utils/render';
import type { SubjectProgress } from '../../dashboard-store';
import { SubjectProgressList } from '../subject-progress-list';

function subject(name: string, completed: number, total: number): SubjectProgress {
  return {
    subjectId: name.toLowerCase(),
    name,
    progress: {
      completed,
      total,
      percent: total === 0 ? null : (completed / total) * 100,
      isEmpty: total === 0,
    },
  };
}

/** Reading order of the subject names, top to bottom. */
function renderedOrder(): string[] {
  return screen.getAllByRole('progressbar').map((bar) => bar.props.accessibilityLabel);
}

describe('SubjectProgressList', () => {
  it('renders nothing when there are no subjects', () => {
    renderWithTheme(<SubjectProgressList subjects={[]} />);

    expect(screen.queryByTestId('subject-progress')).toBeNull();
  });

  it('puts the least complete subject first, so what needs attention leads', () => {
    renderWithTheme(
      <SubjectProgressList
        subjects={[subject('Physics', 8, 10), subject('Chemistry', 1, 10), subject('Maths', 5, 10)]}
      />,
    );

    expect(renderedOrder()).toEqual(['Chemistry', 'Maths', 'Physics']);
  });

  it('sinks subjects with nothing to measure below every measurable one', () => {
    // An empty subject is not "0% done" — it is nothing to do yet, so leading
    // with it would be misleading advice about what to study next.
    renderWithTheme(
      <SubjectProgressList subjects={[subject('Biology', 0, 0), subject('Physics', 9, 10)]} />,
    );

    expect(renderedOrder()).toEqual(['Physics', 'Biology']);
  });

  it('shows a decimal figure when measurable and a dash when there is nothing to measure', () => {
    renderWithTheme(
      <SubjectProgressList subjects={[subject('Physics', 1, 3), subject('Biology', 0, 0)]} />,
    );

    expect(screen.getByText('33.3%')).toBeOnTheScreen();
    // A subject with no topics has no percentage at all — showing "0%" would
    // claim no work is done, when in fact there is no work to do yet.
    expect(screen.getByText(EMPTY_PERCENT_PLACEHOLDER)).toBeOnTheScreen();
  });
});
