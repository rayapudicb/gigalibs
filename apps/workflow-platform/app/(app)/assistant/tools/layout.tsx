import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// An in-memory toggle is not an authorized tool policy.
export default function ToolsUnavailable(_props: { children: ReactNode }) {
  notFound();
}
