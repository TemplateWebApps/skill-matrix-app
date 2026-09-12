# Deploying Skill Matrix to Netlify

Three accounts are involved: GitHub (stores the code), Netlify (builds and
hosts it), Supabase (already set up — just needs to be told the new address).

Do these in order. Anything marked **you** needs your login, so it has to be
done by you, not the assistant.

---

## 1. Put the code on GitHub — **you**

The project is a git repository on your machine with 4 commits, but it isn't
backed up anywhere yet.

1. Log into GitHub with the business account (TemplateWebApps@gmail.com).
2. Click **New repository**.
   - Name: `skill-matrix-app`
   - **Private** (it holds no secrets — `.env.local` is excluded — but there's
     no reason for it to be public yet)
   - Do **not** tick "Add a README" — the folder already has files.
3. GitHub will show a "push an existing repository" command block. Paste that
   URL here and the assistant will run the push for you.

---

## 2. Create the Netlify site — **you**

1. netlify.com → log in with the **business GitHub account** (so it can see
   the repo).
2. **Add new site → Import an existing project → GitHub →** pick
   `skill-matrix-app`.
3. Build settings should auto-fill from `netlify.toml` in the repo:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Before the first deploy, open **Environment variables** and add these two.
   They're the same values as in your local `.env.local`:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://mhubibyupkcdnlvzeaau.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the long `eyJ…` anon key |

   The anon key is safe to put here — it's designed to be visible in the
   browser. The `service_role` key is **not**, and isn't used anywhere in
   this app.
5. Deploy. Netlify gives you an address like
   `https://something-random-123.netlify.app`. Save it — step 3 needs it.

---

## 3. Tell Supabase the new address — **you**

Without this, confirmation and invite emails still point at `localhost` and
won't work for anyone but you.

1. Supabase → **skill-matrix-beta** → **Authentication → URL Configuration**.
2. **Site URL**: your Netlify address.
3. **Redirect URLs**: add both, so local development keeps working:
   - `https://<your-netlify-address>/**`
   - `http://localhost:5173/**`

---

## 4. Check it works

1. Open the Netlify address, log in.
2. Go to **Team → Create invite link** — the link should now start with your
   Netlify address instead of `localhost`.
3. Open that link in a private/incognito window. It should show
   "Join <workspace>" rather than a 404 (this is what `netlify.toml` fixes).

---

## After the first deploy

Every push to the `main`/`master` branch rebuilds and redeploys automatically.
No further setup.
