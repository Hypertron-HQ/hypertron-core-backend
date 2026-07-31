import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';
import { PrivyServerService } from './privy-server.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthSessionService, PrivyServerService],
  exports: [AuthService, AuthSessionService],
})
export class AuthModule {}
