/**
 * SVG files are React components, not image paths.
 *
 * `react-native-svg-transformer` compiles them at bundle time — see
 * metro.config.js. Without this declaration TypeScript sees an untyped import.
 */
declare module '*.svg' {
  import type { FC } from 'react';
  import type { SvgProps } from 'react-native-svg';

  const content: FC<SvgProps>;
  export default content;
}
