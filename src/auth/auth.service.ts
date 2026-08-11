import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthSessionService,
  isValidStellarAddress,
} from './auth-session.service';
import { verifySep53SignedMessage } from './sep53-verify';

const CHALLENGE_TTL_MILLISECONDS = 10 * 60 * 1000;
const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';

type ChallengeInput = {
  walletAddress?: unknown;
};

type VerifyInput = {
  challengeId?: unknown;
  walletAddress?: unknown;
  signedMessage?: unknown;
};

export type AppSession = { kind: 'wallet'; walletAddress: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AuthSessionService,
  ) {}

  async createChallenge(input: ChallengeInput) {
    try {
      const walletAddress = this.requiredString(input.walletAddress);
      if (!isValidStellarAddress(walletAddress)) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'walletAddress required (Stellar G..., 56 chars)',
        );
      }

      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MILLISECONDS);
      const message = this.createChallengeMessage(walletAddress, expiresAt);
      const challenge = await this.prisma.authChallenge.create({
        data: { walletAddress, message, expiresAt },
      });

      return {
        challengeId: challenge.id,
        message: challenge.message,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      this.throwMappedError(error, 'Auth challenge error');
    }
  }

  async verifyWalletSignature(input: VerifyInput) {
    try {
      const secret = this.getAuthSecret();
      const challengeId = this.requiredString(input.challengeId);
      const walletAddress = this.requiredString(input.walletAddress);
      const signedMessage = this.requiredString(input.signedMessage);

      if (!challengeId || !walletAddress || !signedMessage) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'challengeId, walletAddress, and signedMessage required',
        );
      }
      if (!isValidStellarAddress(walletAddress)) {
        throw this.error(HttpStatus.BAD_REQUEST, 'Invalid walletAddress');
      }

      const challenge = await this.prisma.authChallenge.findUnique({
        where: { id: challengeId },
      });
      if (!challenge || challenge.used) {
        throw this.error(HttpStatus.BAD_REQUEST, 'Invalid or used challenge');
      }
      if (challenge.expiresAt.getTime() < Date.now()) {
        throw this.error(HttpStatus.BAD_REQUEST, 'Challenge expired');
      }
      if (challenge.walletAddress !== walletAddress) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'Wallet does not match challenge',
        );
      }
      if (
        !verifySep53SignedMessage(
          challenge.message,
          signedMessage,
          walletAddress,
        )
      ) {
        throw this.error(HttpStatus.UNAUTHORIZED, 'Invalid signature');
      }

      await this.prisma.authChallenge.update({
        where: { id: challengeId },
        data: { used: true },
      });

      return {
        walletAddress,
        sessionToken: this.sessions.createDashboardSessionToken(
          walletAddress,
          secret,
        ),
      };
    } catch (error) {
      this.throwMappedError(error, 'Auth verify error');
    }
  }

  getAuthSecret(): string {
    const secret = process.env.AUTH_SECRET?.trim();
    if (!secret) {
      throw this.error(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Server misconfiguration: AUTH_SECRET is not set',
      );
    }

    return secret;
  }

  getAppSession(request: import('express').Request): AppSession {
    const secret = this.getAuthSecret();
    const walletAddress = this.sessions.getDashboardWallet(request, secret);
    if (walletAddress) {
      return { kind: 'wallet', walletAddress };
    }

    throw this.error(HttpStatus.UNAUTHORIZED, 'Unauthorized');
  }

  async getCurrentIdentity(request: import('express').Request) {
    try {
      const session = this.getAppSession(request);
      return {
        auth: 'wallet' as const,
        walletAddress: session.walletAddress,
      };
    } catch (error) {
      this.throwMappedError(error, 'Auth session lookup error');
    }
  }

  private createChallengeMessage(
    walletAddress: string,
    expiresAt: Date,
  ): string {
    const nonce = randomBytes(24).toString('hex');

    return [
      'Hypertron dashboard sign-in',
      '',
      `Wallet: ${walletAddress}`,
      `Nonce: ${nonce}`,
      `Expires (UTC): ${expiresAt.toISOString()}`,
      '',
      'Signing this message proves you control this wallet. Do not share this signature.',
    ].join('\n');
  }

  private requiredString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private throwMappedError(error: unknown, context: string): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (isPrismaConnectionError(error)) {
      throw this.error(
        HttpStatus.SERVICE_UNAVAILABLE,
        DATABASE_UNAVAILABLE_MESSAGE,
      );
    }

    console.error(`${context}:`, error);
    throw this.error(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
  }

  private error(status: HttpStatus, message: string): HttpException {
    return new HttpException({ error: message }, status);
  }
}

function isPrismaConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const prismaError = error as {
    cause?: unknown;
    code?: string;
    message?: string;
    name?: string;
  };
  if (prismaError.name === 'PrismaClientInitializationError') {
    return true;
  }
  if (prismaError.code === 'P1001' || prismaError.code === 'P1017') {
    return true;
  }

  const message =
    typeof prismaError.message === 'string'
      ? prismaError.message
      : typeof prismaError.cause === 'string'
        ? prismaError.cause
        : '';
  return [
    'Error creating a database connection',
    'No route to host',
    'DNS resolution',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
  ].some((fragment) => message.includes(fragment));
}
