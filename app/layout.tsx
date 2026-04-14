import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: 'AlphaAvatar Docs',
  description: 'Documentation for AlphaAvatar'
}

const navbar = (
  <Navbar
    logo={<b>AlphaAvatar Docs</b>}
    projectLink="https://github.com/AlphaAvatar/AlphaAvatar"
  />
)
const footer = <Footer>© 2026 AlphaAvatar</Footer>

export default async function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/AlphaAvatar/AlphaAvatar-docs/tree/main"
          sidebar={{ defaultMenuCollapseLevel: 1 }}
          editLink="Edit this page on GitHub"
          feedback={{ content: 'Give feedback' }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
