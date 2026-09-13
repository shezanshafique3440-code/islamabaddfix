import { env } from '../env';
import type { DeliveryTarget, NotificationPayload } from './types';

/**
 * Email rendering. Plain, table-free HTML with an inline-styled button — the
 * layout has to survive Gmail, Outlook and the webmail clients people here
 * actually use, so no CSS classes and no external assets.
 */
export function renderEmail(
  target: DeliveryTarget,
  payload: NotificationPayload,
): { subject: string; html: string; text: string } {
  const url = payload.href ? new URL(payload.href, env.NEXT_PUBLIC_APP_URL).toString() : undefined;
  const firstName = target.fullName.split(/\s+/)[0] ?? 'there';

  const text = [
    `Hello ${firstName},`,
    '',
    payload.body,
    url ? `\nDetails: ${url}` : '',
    '',
    '—',
    'Islamabad Fix',
    'Tell us the problem. We will handle the rest.',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(payload.title)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f7f8f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#242b2e;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #eef0f1;border-radius:14px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #eef0f1;">
      <span style="font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#0b6b51;">Islamabad Fix</span>
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;font-weight:650;letter-spacing:-0.015em;">${escapeHtml(payload.title)}</h1>
      <p style="margin:0 0 8px;font-size:14px;color:#57646b;">Hello ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${escapeHtml(payload.body)}</p>
      ${
        url
          ? `<a href="${escapeHtml(url)}" style="display:inline-block;background:#0b6b51;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:600;">View details</a>`
          : ''
      }
    </div>
    <div style="padding:16px 24px;border-top:1px solid #eef0f1;background:#f7f8f8;">
      <p style="margin:0;font-size:12px;color:#8d9aa1;">Tell us the problem. We will handle the rest.</p>
    </div>
  </div>
</body></html>`;

  return { subject: payload.title, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
