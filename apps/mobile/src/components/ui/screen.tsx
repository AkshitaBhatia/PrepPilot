import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/theme-context';
import { OfflineBanner } from '../../features/network/components/offline-banner';
import { DemoBanner } from './demo-banner';

export interface ScreenProps extends ViewProps {
  /** Applies horizontal screen padding. Disable for edge-to-edge lists. */
  readonly padded?: boolean;
}

/**
 * Root container: paints the app background, respects safe areas, and stops
 * content widening past a readable measure.
 *
 * The app is phone-first but runs in a browser and on tablets, where a full-width
 * layout would stretch text lines far past the ~70 characters beyond which
 * reading measurably slows. Content centres and caps instead.
 */
export function Screen({ padded = true, style, children, ...rest }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isWide = width >= theme.layout.wideBreakpoint;

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        style,
      ]}
      {...rest}
    >
      <DemoBanner />
      <OfflineBanner />

      <View
        testID="screen-content"
        style={[
          styles.content,
          {
            maxWidth: theme.layout.contentMaxWidth,
            paddingLeft: insets.left + (padded ? theme.spacing.base : 0),
            paddingRight: insets.right + (padded ? theme.spacing.base : 0),
            // A little more breathing room once there is room to give.
            paddingTop: isWide ? theme.spacing.md : 0,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
});
