export default {
  distDir: process.env.STUDIO_BUILD_DIR || '.next',
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  outputFileTracingExcludes: { '/*': ['./.env*', './.local/**/*', './.next-local/**/*', './test-results/**/*', './tests/**/*', './content/**/*', './modules/studio/**/*', './modules/__init__.py', './schemas/**/*', './private/studio/releases/*/source/**/*', './private/studio/releases/*/change.json'] },
  outputFileTracingIncludes: { '/': ['./private/studio/current.json', './private/studio/releases/*/manifest.json', './private/studio/releases/*/artifacts/collection.json'], '/reader/*': ['./private/reports/*.html'], '/library/*': ['./private/library/**/*'], '/bookshelf/*': ['./private/bookshelf/**/*'], '/national/*': ['./private/national/**/*', './private/studio/current.json', './private/studio/releases/*/manifest.json', './private/studio/releases/*/artifacts/national/**/*'], '/midterms/*': ['./private/midterms/current.json', './private/midterms/releases/*/manifest.json', './private/midterms/releases/*/index.html', './private/midterms/releases/*/data.json', './private/midterms/releases/*/assets/**/*', './private/midterms/releases/*/papers/**/*', './private/midterms/releases/*/*.csv'], '/search': ['./private/studio/current.json', './private/studio/releases/*/manifest.json', './private/studio/releases/*/artifacts/search.json'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }
    ] }];
  }
};
