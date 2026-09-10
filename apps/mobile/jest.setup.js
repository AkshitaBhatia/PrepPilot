/* eslint-env jest */
// react-native-reanimated is handled by the jest-expo preset. Its own `/mock`
// entry point is not compatible with the version in use and breaks on load.

// expo-router's navigation internals do not parse under the Jest transform, and
// tests assert on navigation intent rather than on real screen transitions.
//
// The factory deliberately creates no elements. NativeWind's babel preset
// rewrites element creation to use an injected helper, which Jest rejects as an
// out-of-scope variable inside a mock factory.
jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    dismiss: jest.fn(),
    canGoBack: jest.fn(() => true),
    setParams: jest.fn(),
  };

  const nothing = () => null;

  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    useGlobalSearchParams: jest.fn(() => ({})),
    usePathname: jest.fn(() => '/'),
    useSegments: jest.fn(() => []),
    // On a screen's first focus this is exactly `useEffect`, and a standalone
    // render in a test is a screen being focused once. A no-op here would mean
    // no screen ever loaded its data.
    useFocusEffect: (callback) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useEffect } = require('react');
      useEffect(callback, [callback]);
    },
    Redirect: nothing,
    Stack: Object.assign(nothing, { Screen: nothing }),
    Tabs: Object.assign(nothing, { Screen: nothing }),
    // Every Link in the app uses `asChild`, so returning the child is faithful.
    Link: ({ children }) => children,
  };
});
