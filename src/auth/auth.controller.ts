import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Post('challenge')
  createChallenge(@Body() body: { walletAddress?: unknown }) {
    return this.authService.createChallenge(body ?? {});
  }

  @Post('verify')
  async verify(
    @Body()
    body: {
      challengeId?: unknown;
      walletAddress?: unknown;
      signedMessage?: unknown;
    },
    @Res({ passthrough: true }) response: Response,
  ) {
    const { walletAddress, sessionToken } =
      await this.authService.verifyWalletSignature(body ?? {});
    this.sessions.appendDashboardSessionCookie(response, sessionToken);

    return { ok: true, walletAddress };
  }

  @Get('me')
  getCurrentSession(@Req() request: Request) {
    return this.authService.getCurrentIdentity(request);
  }

  @Post('privy/sync')
  async synchronizePrivy(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.synchronizePrivy(
      readBearerToken(request.get('authorization')),
    );
    this.sessions.appendPrivySessionCookie(response, result.sessionToken);

    return { ok: true, user: result.user };
  }

  @Get('privy/wallet')
  getPrivyWallet(@Req() request: Request) {
    return this.authService.getPrivyWallet(request);
  }

  @Post('privy/wallet')
  updatePrivyWallet(
    @Req() request: Request,
    @Body() body: { address?: unknown; walletId?: unknown },
  ) {
    return this.authService.updatePrivyWallet(request, body ?? {});
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    this.sessions.clearAuthCookies(response);
    return { ok: true };
  }
}

function readBearerToken(authorization: string | undefined): string {
  return authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
}
