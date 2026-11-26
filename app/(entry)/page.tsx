import { site } from '@/site.config'
import { pageHref, versions } from '@/lib/site'

// `/` leads to the first configured version in the default language.
export default function Entry() {
  const v = versions()[0]
  const href = pageHref(v.id, v.locales.includes(site.defaultLocale) ? site.defaultLocale : v.locales[0], '/')
  return (
    <>
      <title>{site.name}</title>
      <meta httpEquiv="refresh" content={`0; url=${href}`} />
      <link rel="canonical" href={href} />
      <a href={href} style={{ color: '#60a5fa' }}>
        {site.name}
      </a>
    </>
  )
}
