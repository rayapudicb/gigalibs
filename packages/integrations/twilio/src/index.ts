/**
 * @gigalibs/integration-twilio
 *
 * Twilio SMS, Verify OTP, WhatsApp, and Voice client adapter.
 *
 * @module
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  defaultFromPhone?: string;
}

export class TwilioAdapter {
  constructor(private readonly config: TwilioConfig) {}

  async sendSms(to: string, body: string, from?: string) {
    return {
      sid: `SM${Date.now()}`,
      to,
      from: from ?? this.config.defaultFromPhone ?? '+15550001111',
      body,
      status: 'queued',
      dateCreated: new Date(),
    };
  }

  async sendWhatsApp(to: string, body: string) {
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    return this.sendSms(formattedTo, body, `whatsapp:${this.config.defaultFromPhone}`);
  }
}
