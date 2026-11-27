import type { HomeLink, HomeModel } from '@/lib/home'

// The home page (Figma "Docs / … / Overview"): introduction, the latest release, three
// directions, two featured articles and the resource band, from lib/home.ts.

const Arrow = () => (
  <span className="home-arrow" aria-hidden="true">
    →
  </span>
)

const Icon = ({ name }: { name?: string }) => (name ? <img src={`/icons/${name}.svg`} width={24} height={24} alt="" /> : null)

const external = (l: { external?: boolean }) => (l.external ? { rel: 'noopener' } : {})

function Direction({ link }: { link: HomeLink }) {
  return (
    <a className="home-direction" href={link.href}>
      <Icon name={link.icon} />
      <h2>{link.title}</h2>
      <p>{link.text}</p>
      <span className="home-more">
        {link.action}
        <Arrow />
      </span>
    </a>
  )
}

export function Home({ model: m }: { model: HomeModel }) {
  return (
    <div className="home">
      <section className="home-intro">
        <p className="home-eyebrow">{m.eyebrow}</p>
        <h1>{m.title}</h1>
        <p className="home-lead">{m.lead}</p>
        <div className="home-actions">
          {m.actions.map((a) => (
            <a key={a.href} className={a.primary ? 'button primary' : 'button'} href={a.href}>
              {a.label}
              {a.primary && <Arrow />}
            </a>
          ))}
        </div>
      </section>

      {m.release && (
        <section className="home-release" aria-label={m.release.title}>
          <p className="home-release-title">{m.release.title}</p>
          <p className="home-release-date">{m.release.published}</p>
          <a className="button" href={m.release.href}>
            {m.release.action}
            <Arrow />
          </a>
        </section>
      )}

      <nav className="home-directions" aria-label={m.title}>
        {m.directions.map((d) => (
          <Direction key={d.href} link={d} />
        ))}
      </nav>

      <section className="home-featured">
        <h2>{m.featuredTitle}</h2>
        <div className="home-featured-list">
          {m.featured.map((f) => (
            <a key={f.href} className="home-feature" href={f.href}>
              <div className="home-preview">
                <p>{f.preview.kicker}</p>
                <code>{f.preview.code}</code>
                {f.preview.columns && (
                  <div className="home-preview-columns">
                    {f.preview.columns.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                )}
                <p>{f.preview.text}</p>
                {f.original && <p>{f.original}</p>}
              </div>
              <div className="home-feature-copy">
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <span className="home-more">
                  {f.action}
                  <Arrow />
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="home-resources" aria-labelledby="home-resources">
        <h2 id="home-resources" className="sr-only">
          {m.resourcesTitle}
        </h2>
        <ul>
          {m.resources.map((r) => (
            <li key={r.href}>
              <a href={r.href} {...external(r)}>
                <Icon name={r.icon} />
                <span className="home-resource-copy">
                  <span className="home-resource-title">{r.title}</span>
                  <span>{r.text}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <footer className="home-footer">
        <span>{m.footer[0]}</span>
        <span>{m.footer[1]}</span>
      </footer>
    </div>
  )
}
