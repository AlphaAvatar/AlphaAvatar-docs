import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { ReactNode } from 'react'
import { site } from '@/site.config'
import { allLocales } from '@/lib/site'
import '../styles.css'

export const dynamicParams = false

export const generateStaticParams = () => allLocales().map((locale) => ({ locale }))

export const metadata = { metadataBase: new URL(site.url) }

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
