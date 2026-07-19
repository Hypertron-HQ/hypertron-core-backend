import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './../src/app.controller';
import { AppModule } from './../src/app.module';
import { PaymentLinksController } from './../src/payment-links/payment-links.controller';

describe('AppModule integration', () => {
  let appController: AppController;
  let paymentLinksController: PaymentLinksController;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appController = moduleFixture.get(AppController);
    paymentLinksController = moduleFixture.get(PaymentLinksController);
  });

  it('returns backend status', () => {
    expect(appController.getStatus()).toEqual({
      service: 'hypertron-core-backend',
      status: 'ok',
    });
  });

  it('creates and fetches a payment link', () => {
    const created = paymentLinksController.create({
      amount: '100',
      memo: 'Invoice 001',
    });

    expect(created.id).toMatch(/^pl_/);
    expect(created.url).toContain(`/pay/${created.id}`);
    expect(created.url).toContain('amount=100');
    expect(created.url).toContain('memo=Invoice%20001');

    expect(paymentLinksController.findOne(created.id)).toEqual({
      amount: '100',
      memo: 'Invoice 001',
      createdAt: expect.any(String),
    });
  });

  it('rejects a payment link without amount', () => {
    expect(() => paymentLinksController.create({ memo: 'Missing amount' })).toThrow(BadRequestException);
  });

  it('throws for an unknown payment link id', () => {
    expect(() => paymentLinksController.findOne('pl_missing')).toThrow(NotFoundException);
  });
});
