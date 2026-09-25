// A deploy that's missing its two environment variables used to render a blank
// white page with the real reason buried in the browser console — which is no
// use to anyone looking at the site, and easy to mistake for a broken build.
//
// Styles are inline on purpose: this has to render even if something about the
// app's own setup is wrong.
export default function NotConfigured() {
  return (
    <div style={{ font: '15px/1.6 system-ui, sans-serif', maxWidth: 520, margin: '15vh auto', padding: '0 24px', color: '#1c2536' }}>
      <h1 style={{ font: '600 22px/1.3 Georgia, serif', margin: '0 0 12px' }}>This deploy isn&rsquo;t configured yet</h1>
      <p style={{ margin: '0 0 12px', color: '#5a6478' }}>
        The site built, but it wasn&rsquo;t given the two settings it needs to reach its database:
      </p>
      <pre style={{ background: '#f4f6fb', border: '1px solid #cfd5e2', borderRadius: 8, padding: '12px 14px', fontSize: 13, overflowX: 'auto' }}>
        VITE_SUPABASE_URL{'\n'}VITE_SUPABASE_ANON_KEY
      </pre>
      <p style={{ margin: '12px 0 0', color: '#5a6478' }}>
        Add both in the hosting project&rsquo;s environment variables, then redeploy. They have to be
        set <em>before</em> the build runs — the values are baked into the files at build time, so
        adding them without a fresh deploy changes nothing.
      </p>
    </div>
  )
}
