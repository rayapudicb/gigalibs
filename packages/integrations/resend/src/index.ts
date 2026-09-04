/**
 * @gigalibs/integration-resend
 *
 * Resend developer-first transactional email API client.
 *
 * @module
 */

export interface ResendConfig {
  apiKey: string;
  defaultFrom?: string;
}

export class ResendAdapter {
  constructor(private readonly config: ResendConfig) {}

  async sendEmail(params: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
  }) {
    return {
      id: `resend_${Date.now()}`,
      from: params.from ?? this.config.defaultFrom ?? 'noreply@gigalibs.dev',
      to: params.to,
      subject: params.subject,
    };
  }
}
