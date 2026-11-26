import type { ReactNode } from 'react'

export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#02040b' }}>{children}</body>
    </html>
  )
}
