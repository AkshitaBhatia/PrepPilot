import { fireEvent, renderWithTheme, screen } from '../../../test-utils/render';
import { emptyStateCopy } from '../../../constants/copy';
import { EmptyState, ErrorState, LoadingState } from '../states';
import { TextField } from '../text-field';

describe('EmptyState', () => {
  it('renders the specification copy for an empty tracker', () => {
    renderWithTheme(<EmptyState {...emptyStateCopy.tracker} />);

    expect(screen.getByText('No subjects yet')).toBeOnTheScreen();
    expect(
      screen.getByText('Add a subject or choose a template to get started.'),
    ).toBeOnTheScreen();
  });

  it('renders an action only when both a label and a handler are given', () => {
    const onAction = jest.fn();
    renderWithTheme(
      <EmptyState title="No subjects yet" actionLabel="Add subject" onAction={onAction} />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action when no handler is provided', () => {
    renderWithTheme(<EmptyState title="No subjects yet" actionLabel="Add subject" />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('LoadingState', () => {
  it('announces what is loading', () => {
    renderWithTheme(<LoadingState label="Loading your syllabus" />);

    expect(screen.getByRole('progressbar', { name: 'Loading your syllabus' })).toBeOnTheScreen();
  });
});

describe('ErrorState', () => {
  it('shows a student-facing message and a retry action', () => {
    const onRetry = jest.fn();
    renderWithTheme(
      <ErrorState message="Check your connection and try again." onRetry={onRetry} />,
    );

    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits retry when no handler is given', () => {
    renderWithTheme(<ErrorState message="Check your connection and try again." />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('TextField', () => {
  it('associates its label with the input', () => {
    renderWithTheme(<TextField label="Subject name" />);

    expect(screen.getByLabelText('Subject name')).toBeOnTheScreen();
  });

  it('shows the error message and marks the field invalid', () => {
    renderWithTheme(<TextField label="Subject name" error="Enter a name" />);

    expect(screen.getByText('Enter a name')).toBeOnTheScreen();
    expect(screen.getByLabelText('Subject name').props['aria-invalid']).toBe(true);
  });

  it('shows the hint when there is no error', () => {
    renderWithTheme(<TextField label="Subject name" hint="You can rename this later." />);

    expect(screen.getByText('You can rename this later.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Subject name').props['aria-invalid']).toBe(false);
  });

  /** An error must replace the hint rather than stack with it. */
  it('prefers the error over the hint', () => {
    renderWithTheme(
      <TextField label="Subject name" hint="You can rename this later." error="Enter a name" />,
    );

    expect(screen.getByText('Enter a name')).toBeOnTheScreen();
    expect(screen.queryByText('You can rename this later.')).toBeNull();
  });
});
