import { Link } from 'react-router-dom'
import './landing.css'

// A small, honest sample of the real grid — same colours and same 0–4 scale
// the app uses, so the picture matches the product.
const DEMO = {
  categories: [
    { name: 'Operations', span: 2, tone: 0 },
    { name: 'Quality', span: 2, tone: 1 },
    { name: 'Leadership', span: 1, tone: 2 },
  ],
  skills: ['Scheduling', 'Inventory', 'Inspection', 'Root cause', 'Coaching'],
  people: [
    { name: 'Alex Kim', role: 'Shift lead', levels: [4, 3, 3, 2, 4] },
    { name: 'Jordan Lee', role: 'Technician', levels: [2, 4, 3, 3, 1] },
    { name: 'Morgan Patel', role: 'Coordinator', levels: [3, 2, null, 1, 2] },
    { name: 'Taylor Nguyen', role: 'Analyst', levels: [1, 3, 4, 4, 2] },
  ],
}

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'Enough to run a real team matrix.',
    features: [
      'Up to 25 people',
      '1 category',
      'Current and target levels',
      'Insights dashboard',
      'Invite your team',
    ],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Plus',
    price: '$5.99',
    cadence: 'per person / month',
    blurb: 'For when one category stops being enough.',
    features: ['Up to 100 people', 'Unlimited categories', 'Everything in Free'],
    cta: 'Start free',
    featured: true,
  },
  {
    name: 'Unlimited',
    price: '$9.99',
    cadence: 'per person / month',
    blurb: 'For larger or multi-site teams.',
    features: ['Unlimited people', 'Unlimited categories', 'Everything in Plus', 'Priority support'],
    cta: 'Start free',
    featured: false,
  },
]

function DemoGrid() {
  return (
    <div className="demo" aria-label="Example skill matrix">
      <div className="demo-scroll">
        <table className="demo-table">
          <thead>
            <tr>
              <th className="demo-corner" rowSpan={2}>
                Team member
              </th>
              {DEMO.categories.map((c) => (
                <th key={c.name} colSpan={c.span} className={`demo-band demo-band-${c.tone}`}>
                  {c.name}
                </th>
              ))}
            </tr>
            <tr>
              {DEMO.skills.map((s) => (
                <th key={s} className="demo-skill">
                  <span>{s}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO.people.map((p) => (
              <tr key={p.name}>
                <td className="demo-person">
                  <strong>{p.name}</strong>
                  <span>{p.role}</span>
                </td>
                {p.levels.map((lvl, i) => (
                  <td key={i} className="demo-cell">
                    <span className={`demo-badge lvl-${lvl ?? 'none'}`}>{lvl ?? '×'}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="demo-legend">
        <li><span className="demo-badge lvl-none">×</span> Not required</li>
        <li><span className="demo-badge lvl-1">1</span> No experience</li>
        <li><span className="demo-badge lvl-2">2</span> Beginner</li>
        <li><span className="demo-badge lvl-3">3</span> Capable</li>
        <li><span className="demo-badge lvl-4">4</span> Can train others</li>
      </ul>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-brand">Skill Matrix</span>
        <nav>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link to="/login" className="nav-login">
            Log in
          </Link>
          <Link to="/signup" className="nav-cta">
            Sign up free
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Skills tracking for small teams</p>
          <h1>Know who can do what — before you need them to.</h1>
          <p className="hero-sub">
            One grid showing every person against every skill, with where they are now and where
            you need them to be. Spot the gaps, plan the cover, and stop keeping it in a
            spreadsheet only one person understands.
          </p>
          <div className="hero-actions">
            <Link to="/signup" className="btn-primary">
              Start free
            </Link>
            <a href="#how" className="btn-ghost">
              See how it works
            </a>
          </div>
          <p className="hero-note">Free for up to 25 people. No card required.</p>
        </div>
        <DemoGrid />
      </section>

      <section className="how" id="how">
        <h2>Three things it&rsquo;s good at</h2>
        <div className="how-grid">
          <article>
            <h3>Seeing the gaps</h3>
            <p>
              Set a target level next to each current level. The matrix shows you instantly where
              someone is short, and the dashboard totals it up across the whole team.
            </p>
          </article>
          <article>
            <h3>Planning cover</h3>
            <p>
              Filter to a category and see at a glance who can actually run a line, handle an
              inspection, or step in when someone&rsquo;s off. No more guessing from memory.
            </p>
          </article>
          <article>
            <h3>Keeping it current</h3>
            <p>
              Invite the people who know. Everyone edits the same live grid, so it stops being one
              person&rsquo;s spreadsheet and starts being something the team maintains.
            </p>
          </article>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <h2>Pricing</h2>
        <p className="pricing-sub">Start free. Pay per person only when your team outgrows it.</p>
        <div className="tiers">
          {TIERS.map((t) => (
            <article key={t.name} className={t.featured ? 'tier tier-featured' : 'tier'}>
              {t.featured && <span className="tier-flag">Most popular</span>}
              <h3>{t.name}</h3>
              <p className="tier-price">
                {t.price}
                <span>{t.cadence}</span>
              </p>
              <p className="tier-blurb">{t.blurb}</p>
              <ul>
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link to="/signup" className={t.featured ? 'btn-primary' : 'btn-ghost'}>
                {t.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="closer">
        <h2>Set up your first matrix in a few minutes</h2>
        <p>Add your people, add the skills that matter, and start filling it in.</p>
        <Link to="/signup" className="btn-primary btn-lg">
          Start free
        </Link>
      </section>

      <footer className="landing-footer">
        <span>Skill Matrix</span>
        <span>
          <Link to="/login">Log in</Link>
        </span>
      </footer>
    </div>
  )
}
