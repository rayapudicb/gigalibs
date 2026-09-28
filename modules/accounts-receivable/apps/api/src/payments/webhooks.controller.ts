import crypto from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

interface RawBodyRequest {
  rawBody?: Buffer;
}

@Controller('v1/payments/webhooks')
export class WebhooksController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post(':provider')
  async handleWebhook(
    @Param('provider') rawProvider: string,
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: any,
    @Req() req: RawBodyRequest,
  ): Promise<{ received: boolean; status: string }> {
    const provider = rawProvider.toUpperCase();
    if (provider !== 'STRIPE' && provider !== 'ADYEN') {
      throw new BadRequestException(`Unsupported payment webhook provider: ${rawProvider}`);
    }

    const rawPayload = typeof body === 'string'
      ? body
      : (req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body ?? {}));

    const correlationId = headers['x-correlation-id'] ?? crypto.randomUUID();

    if (provider === 'STRIPE') {
      const signatureHeader = headers['stripe-signature'];
      if (!signatureHeader) {
        throw new UnauthorizedException('Missing Stripe-Signature header');
      }

      const secret = process.env['STRIPE_WEBHOOK_SECRET'] ?? 'whsec_local_development_secret';
      const isValid = verifyStripeSignature(rawPayload, signatureHeader, secret);
      if (!isValid) {
        throw new UnauthorizedException('Invalid Stripe webhook signature');
      }

      const event = typeof body === 'object' && body !== null ? body : JSON.parse(rawPayload);
      const eventType = event.type ?? '';
      const eventId = event.id ?? `evt_${crypto.randomUUID()}`;

      // Handle checkout.session.completed and payment_intent.succeeded
      if (eventType === 'checkout.session.completed' || eventType === 'payment_intent.succeeded') {
        const obj = event.data?.object ?? {};
        const metadata = obj.metadata ?? {};
        const tenantId = metadata.tenantId ?? obj.client_reference_id;
        const invoiceId = metadata.invoiceId;
        const amountMinor = Number(obj.amount_total ?? obj.amount_received ?? obj.amount ?? 0);
        const currency = String(obj.currency ?? 'USD').toUpperCase();
        const paymentReference = obj.id ?? eventId;

        if (!tenantId || !invoiceId || amountMinor <= 0) {
          return { received: true, status: 'IGNORED_NO_INVOICE_METADATA' };
        }

        const result = await this.payments.processWebhookPayment({
          tenantId,
          provider: 'STRIPE',
          eventId,
          eventType,
          payload: event,
          invoiceId,
          amountMinor,
          currency,
          paymentReference,
          correlationId,
        });

        return { received: true, status: result.status };
      }

      return { received: true, status: 'IGNORED_UNHANDLED_EVENT_TYPE' };
    }

    // ADYEN Webhook Handler
    const signatureHeader = headers['adyen-signature'] ?? headers['hmac-signature'];
    if (!signatureHeader) {
      throw new UnauthorizedException('Missing Adyen signature header');
    }

    const secret = process.env['ADYEN_HMAC_KEY'] ?? 'adyen_local_development_secret';
    const isValid = verifyAdyenSignature(rawPayload, signatureHeader, secret);
    if (!isValid) {
      throw new UnauthorizedException('Invalid Adyen webhook signature');
    }

    const event = typeof body === 'object' && body !== null ? body : JSON.parse(rawPayload);
    const notificationItem = event.notificationItems?.[0]?.NotificationRequestItem ?? event;
    const eventType = notificationItem.eventCode ?? 'AUTHORISATION';
    const eventId = notificationItem.pspReference ?? `adyen_${crypto.randomUUID()}`;
    const additionalData = notificationItem.additionalData ?? {};
    const tenantId = additionalData.tenantId;
    const invoiceId = additionalData.invoiceId;
    const amountMinor = Number(notificationItem.amount?.value ?? 0);
    const currency = String(notificationItem.amount?.currency ?? 'USD').toUpperCase();

    if (!tenantId || !invoiceId || amountMinor <= 0 || notificationItem.success !== 'true') {
      return { received: true, status: 'IGNORED_OR_UNSUCCESSFUL' };
    }

    const result = await this.payments.processWebhookPayment({
      tenantId,
      provider: 'ADYEN',
      eventId,
      eventType,
      payload: event,
      invoiceId,
      amountMinor,
      currency,
      paymentReference: eventId,
      correlationId,
    });

    return { received: true, status: result.status };
  }
}

export function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const parts = header.split(',').map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
    } catch {
      return false;
    }
  });
}

export function verifyAdyenSignature(payload: string, header: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(header, 'hex'));
  } catch {
    return false;
  }
}
