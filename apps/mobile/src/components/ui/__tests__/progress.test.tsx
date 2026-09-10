import { makeProgress } from '@preppilot/shared';
import { renderWithTheme, screen } from '../../../test-utils/render';
import { ProgressBar } from '../progress-bar';
import { ProgressRing } from '../progress-ring';

describe('ProgressBar', () => {
  it('announces its value to assistive technology', () => {
    renderWithTheme(<ProgressBar progress={makeProgress(1, 2)} label="Chapter 1" />);

    const bar = screen.getByRole('progressbar', { name: 'Chapter 1' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50, text: '50%' });
  });

  it('sizes the fill to the completed proportion', () => {
    renderWithTheme(<ProgressBar progress={makeProgress(1, 4)} label="Chapter 1" />);

    expect(screen.getByTestId('progress-bar-fill')).toHaveStyle({ width: '25%' });
  });

  it('renders no fill at all when nothing is complete', () => {
    renderWithTheme(<ProgressBar progress={makeProgress(0, 4)} label="Chapter 1" />);

    expect(screen.queryByTestId('progress-bar-fill')).toBeNull();
  });

  /** An empty chapter is unmeasured, not 0% — it must not look like an untouched one. */
  it('announces an empty chapter as having no topics rather than 0%', () => {
    renderWithTheme(<ProgressBar progress={makeProgress(0, 0)} label="Chapter 4" />);

    const bar = screen.getByRole('progressbar', { name: 'Chapter 4' });
    expect(bar.props.accessibilityValue).toEqual({ text: 'No topics yet' });
    expect(screen.queryByTestId('progress-bar-fill')).toBeNull();
  });
});

describe('ProgressRing', () => {
  it('renders the percentage inside the ring, not colour alone', () => {
    renderWithTheme(<ProgressRing progress={makeProgress(3, 10)} label="Mathematics" />);

    expect(screen.getByText('30%')).toBeOnTheScreen();
  });

  it('announces its value to assistive technology', () => {
    renderWithTheme(<ProgressRing progress={makeProgress(3, 10)} label="Mathematics" />);

    const ring = screen.getByRole('progressbar', { name: 'Mathematics' });
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 30, text: '30%' });
  });

  it('shows an em dash for a subject with no topics', () => {
    renderWithTheme(<ProgressRing progress={makeProgress(0, 0)} label="New Subject" />);

    expect(screen.getByText('—')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-ring-arc')).toBeNull();
  });

  it('draws no arc when nothing is complete', () => {
    renderWithTheme(<ProgressRing progress={makeProgress(0, 5)} label="Science" />);

    expect(screen.queryByTestId('progress-ring-arc')).toBeNull();
    expect(screen.getByText('0%')).toBeOnTheScreen();
  });

  it('can hide the centre value for small renderings', () => {
    renderWithTheme(<ProgressRing progress={makeProgress(1, 2)} label="Science" hideValue />);

    expect(screen.queryByText('50%')).toBeNull();
  });
});
