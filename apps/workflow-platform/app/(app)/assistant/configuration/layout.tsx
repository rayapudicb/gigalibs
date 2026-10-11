import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// Client-only save and connection-test controls previously reported success without a server effect.
export default function ConfigurationUnavailable(_props: { children: ReactNode }) {
  notFound();
}
