import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = [
    ...(process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    process.env.FRONTEND_URL ?? '',
    process.env.APP_URL ?? '',
  ]
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  app.enableCors({
    credentials: true,
    origin: [...new Set(allowedOrigins)],
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
