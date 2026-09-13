import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const customerCursorSchema = z.object({ n: z.string().min(1).max(200), i: z.uuid() }).strict();
const invoiceCursorSchema = z.object({ u: z.iso.datetime({ offset: true }), i: z.uuid() }).strict();

export type CustomerCursor = z.infer<typeof customerCursorSchema>;
export type InvoiceCursor = z.infer<typeof invoiceCursorSchema>;

export function encodeCursor(value: CustomerCursor | InvoiceCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCustomerCursor(raw: string | undefined): CustomerCursor | undefined {
  return decode(raw, customerCursorSchema);
}

export function decodeInvoiceCursor(raw: string | undefined): InvoiceCursor | undefined {
  return decode(raw, invoiceCursorSchema);
}

function decode<T>(raw: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (raw === undefined) return undefined;
  if (raw.length < 1 || raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw invalidCursor();
  try {
    return schema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw invalidCursor();
  }
}

function invalidCursor(): BadRequestException {
  return new BadRequestException('Cursor is invalid or expired.');
}
