import React from 'react';

/**
 * WhatsApp & SMS-style delivery ticks for outbound messages.
 * queued → clock · sent → ✓ · delivered → ✓✓ · read → ✓✓ (blue)
 */
export function DeliveryReceiptTicks({
  status,
  tone = 'onGreen',
}: {
  status?: string | null;
  /** onGreen = outbound green bubble; onLight = white/gray bubble; failed = amber */
  tone?: 'onGreen' | 'onLight' | 'failed';
}) {
  if (!status || status === 'failed') return null;

  const normalized = status.toLowerCase();
  const isRead = normalized === 'read';
  const isDelivered = normalized === 'delivered' || isRead;
  const isQueued = normalized === 'queued';
  const showDouble = isDelivered || normalized === 'simulated';

  const colorClass =
    tone === 'failed'
      ? 'text-amber-500'
      : isRead
        ? tone === 'onGreen'
          ? 'text-sky-200'
          : 'text-sky-500'
        : tone === 'onGreen'
          ? 'text-green-100'
          : 'text-gray-400';

  if (isQueued) {
    return (
      <span className={`inline-flex items-center ${colorClass}`} title="Queued" aria-label="Queued">
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  const title = isRead
    ? 'Read'
    : isDelivered
      ? 'Delivered'
      : normalized === 'simulated'
        ? 'Simulated'
        : 'Sent';

  return (
    <span
      className={`inline-flex items-center ${colorClass}`}
      title={title}
      aria-label={title}
    >
      {showDouble ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 18 12" fill="none" aria-hidden>
          <path
            d="M1.5 6.5L4.5 9.5L10.5 2.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 6.5L9.5 9.5L15.5 2.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 14 12" fill="none" aria-hidden>
          <path
            d="M1.5 6.5L4.5 9.5L11.5 2.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
