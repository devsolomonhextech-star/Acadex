# Student subscriptions

Acadex subscriptions reserve student places at **GH₵3 per place each month**. The school administrator chooses the capacity in **Settings → Billing & subscription**; the displayed monthly amount is capacity × GH₵3. New and reactivated active students, including bulk imports, are checked against the school's paid capacity by the API. Renewals are initiated by a school administrator; Acadex does not automatically charge a saved payment method.

The payment flow uses Paystack hosted checkout. The API initializes payments in Ghana cedis and only activates seats after server-side verification of the transaction reference, successful status, currency, and exact amount. A signed `charge.success` webhook at `/api/v1/subscription/webhook` also activates payments if the payer does not return to the app. Repeated callbacks and webhooks are idempotent.

## Configure payments

1. Add a Paystack **secret** key to the API environment as `PAYSTACK_SECRET_KEY`. Use a test secret key in development and keep it out of frontend variables and source control.
2. Set `FRONTEND_URL` to the web app's public base URL. The checkout callback returns to `/settings?tab=billing`.
3. In the Paystack dashboard, register `https://<api-host>/api/v1/subscription/webhook` as the webhook URL.
4. Apply database migrations through Alembic before starting the new API version.

When the secret key is absent, the billing screen stays readable and explains that checkout is not configured; it will not simulate a successful payment.
