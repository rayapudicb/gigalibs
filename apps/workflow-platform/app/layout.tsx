import type { Metadata } from 'next'
import './globals.css'
import '@xyflow/react/dist/style.css'

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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                darkMode: 'class',
                theme: {
                  extend: {
                    colors: {
                      gray: {
                        950: '#09090f',
                        900: '#11111b',
                        850: '#161624',
                        800: '#1f1f33',
                        700: '#2d2d48',
                      },
                      brand: {
                        50: '#eef2ff',
                        500: '#6366f1',
                        600: '#4f46e5',
                        700: '#4338ca',
                      }
                    }
                  }
                }
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased selection:bg-indigo-600 selection:text-white">
        {children}
      </body>
    </html>
  )
}
