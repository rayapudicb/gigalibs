import { renderBaseLayout } from '../renderer.js';

export function renderOtpEmail(code: string, expiryMinutes = 5): { subject: string; html: string } {
  const subject = `${code} is your verification code`;
  const content = `
    <h2>Your Verification Code</h2>
    <p>Use the following 6-digit code to complete your verification:</p>
    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; font-size: 28px; font-weight: 700; letter-spacing: 4px; text-align: center; margin: 24px 0; color: #1f2937;">
      ${code}
    </div>
    <p style="color: #6b7280; font-size: 14px;">This code will expire in ${expiryMinutes} minutes. If you did not request this, please ignore this email.</p>
  `;
  return { subject, html: renderBaseLayout(subject, content) };
}
