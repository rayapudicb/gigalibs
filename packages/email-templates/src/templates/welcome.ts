import { renderBaseLayout } from '../renderer.js';

export function renderWelcomeEmail(name: string, appUrl: string): { subject: string; html: string } {
  const subject = `Welcome to GigaLibs, ${name}!`;
  const content = `
    <h2>Welcome aboard, ${name}! 🎉</h2>
    <p>We're thrilled to have you. Your account is ready, and you can now get started exploring your workspace.</p>
    <p><a href="${appUrl}" class="button">Go to Dashboard</a></p>
    <p>If you have any questions, feel free to reply directly to this email.</p>
  `;
  return { subject, html: renderBaseLayout(subject, content) };
}
