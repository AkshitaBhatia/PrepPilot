import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../../theme/theme-context';

/**
 * The icon set.
 *
 * Drawn inline rather than pulled from a font or icon package: the app needs
 * a handful of glyphs, and a whole icon library would be a large dependency plus a
 * second visual language to keep consistent with the type. These share one
 * stroke weight and one corner treatment, so they read as a set.
 */
export type IconName =
  | 'tracker'
  | 'dashboard'
  | 'history'
  | 'reminders'
  | 'focus'
  | 'assistant'
  | 'cards'
  | 'notes'
  | 'sessions'
  | 'courses'
  | 'search'
  | 'book'
  | 'sparkles'
  | 'plus'
  | 'settings';

export interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
  /**
   * Icons here always accompany a text label, so they are decorative and hidden
   * from screen readers. Set a label only for an icon that stands alone.
   */
  readonly label?: string;
  readonly testID?: string;
}

export function Icon({ name, size = 22, color, label, testID }: IconProps) {
  const theme = useTheme();
  const stroke = color ?? theme.colors.textSecondary;

  const common = {
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityRole={label === undefined ? 'none' : 'image'}
      {...(label === undefined
        ? { accessibilityElementsHidden: true }
        : { accessibilityLabel: label })}
    >
      {name === 'tracker' && (
        <>
          <Path d="M4 6h16M4 12h16M4 18h10" {...common} />
          <Circle cx="19.5" cy="18" r="2" {...common} />
        </>
      )}
      {name === 'dashboard' && (
        <>
          <Path d="M4 19V11M10 19V5M16 19v-5M22 19H2" {...common} />
        </>
      )}
      {name === 'history' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Path d="M12 7.5V12l3 2" {...common} />
        </>
      )}
      {name === 'reminders' && (
        <>
          <Path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" {...common} />
          <Path d="M10.5 19a2 2 0 0 0 3 0" {...common} />
        </>
      )}
      {name === 'notes' && (
        <>
          {/* A page with written lines on it. */}
          <Path
            d="M6.5 3.5h8L19 8v12.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"
            {...common}
          />
          <Path d="M14 3.5V8h4.5M9 12.5h6M9 16.5h4" {...common} />
        </>
      )}
      {name === 'sessions' && (
        <>
          {/* A clock inside a ring: time, recorded. */}
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Path d="M12 7.5V12l3.5 2" {...common} />
          <Path d="M3.5 12h2M18.5 12h2" {...common} />
        </>
      )}
      {name === 'courses' && (
        <>
          {/* An open book: the syllabus a course is chosen from. */}
          <Path d="M12 6.5S10 4.5 4 4.5v13c6 0 8 2 8 2s2-2 8-2v-13c-6 0-8 2-8 2Z" {...common} />
          <Path d="M12 6.5v15" {...common} />
        </>
      )}
      {name === 'cards' && (
        <>
          {/* Two stacked cards: the offset one reads as "more behind this". */}
          <Path
            d="M7.5 7.5h11a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 6 18V9a1.5 1.5 0 0 1 1.5-1.5Z"
            {...common}
          />
          <Path d="M4 16.5V6a1.5 1.5 0 0 1 1.5-1.5H16" {...common} />
        </>
      )}
      {name === 'focus' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Circle cx="12" cy="12" r="3.5" {...common} />
        </>
      )}
      {name === 'assistant' && (
        <>
          <Path
            d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9 12 3.5Z"
            {...common}
          />
          <Path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" {...common} />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="6.5" {...common} />
          <Path d="m16 16 4 4" {...common} />
        </>
      )}
      {name === 'book' && (
        <>
          <Path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5Z" {...common} />
          <Path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v2H5.5A1.5 1.5 0 0 1 4 19.5Z" {...common} />
        </>
      )}
      {name === 'sparkles' && (
        <>
          <Path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6Z" {...common} />
          <Path d="M18 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" {...common} />
        </>
      )}
      {name === 'plus' && (
        <>
          <Path d="M12 5v14M5 12h14" {...common} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path
            d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3"
            {...common}
          />
        </>
      )}
    </Svg>
  );
}
