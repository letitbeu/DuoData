import type { Metadata } from 'next'
import AutoRefresh from './auto-refresh'
import './globals.css'

export const metadata: Metadata = {
  title: 'DuoData — TradFi on Crypto Exchanges',
  description: 'Market intelligence for traditional assets traded on crypto exchanges.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AutoRefresh />
        {children}
      </body>
    </html>
  )
}
