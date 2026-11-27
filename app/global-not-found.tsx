import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { site } from '@/site.config'
import { NotFound } from '@/components/not-found'
import { pageHref, versions } from '@/lib/site'
import './styles.css'

export const metadata = { title: `Not found · ${site.name}` }

export default function GlobalNotFound() {
  const known = versions().map((v) => ({ id: v.id, label: v.label, locales: v.locales.map((l) => ({ id: l, label: site.locales[l] ?? l, home: pageHref(v.id, l, '/') })) }))
  const first = versions()[0]
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <NotFound known={known} fallbackHome={pageHref(first.id, site.defaultLocale, '/')} />
      </body>
    </html>
  )
}
