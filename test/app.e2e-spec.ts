import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './../src/app.controller';
import { AppModule } from './../src/app.module';

describe('AppModule integration', () => {
  let appController: AppController;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appController = moduleFixture.get(AppController);
  });

  it('returns backend status', () => {
    expect(appController.getStatus()).toEqual({
      service: 'hypertron-core-backend',
      status: 'ok',
    });
  });
});
