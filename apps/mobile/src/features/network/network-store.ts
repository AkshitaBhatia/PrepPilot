import { create } from 'zustand';
import { currentConnectivity, watchConnectivity, type Connectivity } from './network';

export interface NetworkState extends Connectivity {
  /** True once connectivity has actually been checked. */
  readonly known: boolean;
}

export interface NetworkActions {
  /** Starts watching. Returns an unsubscribe. */
  start: (onReconnect?: () => void) => Promise<() => void>;
  /** Test seam: sets state directly. */
  set: (state: Connectivity) => void;
}

const initialState: NetworkState = { online: true, certain: false, known: false };

export const useNetworkStore = create<NetworkState & NetworkActions>((setState, get) => ({
  ...initialState,

  async start(onReconnect) {
    const initial = await currentConnectivity();
    setState({ ...initial, known: true });

    return watchConnectivity((next) => {
      const wasOffline = !get().online;
      setState({ ...next, known: true });

      // Only on the transition back, not on every report: the platform emits a
      // state change for things like switching from wifi to cellular, and
      // re-syncing on each of those would be noise.
      if (wasOffline && next.online) onReconnect?.();
    });
  },

  set(state) {
    setState({ ...state, known: true });
  },
}));

/** Test seam: returns the store to its initial state. */
export function resetNetworkStore(): void {
  useNetworkStore.setState({ ...initialState });
}
