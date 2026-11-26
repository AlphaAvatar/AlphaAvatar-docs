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

export default config
