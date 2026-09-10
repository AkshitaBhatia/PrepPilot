import type { FC } from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * Stands in for an SVG import under Jest.
 *
 * Metro compiles `.svg` into a React component (see metro.config.js), but Jest
 * uses its own transform and would otherwise hand the test an asset object.
 * A plain View keeps the props — size, testID, accessibility — visible to
 * assertions without pulling in a renderer.
 */
const SvgMock: FC<ViewProps> = (props) => <View {...props} />;

export default SvgMock;
