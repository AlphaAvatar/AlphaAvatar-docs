import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import type { NextConfig } from 'next'

// A static site: every page, Markdown file and index is generated at build time from pinned
// source snapshots (see README.md).
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: { globalNotFound: true },
  // `next dev` would otherwise write its own AGENTS.md into the repository.
  agentRules: false,
}

// `next dev` serves a public file only at its own name, while the host serves a directory's
// index.html at the directory: the address of an HTML document's own file (lib/site.ts sourceHref).
// An export has no rewrites (`next dev` warns that this one will not work in one), so only the
// development server has it.
export default function nextConfig(phase: string): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER) return config
  return { ...config, rewrites: async () => [{ source: '/_html/:path*/', destination: '/_html/:path*/index.html' }] }
}
