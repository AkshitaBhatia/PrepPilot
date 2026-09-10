import { Platform } from 'react-native';
import LogoMark from '../../../assets/logo.svg';

export interface LogoProps {
  /** Rendered square; the mark keeps its aspect ratio inside it. */
  readonly size?: number;
  /** Announced to a screen reader. Omit where the logo sits beside the name. */
  readonly label?: string;
  readonly testID?: string;
}

/**
 * The application logo, wherever it appears.
 *
 * There is one logo file — `assets/logo.svg` — and this is the only thing that
 * reads it. Replacing that file changes the splash screen, the sign-in screens
 * and the launcher icon together, which is the point: separate copies are how a
 * rebrand ends up half-finished.
 *
 * Drawn from the SVG rather than a PNG so it stays sharp at every size, and the
 * viewBox does the scaling, so a logo that is not square is letterboxed rather
 * than stretched.
 */
export function Logo({ size = 96, label, testID }: LogoProps) {
  return (
    <LogoMark
      width={size}
      height={size}
      testID={testID}
      accessibilityRole={label === undefined ? 'none' : 'image'}
      {...(label === undefined
        ? { ...(Platform.OS !== 'web' ? { accessibilityElementsHidden: true } : {}) }
        : { accessibilityLabel: label })}
    />
  );
}
