import { PORTAL_PHOTO_MAX_BYTES } from '@gigalibs/contracts';

// WI-OI-140 M-REQ: browser helpers for the public request portal.

export type PortalAnswer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: string };

export async function portalPost<T>(action: 'context' | 'requests' | 'status', body: unknown): Promise<PortalAnswer<T>> {
  try {
    const response = await fetch(`/api/public/cmms-portal/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const value = (await response.json().catch(() => ({}))) as { code?: string };
    return response.ok ? { ok: true, value: value as T } : { ok: false, code: value.code ?? 'PORTAL_UNAVAILABLE' };
  } catch {
    return { ok: false, code: 'PORTAL_OFFLINE' };
  }
}

/** The capability in the URL fragment (never sent to a server by the browser). */
export function fragmentToken(): string | null {
  const token = typeof window === 'undefined' ? '' : decodeURIComponent(window.location.hash.slice(1));
  return token ? token : null;
}

const base64Bytes = (value: string) => Math.floor((value.length * 3) / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);

/** A camera photo made small enough to send: at most 1280 px on its long side, JPEG, at most 300 KB. */
export async function compressPhoto(file: File): Promise<{ contentType: 'image/jpeg'; base64: string } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('not an image'));
      element.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.75, 0.6, 0.45, 0.3]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      const base64 = data.slice(data.indexOf(',') + 1);
      if (base64Bytes(base64) <= PORTAL_PHOTO_MAX_BYTES) return { contentType: 'image/jpeg', base64 };
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const PORTAL_MESSAGES: Readonly<Record<string, string>> = {
  PORTAL_LINK_INVALID: 'This label is not valid any more. Tell the site team, or report the problem another way.',
  PORTAL_BUSY: 'Too many reports just now. Wait a few minutes and try again.',
  PORTAL_REQUEST_INVALID: 'Check what you entered and try again.',
  PORTAL_OFFLINE: 'No connection. Your report was not sent; try again.',
  PORTAL_UNAVAILABLE: 'The service is unavailable. Try again shortly.',
};
