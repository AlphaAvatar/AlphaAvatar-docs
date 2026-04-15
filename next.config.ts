import nextra from 'nextra'

const withNextra = nextra({})

const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/introduction/getting-started',
        permanent: false
      }
    ]
  }
}

export default withNextra(nextConfig)
