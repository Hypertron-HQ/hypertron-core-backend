import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

export const DASHBOARD_SESSION_COOKIE = 'ht_dashboard';
export const PRIVY_SESSION_COOKIE = 'ht_privy';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type DashboardSessionPayload = {
  w: string;
  exp: number;
};

type PrivySessionPayload = {
  u: string;
  p: string;
  exp: number;
};

export type PrivySession = {
  appUserId: string;
  privyId: string;
};

@Injectable()
export class AuthSessionService {
  createDashboardSessionToken(walletAddress: string, secret: string): string {
    const payload: DashboardSessionPayload = {
      w: walletAddress,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.sign(encodedPayload, secret);

    return `${encodedPayload}.${signature}`;
  }

  getDashboardWallet(request: Request, secret: string): string | null {
    const token = this.readCookie(request, DASHBOARD_SESSION_COOKIE);
    const payload = token ? this.parseSignedPayload(token, secret) : null;
    if (
      !payload ||
      typeof payload.w !== 'string' ||
      !isValidStellarAddress(payload.w) ||
      !this.hasValidExpiration(payload.exp)
    ) {
      return null;
    }

    return payload.w;
  }

  createPrivySessionToken(
    appUserId: string,
    privyId: string,
    secret: string,
  ): string {
    const payload: PrivySessionPayload = {
      u: appUserId,
      p: privyId,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );

    return `${encodedPayload}.${this.sign(encodedPayload, secret)}`;
  }

  getPrivySession(request: Request, secret: string): PrivySession | null {
    const token = this.readCookie(request, PRIVY_SESSION_COOKIE);
    const payload = token ? this.parseSignedPayload(token, secret) : null;
    if (
      !payload ||
      typeof payload.u !== 'string' ||
      !payload.u.trim() ||
      typeof payload.p !== 'string' ||
      !payload.p.trim() ||
      !this.hasValidExpiration(payload.exp)
    ) {
      return null;
    }

    return { appUserId: payload.u.trim(), privyId: payload.p.trim() };
  }

  appendDashboardSessionCookie(response: Response, token: string): void {
    response.cookie(
      DASHBOARD_SESSION_COOKIE,
      token,
      this.cookieOptions(SESSION_MAX_AGE_SECONDS),
    );
  }

  appendPrivySessionCookie(response: Response, token: string): void {
    response.cookie(
      PRIVY_SESSION_COOKIE,
      token,
      this.cookieOptions(SESSION_MAX_AGE_SECONDS),
    );
  }

  clearAuthCookies(response: Response): void {
    const options = this.cookieOptions(0);
    response.clearCookie(DASHBOARD_SESSION_COOKIE, options);
    response.clearCookie(PRIVY_SESSION_COOKIE, options);
  }

  private sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  private isValidSignature(signature: string, expected: string): boolean {
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private parseSignedPayload(
    token: string,
    secret: string,
  ): Record<string, unknown> | null {
    const [encodedPayload, signature, ...rest] = token.split('.');
    if (!encodedPayload || !signature || rest.length > 0) {
      return null;
    }

    const expectedSignature = this.sign(encodedPayload, secret);
    if (!this.isValidSignature(signature, expectedSignature)) {
      return null;
    }

    try {
      const payload: unknown = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      );
      return payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private hasValidExpiration(value: unknown): value is number {
    return (
      typeof value === 'number' && value >= Math.floor(Date.now() / 1000) - 60
    );
  }

  private readCookie(request: Request, name: string): string | null {
    const header = request.headers.cookie;
    if (!header) {
      return null;
    }

    for (const entry of header.split(';')) {
      const [rawName, ...rawValue] = entry.trim().split('=');
      if (rawName !== name) {
        continue;
      }

      try {
        return decodeURIComponent(rawValue.join('='));
      } catch {
        return null;
      }
    }

    return null;
  }

  private cookieOptions(maxAgeSeconds: number) {
    return {
      httpOnly: true,
      maxAge: maxAgeSeconds * 1000,
      path: '/',
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
  }
}

export function isValidStellarAddress(value: string): boolean {
  return value.length === 56 && value.startsWith('G');
}
