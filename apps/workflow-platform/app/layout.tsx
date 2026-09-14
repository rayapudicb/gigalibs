import type { Metadata } from 'next'
import './output.css'
import './globals.css'
import '@xyflow/react/dist/style.css'

import { Toaster } from '@medusajs/ui'

export const metadata: Metadata = {
  title: 'WorkflowOS — Enterprise AI Workflow Platform',
  description: 'Visual DAG Workflow Canvas & Deterministic Execution Engine',
}
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-ui-bg-subtle text-ui-fg-base antialiased selection:bg-ui-bg-interactive selection:text-white">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
