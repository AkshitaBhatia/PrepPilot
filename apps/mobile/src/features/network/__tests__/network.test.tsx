import * as Network from 'expo-network';
import { act } from '@testing-library/react-native';
import type { Repositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { renderWithTheme, screen } from '../../../test-utils/render';
import { createFakeRemote } from '../../sync/test-support/fake-remote';
import { resetSyncStore, useSyncStore } from '../../sync/sync-store';
import { OfflineBanner } from '../components/offline-banner';
import { interpret } from '../network';
import { resetNetworkStore, useNetworkStore } from '../network-store';

jest.mock('expo-network');
jest.mock('../../../lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../../config/env', () => ({
  ...jest.requireActual('../../../config/env'),
  isDemoMode: jest.fn(() => false),
}));

const mocked = Network as jest.Mocked<typeof Network>;

beforeEach(() => {
  jest.clearAllMocks();
  resetNetworkStore();
});

describe('interpret', () => {
  /** A café wifi you have not paid for is "connected" and useless. */
  it('prefers reachability over mere connection', () => {
    expect(interpret({ isConnected: true, isInternetReachable: false })).toEqual({
      online: false,
      certain: true,
    });
  });

  it('trusts a positive reachability report', () => {
    expect(interpret({ isConnected: true, isInternetReachable: true })).toEqual({
      online: true,
      certain: true,
    });
  });

  it('falls back to connection when reachability is unknown', () => {
    expect(interpret({ isConnected: false, isInternetReachable: null })).toEqual({
      online: false,
      certain: false,
    });
  });

  /**
   * Wrongly blocking a student who is connected is worse than attempting a
   * request that fails and retries.
   */
  it('assumes online when the platform knows nothing', () => {
    expect(interpret({})).toEqual({ online: true, certain: false });
  });
});

describe('the store', () => {
  it('reads connectivity on start', async () => {
    mocked.getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    } as never);
    mocked.addNetworkStateListener.mockReturnValue({ remove: jest.fn() } as never);

    await act(async () => {
      await useNetworkStore.getState().start();
    });

    expect(useNetworkStore.getState()).toMatchObject({ online: false, known: true });
  });

  it('survives a platform that cannot report connectivity', async () => {
    mocked.getNetworkStateAsync.mockRejectedValue(new Error('unsupported'));
    mocked.addNetworkStateListener.mockImplementation(() => {
      throw new Error('unsupported');
    });

    await act(async () => {
      await useNetworkStore.getState().start();
    });

    expect(useNetworkStore.getState().online).toBe(true);
  });

  /**
   * PRD §22 asks for retry after a network failure. Waiting for the student to
   * notice and press something is not that.
   */
  it('calls back when the connection returns', async () => {
    const listeners: ((state: unknown) => void)[] = [];
    mocked.getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    } as never);
    mocked.addNetworkStateListener.mockImplementation((handler) => {
      listeners.push(handler as (state: unknown) => void);
      return { remove: jest.fn() } as never;
    });

    const onReconnect = jest.fn();
    await act(async () => {
      await useNetworkStore.getState().start(onReconnect);
    });

    act(() => {
      listeners[0]?.({ isConnected: true, isInternetReachable: true });
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  /** Switching wifi to cellular reports a change but was never a reconnection. */
  it('does not fire when it was already online', async () => {
    const listeners: ((state: unknown) => void)[] = [];
    mocked.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    } as never);
    mocked.addNetworkStateListener.mockImplementation((handler) => {
      listeners.push(handler as (state: unknown) => void);
      return { remove: jest.fn() } as never;
    });

    const onReconnect = jest.fn();
    await act(async () => {
      await useNetworkStore.getState().start(onReconnect);
    });

    act(() => {
      listeners[0]?.({ isConnected: true, isInternetReachable: true });
    });

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('unsubscribes when torn down', async () => {
    const remove = jest.fn();
    mocked.getNetworkStateAsync.mockResolvedValue({ isConnected: true } as never);
    mocked.addNetworkStateListener.mockReturnValue({ remove } as never);

    let stop: () => void = () => {};
    await act(async () => {
      stop = await useNetworkStore.getState().start();
    });
    stop();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('OfflineBanner', () => {
  it('says nothing before connectivity is known', () => {
    renderWithTheme(<OfflineBanner />);

    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('says nothing while online', () => {
    act(() => {
      useNetworkStore.getState().set({ online: true, certain: true });
    });
    renderWithTheme(<OfflineBanner />);

    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  /** Reassuring, not alarming: everything except the assistant still works. */
  it('reassures rather than alarms when offline', () => {
    act(() => {
      useNetworkStore.getState().set({ online: false, certain: true });
    });
    renderWithTheme(<OfflineBanner />);

    expect(screen.getByTestId('offline-banner')).toBeOnTheScreen();
    expect(screen.getByText(/saved on this device/)).toBeOnTheScreen();
  });
});

describe('sync while offline', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let repositories: Repositories;
  let fake: ReturnType<typeof createFakeRemote>;

  beforeEach(() => {
    db = createTestDatabase();
    repositories = createTestRepositories(db, createTestClock());
    fake = createFakeRemote();
    resetSyncStore();
  });

  afterEach(() => {
    db.$close();
  });

  /**
   * Failing loudly on every launch in a tunnel trains a student to ignore the
   * message. The reconnect watcher retries as soon as there is a connection.
   */
  it('does not attempt a request that cannot succeed', async () => {
    act(() => {
      useNetworkStore.getState().set({ online: false, certain: true });
    });
    const pull = jest.spyOn(fake.remote, 'pull');

    await useSyncStore.getState().syncNow('user-1', { remote: fake.remote, repositories });

    expect(pull).not.toHaveBeenCalled();
    expect(useSyncStore.getState().status).toBe('idle');
    expect(useSyncStore.getState().error).toBeNull();
  });

  it('syncs normally once online', async () => {
    act(() => {
      useNetworkStore.getState().set({ online: true, certain: true });
    });
    await repositories.subjects.create({ userId: 'user-1', name: 'Mathematics' });

    await useSyncStore.getState().syncNow('user-1', { remote: fake.remote, repositories });

    expect(fake.rows('subjects')).toHaveLength(1);
  });
});
