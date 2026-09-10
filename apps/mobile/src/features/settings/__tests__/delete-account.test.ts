import { isDemoMode } from '../../../config/env';
import { getSupabase } from '../../../lib/supabase';
import { DELETE_ACCOUNT_FUNCTION, deleteRemoteAccount } from '../delete-account';

jest.mock('../../../config/env');
jest.mock('../../../lib/supabase');

const mockedDemo = isDemoMode as jest.MockedFunction<typeof isDemoMode>;
const mockedSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;
const invoke = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedDemo.mockReturnValue(false);
  mockedSupabase.mockReturnValue({ functions: { invoke } } as never);
  invoke.mockResolvedValue({ data: { deleted: true }, error: null });
});

describe('deleting the server account', () => {
  it('asks the function to delete it', async () => {
    await expect(deleteRemoteAccount()).resolves.toEqual({ kind: 'deleted' });
    expect(invoke).toHaveBeenCalledWith(DELETE_ACCOUNT_FUNCTION, { body: {} });
  });

  it('sends no account id, so there is nothing to point elsewhere', async () => {
    // The function deletes whoever the verified token names. An id in the body
    // would be a way to ask it to delete somebody else.
    await deleteRemoteAccount();

    expect(invoke.mock.calls[0][1]).toEqual({ body: {} });
  });

  it('makes no request at all in a demo, which has no server account', async () => {
    mockedDemo.mockReturnValue(true);

    await expect(deleteRemoteAccount()).resolves.toEqual({ kind: 'localOnly' });
    expect(invoke).not.toHaveBeenCalled();
  });
});

/**
 * The device data is already gone by this point, so a failure must never read as
 * success — the account still exists and the student needs to know to retry.
 */
describe('when the account could not be deleted', () => {
  it('says the account still exists when the server is unreachable', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Network request failed') });

    const result = await deleteRemoteAccount();

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.message).toMatch(/could not reach the server/);
      expect(result.message).not.toMatch(/deleted your account/);
    }
  });

  it('explains an undeployed function rather than blaming the student', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('Requested function not found (404)'),
    });

    const result = await deleteRemoteAccount();

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') expect(result.message).toMatch(/not set up on the server yet/);
  });

  it('survives the call throwing outright', async () => {
    invoke.mockRejectedValue(new Error('boom'));

    await expect(deleteRemoteAccount()).resolves.toMatchObject({ kind: 'failed' });
  });

  it('never repeats a raw server error to the student', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('PGRST301 JWT expired at 12345') });

    const result = await deleteRemoteAccount();

    if (result.kind === 'failed') expect(result.message).not.toMatch(/PGRST301/);
  });
});
