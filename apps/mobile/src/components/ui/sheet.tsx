import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/theme-context';

export interface SheetProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  /** Announced as the dialog's name. */
  readonly label: string;
  readonly children: ReactNode;
  readonly testID?: string;
}

/**
 * A centred modal sheet with a tap-to-dismiss backdrop.
 *
 * The backdrop is a **sibling** of the sheet, not its parent. Wrapping the
 * content in a pressable that also carries `accessibilityRole="button"` makes a
 * screen reader announce the whole dialog as one button — its computed name
 * becomes every word inside it — and every control within inherits that
 * ambiguity. Keeping them siblings means the backdrop is one dismiss target and
 * the sheet's own controls stay individually reachable.
 */
export function Sheet({ visible, onDismiss, label, children, testID }: SheetProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.root} testID={testID}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${label}`}
          style={styles.backdrop}
          onPress={onDismiss}
        />

        <View pointerEvents="box-none" style={styles.centre}>
          <View
            accessibilityViewIsModal
            accessibilityRole="none"
            accessibilityLabel={label}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.xl,
                padding: theme.spacing.lg,
                gap: theme.spacing.base,
              },
            ]}
          >
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  centre: { flex: 1, justifyContent: 'center', padding: 24 },
  sheet: { borderWidth: StyleSheet.hairlineWidth, maxHeight: '85%' },
});
