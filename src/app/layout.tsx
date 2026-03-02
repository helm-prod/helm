import type { Metadata } from 'next'
import './globals.css'
import { AuthSessionListener } from '@/components/auth-session-listener'

export const metadata: Metadata = {
  title: 'HELM',
  description: 'Hub for Ecommerce Logistics & Management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <AuthSessionListener />
        {children}
      </body>
    </html>
  )
}
