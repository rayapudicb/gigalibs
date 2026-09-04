import { renderBaseLayout } from '../renderer.js';

export function renderOrgInviteEmail(
  orgName: string,
  inviterName: string,
  inviteUrl: string,
): { subject: string; html: string } {
  const subject = `${inviterName} invited you to join ${orgName}`;
  const content = `
    <h2>You've been invited! 🚀</h2>
    <p><strong>${inviterName}</strong> has invited you to join their team workspace <strong>${orgName}</strong> on GigaLibs.</p>
    <p><a href="${inviteUrl}" class="button">Accept Invitation</a></p>
    <p style="color: #6b7280; font-size: 14px;">If you weren't expecting this invitation, you can ignore this email.</p>
  `;
  return { subject, html: renderBaseLayout(subject, content) };
}
