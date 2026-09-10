import * as Network from 'expo-network';

/**
 * Connectivity.
 *
 * PRD §6 makes the tracker work offline and §22 requires sync to "retry after
 * network failure", so the app has to know when a connection returns rather than
 * waiting for the student to notice and press something.
 *
 * `isInternetReachable` is preferred over `isConnected` where the platform
 * reports it: being attached to a café wifi that has not been paid for is
 * "connected" and useless. Where it is unknown, connection is the best available
 * signal.
 */

export interface Connectivity {
  readonly online: boolean;
  /** False when the platform could not tell us, so the value is a best guess. */
  readonly certain: boolean;
}

export function interpret(state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}): Connectivity {
  const reachable = state.isInternetReachable;
  if (reachable === true || reachable === false) {
    return { online: reachable, certain: true };
  }

  const connected = state.isConnected;
  if (connected === true || connected === false) {
    return { online: connected, certain: false };
  }

  // Nothing known. Assume online: wrongly blocking a student who *is* connected
  // is worse than attempting a request that fails and retries.
  return { online: true, certain: false };
}

export async function currentConnectivity(): Promise<Connectivity> {
  try {
    return interpret(await Network.getNetworkStateAsync());
  } catch {
    return { online: true, certain: false };
  }
}

/** Subscribes to connectivity changes. Returns an unsubscribe. */
export function watchConnectivity(onChange: (state: Connectivity) => void): () => void {
  try {
    const subscription = Network.addNetworkStateListener((state) => {
      onChange(interpret(state));
    });

    return () => subscription.remove();
  } catch {
    // Some platforms have no listener. The app still works; it just will not
    // notice a reconnection on its own.
    return () => {};
  }
}
