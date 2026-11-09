// Reading the one-time login from the password reset email's link.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSetSession = jest.fn(async (_tokens: { access_token: string; refresh_token: string }) => ({ error: null as null | { message: string } }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { setSession: (tokens: { access_token: string; refresh_token: string }) => mockSetSession(tokens), onAuthStateChange: jest.fn() } } }));
jest.mock('@/lib/session', () => ({ endSession: jest.fn(), startSession: jest.fn() }));

// eslint-disable-next-line import/first
import { signInFromResetLink } from '@/lib/auth';

describe('the reset link', () => {
  beforeEach(() => {
    mockSetSession.mockClear();
  });

  it('signs in with the tokens after "#"', async () => {
    const url = 'exp://192.168.1.5:8083/--/reset-password#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery';
    expect(await signInFromResetLink(url)).toBeNull();
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'abc', refresh_token: 'def' });
  });

  it('explains an expired or used link', async () => {
    const url = 'nexgain://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    expect(await signInFromResetLink(url)).toMatch(/expired or was already used/);
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('does nothing for a plain link without tokens', async () => {
    expect(await signInFromResetLink('nexgain://reset-password')).toBeNull();
    expect(mockSetSession).not.toHaveBeenCalled();
  });
});
