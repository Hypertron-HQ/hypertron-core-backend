export type PaymentLinkRecord = {
  amount: string;
  memo: string | null;
  createdAt: string;
};

export type CreatePaymentLinkResponse = {
  id: string;
  url: string;
};
