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

`pnpm test`, `pnpm typecheck` and `pnpm lint` check the code.

## Sources

- The main repository's `docs/manifest.yaml` (schema 2), read from each snapshot: the sections
  and their groups, with titles and summaries in each language; which files are published, with
  their group and order, title, language, translation group, route, status, and release tag and
  date. The files it lists hold all text, including the Roadmap.
- This repository: layout and components from the Figma file's Docs page, interface text
  (`lib/i18n.ts`), and `site.config.ts` (published refs, their edit branches, language names).

## How the site reads the repository

- **One snapshot per build.** Every version is pinned to one commit in `.cache/sources.json`;
  HTML, Markdown, search indexes and `llms.txt` all come from that commit. A branch is resolved
  when the site is built, a tag is fixed. Only a snapshot with `docs/manifest.yaml` can be
  published, so `v0.6.9` and earlier are not.
- **Versions are configuration.** Each entry in `site.config.ts` `versions` is one version of
  the docs, built from its own ref; adding a version adds an entry, not a branch of this site.
  The first entry, `v0.7.0`, reads AlphaAvatar's `dev/v0.7.0` branch.
- **Sections.** The header shows the manifest's sections (Guide, Development, Reference, Updates).
  Every page belongs to one: a document by its group, a section's entry page and a release index
  by their own. The page's section is current in the header, and the rail shows only that
  section's tree: groups, their documents, then their own groups, each level 16px further in. On
  entering a page its groups open; others stay as the reader left them in that section, version
  and language for the session. Tablet and mobile show the sections as tabs and in the drawer,
  which can switch section. Previous and next stay within the section.
- **Generated pages.** Each section has an entry page at `/{section}` (one card per group, with
  its summary and first page); a group whose documents are all release notes has a release index
  at `/{group}`. Ordinary groups have no page of their own.
- **Home page.** `/{lang}/{version}/` is the site's own page, not a document: an introduction, the
  latest release, three directions, two featured documents and resources (`lib/home.ts`). Its
  HTML and `index.md` come from one model whose entries name manifest sections, groups and
  documents; a missing one stops the build. No document may take the route `/`. The repository's
  README is GitHub's front page, not a page of this site: the manifest keeps it internal, and links
  to it lead to GitHub at the snapshot commit.
- **URLs.** Pages at `/{lang}/{version}/{route}/`; the Markdown source at
  `/{lang}/{version}/{route}.md`, the home page's at `index.md`, an HTML document at `.html`;
  search at `/{lang}/{version}/search.json` (each record names its document and section);
  `llms.txt` per version and language, by section and group, and at `/llms.txt`;
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
- **Languages and anchors.** Switching language keeps the document, its query (the Roadmap's
  filters) and its place: an anchor maps to the same heading in the other language's file.
- **Redirects.** `vercel.json`, which the host reads before the build, redirects `/` (temporarily)
  to the first version's home in the default language, and the retired `/get-started/` and
  `/architecture/` to `/guide/` and `/reference/`, keeping language and version; a test keeps it
  in step with `site.config.ts`.
- **Versions.** Switching version keeps the document (by translation group or id); if the target
  version does not publish it, the reader stays on the current page and is told.
- **Roadmap.** The page of a `type: roadmap` document reads its milestones, items and areas from
  the same parse as its other outputs, by the rules of the Roadmap's own "Format" section
  (`lib/roadmap.ts`). It shows one view at a time (`components/timeline.tsx`):
  - the timeline: a compact card per milestone (title, summary bullet, release state and date,
    item counts), grouped and ordered as the document groups them, items listed on expanding;
  - results: the items meeting three independent filters, combined (target version, category
    from the Areas table, status); choices come from the snapshot, and a draft changes nothing
    until applied;
  - a milestone's full plan: its section as written, chosen by the URL's anchor (the source's
    own anchors, so links into the Roadmap open the right plan);
  - an item's details, over the others.
  Filters, expanded milestones and the open item live in the URL (`lib/roadmap-view.ts`);
  leaving the timeline for details or a plan keeps its scroll position and focus to come back
  to, by the back button or the browser's. Every anchor the source defines stays on the page; a
  row or milestone that does not follow the format stops the build. Without JavaScript every
  milestone, item and plan is shown. Its `.md` output and search text are those of any document.
- **Code blocks.** A block's kind comes from what the source says it is, never from its words:
  ```` ```terminal NAME ```` shows recording NAME of the repository's `docs/cli/cli-output.json`
  in its recorded colors (the data's palette for 4-bit codes, 256-color and RGB codes as recorded;
  `lib/terminal.ts`), and must hold the text it showed; a language the site reads (Bash, YAML,
  JSON, Python, `.env`, INI, TOML) is colored by its grammar (`lib/highlight.ts`); anything else,
  an unknown language too, is plain text, labeled so. Copy takes the whole text, hidden preview
  lines too, never the toolbar or escape codes; a failure says what there is to do: a code
  block's code is selected for copying by hand, and its hint says so only while it is. A long
  block previews 320 px (240 px on a phone) until expanded; only the code scrolls sideways.
- **Diagrams.** A ```` ```mermaid ```` block is drawn in the browser; the HTML keeps the code
  block, which is what a reader without JavaScript sees, and Mermaid is loaded only by pages
  that hold a diagram.
- **Editing.** "Edit source" opens the file on the version's `editRef` (for v0.7.0,
  `dev/v0.7.0`); "View source" stays at the snapshot's commit. Published snapshots are never
  edited.
