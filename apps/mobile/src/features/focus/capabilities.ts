import { Platform } from 'react-native';

/**
 * What Focus Mode can and cannot actually do.
 *
 * PRD §17 requires realistic capabilities and forbids claiming universal app
 * blocking: "Never claim universal app blocking. Document device/API
 * limitations." This module is that documentation, in a form the UI renders, so
 * the honest limits are visible to the student rather than buried in a file
 * nobody reads.
 *
 * Blocking other apps on Android needs either an AccessibilityService or
 * device-admin privileges. Both are heavily restricted by Play Store policy, and
 * an app claiming to block others while silently failing would be worse than one
 * that says plainly what it does.
 */

export interface FocusCapability {
  readonly id: string;
  readonly label: string;
  /** True when PrepPilot actually does this on the current platform. */
  readonly supported: boolean;
  /** Why, in terms a student understands. Shown for unsupported entries. */
  readonly detail: string;
}

export function focusCapabilities(platform: string = Platform.OS): readonly FocusCapability[] {
  const isAndroid = platform === 'android';
  const isNative = platform === 'android' || platform === 'ios';

  return [
    {
      id: 'fullscreen',
      label: 'Full-screen focus timer',
      supported: true,
      detail: 'A single, distraction-free screen for the length of your session.',
    },
    {
      id: 'quiet',
      label: 'PrepPilot stays quiet',
      supported: true,
      detail: 'Your own reminders will not interrupt a focus session.',
    },
    {
      id: 'awake',
      label: 'Screen stays on',
      supported: isNative,
      detail: isNative
        ? 'Your screen will not dim while the session runs.'
        : 'Only available in the app, not in a browser.',
    },
    {
      id: 'distractions',
      label: 'Counts when you leave',
      supported: isNative,
      detail: isNative
        ? 'PrepPilot notices when you switch away, so you can see it afterwards.'
        : 'Only available in the app, not in a browser.',
    },
    {
      id: 'blocking',
      label: 'Blocking other apps',
      supported: false,
      // The honest statement PRD §17 demands.
      detail: isAndroid
        ? 'Android does not let PrepPilot block other apps. Nothing here prevents you opening them — the session counts the times you do instead.'
        : 'Not possible on this platform.',
    },
    {
      id: 'dnd',
      label: 'Silencing other apps’ notifications',
      supported: false,
      detail:
        'Turning on Do Not Disturb needs a system permission PrepPilot does not request. Use your device’s own Do Not Disturb alongside a session.',
    },
  ];
}

/** The capabilities that are genuinely active, for the session summary. */
export function activeCapabilities(platform: string = Platform.OS): readonly FocusCapability[] {
  return focusCapabilities(platform).filter((capability) => capability.supported);
}
