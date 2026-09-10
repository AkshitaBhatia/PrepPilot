import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { TrackerSwitcher } from '../../features/trackers/components/tracker-switcher';
import { useTheme } from '../../theme/theme-context';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

export interface AppHeaderProps {
  /** The overline above the title, e.g. "YOUR SYLLABUS". */
  readonly overline?: string;
  readonly title: string;
  /** Rendered on the title's row, right-aligned — the screen's primary action. */
  readonly action?: React.ReactNode;
  /** Rendered under the title, before the screen's own content. */
  readonly children?: React.ReactNode;
}

interface HeaderAction {
  readonly icon: IconName;
  readonly label: string;
  readonly href: string;
}

/** The two destinations that are not a tab. */
const TRAILING: readonly HeaderAction[] = [
  { icon: 'courses', label: 'Courses', href: '/templates' },
  { icon: 'assistant', label: 'Assistant', href: '/assistant' },
  { icon: 'settings', label: 'Settings', href: '/settings' },
];

/**
 * The bar every screen wears.
 *
 * Courses on the left, the assistant and settings on the right, the screen's own
 * title between them. These three are reachable from everywhere because none of
 * them is a tab: with four tabs there is no room, and the previous arrangement
 * hid the template library behind an empty state that a student with any subject
 * at all could never see — so the templates were unreachable in practice.
 */
export function AppHeader({ overline, title, action, children }: AppHeaderProps) {
  const theme = useTheme();

  const iconLink = (item: HeaderAction, testID: string) => (
    <PressableScale
      key={item.href}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      testID={testID}
      onPress={() => router.push(item.href as never)}
      style={[
        styles.action,
        {
          minWidth: theme.minTouchTarget,
          minHeight: theme.minTouchTarget,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Icon name={item.icon} size={22} color={theme.colors.textSecondary} />
    </PressableScale>
  );

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={styles.bar}>
        {/*
          The course you are on, top left, as the reference does — everything
          below is scoped to it, so it belongs on every screen rather than
          behind a menu.
        */}
        <TrackerSwitcher />
        <View style={styles.spacer} />
        <View style={styles.trailing}>
          {TRAILING.map((item) => iconLink(item, `header-${item.icon}`))}
        </View>
      </View>

      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          {overline !== undefined && (
            <Text variant="caption" tone="muted" overline>
              {overline}
            </Text>
          )}
          <Text variant="heading">{title}</Text>
        </View>
        {action}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleText: { flex: 1 },
  spacer: { flex: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  action: { alignItems: 'center', justifyContent: 'center' },
});
