import { renderBaseLayout } from '../renderer.js';

export function renderPasswordResetEmail(resetUrl: string, expiryMinutes = 30): { subject: string; html: string } {
  const subject = 'Reset your password';
  const content = `
    <h2>Password Reset Request</h2>
    <p>We received a request to reset your password. Click the button below to choose a new password:</p>
    <p><a href="${resetUrl}" class="button">Reset Password</a></p>
    <p style="color: #6b7280; font-size: 14px;">This link will expire in ${expiryMinutes} minutes. If you did not request a password reset, you can safely ignore this email.</p>
  `;
  return { subject, html: renderBaseLayout(subject, content) };
}
