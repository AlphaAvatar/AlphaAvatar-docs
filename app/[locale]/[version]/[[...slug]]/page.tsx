import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { site } from '@/site.config'
import { DocArticle, Home, SectionIndex } from '@/components/article'
import { Shell } from '@/components/shell'
import { renderDocument } from '@/lib/markdown'
import { markdownHref, pageByKey, pageHref, pageOf, version, versions } from '@/lib/site'

type Params = { locale: string; version: string; slug?: string[] }

export const dynamicParams = false

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return versions().flatMap((v) =>
    (v.pages.get(params.locale) ?? []).map((p) => ({ version: v.id, slug: p.route === '/' ? [] : p.route.slice(1).split('/') })),
  )
}

function resolve({ locale, version: id, slug }: Params) {
  const v = version(id)
  const page = v && pageOf(v, locale, slug?.length ? `/${slug.map(decodeURIComponent).join('/')}` : '/')
  if (!v || !page) notFound()
  return { v, page }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { v, page } = resolve(await params)
  const title = page.kind === 'doc' ? (page.route === '/' ? site.name : `${page.doc.title} · ${site.name}`) : `${page.section.title} · ${site.name}`
  const languages = Object.fromEntries(v.locales.map((l) => [l, pageHref(v.id, l, pageByKey(v, l, page.key)!.route)]))
  return {
    title,
    alternates: {
      canonical: pageHref(v.id, page.locale, page.route),
      languages,
      ...(page.kind === 'doc' && page.doc.format !== 'html' && { types: { 'text/markdown': markdownHref(v.id, page.doc) } }),
    },
  }
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { v, page } = resolve(await params)
  if (page.kind === 'section') {
    return (
      <Shell v={v} page={page} entries={[]}>
        <SectionIndex v={v} page={page} />
      </Shell>
    )
  }
  if (page.route === '/') {
    return (
      <Shell v={v} page={page} entries={[]} wide>
        <Home v={v} page={page} />
      </Shell>
    )
  }
  const entries = page.doc.format === 'html' ? [] : renderDocument(v, page.doc, page.locale).headings
  return (
    <Shell v={v} page={page} entries={entries}>
      <DocArticle v={v} page={page} />
    </Shell>
  )
}
