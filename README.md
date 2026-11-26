# AlphaAvatar Docs

The documentation site of [AlphaAvatar](https://github.com/AlphaAvatar/AlphaAvatar), for
https://docs.alphaavatar.io. Every page is generated from the main repository; this repository
holds no documentation text.

## Build

```bash
pnpm install
pnpm build                                  # the static site is written to out/
ALPHAAVATAR_SOURCE=../AlphaAvatar pnpm dev  # read a local clone instead of GitHub
```

| Step | Does | Writes |
| --- | --- | --- |
| `pnpm sources` | Resolves each version in `site.config.ts` to one commit and extracts it | `.cache/sources.json`, `.cache/snapshots/<sha>/` |
| `pnpm generate` | Markdown and HTML sources, repository images, search indexes, `llms.txt`, sitemap | `public/` (ignored) |
| `next build` | One HTML page per published document, language and version | `out/` |

`pnpm typecheck` and `pnpm lint` check the code.

## Sources

- The main repository's `docs/manifest.yaml`, read from each snapshot: which files are published,
  their titles, sections and order, language, translation groups, routes, status, and release
  tags and dates. The files it lists hold all text, including the Roadmap.
- This repository: layout and components from the Figma file's Docs page, interface text
  (`lib/i18n.ts`), and `site.config.ts` (published refs, header sections, language names).

## How the site reads the repository

- **One snapshot per build.** Every version is pinned to one commit in `.cache/sources.json`;
  HTML, Markdown, search indexes and `llms.txt` all come from that commit. A branch is resolved
  when the site is built, a tag is fixed. Only a snapshot with `docs/manifest.yaml` can be
  published, so `v0.6.9` and earlier are not.
- **Versions are configuration.** Each entry in `site.config.ts` `versions` is one version of
  the docs, built from its own ref; adding a version adds an entry, not a branch of this site.
  The first entry, `v0.7.0`, reads AlphaAvatar's `dev/v0.7.0` branch.
- **URLs.** Pages at `/{lang}/{version}/{route}/`; the Markdown source at
  `/{lang}/{version}/{route}.md` (`index.md` for `/`), an HTML document at `.html`; search at
  `/{lang}/{version}/search.json`; `llms.txt` per version and language and at `/llms.txt`;
  repository images at `/_assets/{sha12}/{path}`.
- **Links.** A link to a published document leads to its page in the language being read (in the
  `.md` output, to its `.md` in the document's own language); a link to an image, to the copied
  file; any other repository path, to GitHub at the snapshot commit. The `.md` output is the
  source text with only link targets changed. A link or anchor that resolves to nothing stops the
  build.
- **Languages.** Documents in one `translation_group` are one page. Where a document has no
  version in the chosen language, its page shows the original and says so; it never shows another
  document or version. Interface text follows the chosen language.
- **Versions.** Switching version keeps the document (by translation group or id); if the target
  version does not publish it, the reader stays on the current page and is told.
- **Editing** goes to the development branch; published snapshots are never edited.
