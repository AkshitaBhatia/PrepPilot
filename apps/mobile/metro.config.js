// Metro configuration for a pnpm monorepo.
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits to @preppilot/shared trigger a reload.
config.watchFolders = [workspaceRoot];

// Resolve from the app first, then fall back to the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// expo-sqlite runs on web through wa-sqlite, which ships as a .wasm file. Metro
// does not treat .wasm as an asset by default, so the web build fails to resolve
// it and the whole app becomes unbuildable for the browser.
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

// The logo is an SVG, and assets/logo.svg is the single source of truth for the
// app's branding. This makes `import Logo from '.../logo.svg'` a React
// component rather than an image path, so the mark scales without pixelating
// and picks up the theme. `.svg` moves from assets to source for that reason.
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

module.exports = withNativeWind(config, { input: './global.css' });
