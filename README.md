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
- **Home page.** `/{lang}/{version}/` is the site's own page, not a document: an introduction, the
  latest release, three directions, two featured documents and resources (`lib/home.ts`). Its
  HTML and `index.md` come from one model whose entries name manifest sections and documents; a
  missing one stops the build. No document may take the route `/` (README is at `/overview`).
- **URLs.** Pages at `/{lang}/{version}/{route}/`; the Markdown source at
  `/{lang}/{version}/{route}.md`, the home page's at `index.md`, an HTML document at `.html`;
  search at `/{lang}/{version}/search.json`; `llms.txt` per version and language and at `/llms.txt`;
  repository images at `/_assets/{sha12}/{path}`.
- **Links.** A link to a published document leads to its page in the language being read (in the
  `.md` output, to its `.md` in the document's own language), whatever file it names; only a link
  between two languages of one document (same `translation_group`), its language switch, keeps the
  language it names. Where the page shown is another language of the file named, the anchor is
  the heading at the same position, since translations keep their headings in order (the source
  repository checks this). A link to an image leads to the copied file; any other repository
  path, to GitHub at the snapshot commit. The `.md` output is the source text with only link
  targets changed. A link or anchor that resolves to nothing stops the
  build.
- **Languages.** Documents in one `translation_group` are one page. Where a document has no
  version in the chosen language, its page shows the original and says so; it never shows another
  document or version. Interface text follows the chosen language.
- **Versions.** Switching version keeps the document (by translation group or id); if the target
  version does not publish it, the reader stays on the current page and is told.
- **Roadmap.** The page of a `type: roadmap` document reads its milestones and items from the
  same parse as its other outputs, by the rules of the Roadmap's own "Format" section
  (`lib/roadmap.ts`): a timeline in the Timeline table's order, each milestone's details and items
  as the source writes them, then the rest of the document unchanged. Every anchor the source
  defines stays on the page. A row or milestone that does not follow the format stops the build.
  Filters, expanded milestones and the open item live in the URL; without JavaScript every
  milestone and item is shown. Its `.md` output and search text are those of any document.
- **Diagrams.** A ```` ```mermaid ```` block is drawn in the browser; the HTML keeps the code
  block, which is what a reader without JavaScript sees, and Mermaid is loaded only by pages
  that hold a diagram.
- **Editing** goes to the development branch; published snapshots are never edited.
