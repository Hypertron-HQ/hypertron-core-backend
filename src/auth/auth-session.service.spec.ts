import type { Request } from 'express';
import {
  AuthSessionService,
  DASHBOARD_SESSION_COOKIE,
} from './auth-session.service';

const WALLET_ADDRESS = `G${'A'.repeat(55)}`;
const AUTH_SECRET = 'test-session-secret';

describe('AuthSessionService', () => {
  const sessions = new AuthSessionService();

  it('accepts a signed dashboard session cookie', () => {
    const token = sessions.createDashboardSessionToken(
      WALLET_ADDRESS,
      AUTH_SECRET,
    );
    const request = {
      headers: { cookie: `${DASHBOARD_SESSION_COOKIE}=${token}` },
    } as Request;

    expect(sessions.getDashboardWallet(request, AUTH_SECRET)).toBe(
      WALLET_ADDRESS,
    );
  });

  it('rejects a modified dashboard session cookie', () => {
    const token = sessions.createDashboardSessionToken(
      WALLET_ADDRESS,
      AUTH_SECRET,
    );
    const request = {
      headers: { cookie: `${DASHBOARD_SESSION_COOKIE}=${token}x` },
    } as Request;

    expect(sessions.getDashboardWallet(request, AUTH_SECRET)).toBeNull();
  });

  it('rejects a session signed with another secret', () => {
    const token = sessions.createDashboardSessionToken(
      WALLET_ADDRESS,
      AUTH_SECRET,
    );
    const request = {
      headers: { cookie: `${DASHBOARD_SESSION_COOKIE}=${token}` },
    } as Request;

    expect(sessions.getDashboardWallet(request, 'another-secret')).toBeNull();
  });
});
