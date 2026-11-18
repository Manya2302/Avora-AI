import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Avora — Private document intelligence',
  description: 'Encrypted document storage with search, compliance and contract review that runs on your own servers.',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: '"IBM Plex Sans", sans-serif',
              fontSize: '13.5px',
              borderRadius: '8px',
              background: '#0E0D0A',
              color: '#F7F5F0',
              padding: '10px 14px',
            },
            success: { iconTheme: { primary: '#4ADE80', secondary: '#0E0D0A' } },
            error:   { iconTheme: { primary: '#F87171', secondary: '#0E0D0A' } },
          }}
        />
      </body>
    </html>
  )
}
