import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { CreatePaymentLinkResponse, PaymentLinkRecord } from './payment-links.types';

@Injectable()
export class PaymentLinksService {
  private readonly paymentLinks = new Map<string, PaymentLinkRecord>();

  create(dto: CreatePaymentLinkDto): CreatePaymentLinkResponse {
    const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const memo = dto.memo?.trim() ? dto.memo.trim() : null;
    const baseUrl = process.env.APP_URL?.trim() || 'http://localhost:3000';
    const amount = dto.amount!.trim();
    const url = `${baseUrl}/pay/${id}?amount=${encodeURIComponent(amount)}${
      memo ? `&memo=${encodeURIComponent(memo)}` : ''
    }`;

    this.paymentLinks.set(id, {
      amount,
      memo,
      createdAt: new Date().toISOString(),
    });

    return { id, url };
  }

  findOne(id: string): PaymentLinkRecord {
    const paymentLink = this.paymentLinks.get(id);
    if (!paymentLink) {
      throw new NotFoundException({ error: 'not found' });
    }

    return paymentLink;
  }
}
