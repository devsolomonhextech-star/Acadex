export type PaymentMethodId = "mtn" | "telecel" | "at" | "cards";

export type PaymentMethod = {
  id: PaymentMethodId;
  name: string;
  caption: string;
  detail: string;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "mtn",
    name: "MTN Mobile Money",
    caption: "Mobile money",
    detail: "Pay from your MTN wallet",
  },
  {
    id: "telecel",
    name: "Telecel Cash",
    caption: "Mobile money",
    detail: "Pay from your Telecel wallet",
  },
  {
    id: "at",
    name: "AT Money",
    caption: "Mobile money",
    detail: "Pay from your AT wallet",
  },
  {
    id: "cards",
    name: "Debit & credit cards",
    caption: "Where supported",
    detail: "Visa & Mastercard · Where supported by your school",
  },
];

export function paymentMethodById(id: PaymentMethodId) {
  return (
    PAYMENT_METHODS.find((method) => method.id === id) ?? PAYMENT_METHODS[0]
  );
}
