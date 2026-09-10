import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

/**
 * The typeface.
 *
 * Inter rather than the platform default: the system faces differ between
 * Android and the browser, so identical type would render at different weights
 * and widths on each. Inter also has proper tabular figures, which the timer and
 * every percentage depend on — without them digits change width as they change
 * value and the numbers visibly jitter.
 */
export const interFonts = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

/** Maps a weight token to the loaded family, since RN cannot synthesise weights. */
export const fontFamilyForWeight: Record<string, string> = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
};
