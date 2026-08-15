import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
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
  @HttpCode(200)
  createChallenge(@Body() body: { walletAddress?: unknown }) {
    return this.authService.createChallenge(body ?? {});
  }

  @Post('verify')
  @HttpCode(200)
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

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    this.sessions.clearAuthCookies(response);
    return { ok: true };
  }
}
