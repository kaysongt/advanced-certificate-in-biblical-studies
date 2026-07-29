# Deploying the site

The site is a Next.js app. It needs a host that runs a server — sessions, gated
lessons, and enrollment all happen server-side. **GitHub Pages cannot host it**;
Pages only serves static files.

---

## 1. Import the repo into Vercel

Do this in a browser, signed in as the account that should own the project.

1. Go to <https://vercel.com/new>
2. Import `kaysongt/advanced-certificate-in-biblical-studies`
3. Framework preset: **Next.js** (it will detect this from `vercel.json`)
4. Leave build and output settings at their defaults
5. Before clicking Deploy, add the environment variable in step 2 below

Vercel then redeploys automatically on every push to `main`.

## 2. Set `SESSION_SECRET`

**Required.** The app throws on boot in production without it — deliberately, so
it can never fall back to the insecure development secret.

In Vercel: **Project → Settings → Environment Variables**

| Name | Value | Environments |
|---|---|---|
| `SESSION_SECRET` | a 48-byte random string | Production, Preview, Development |

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

A secret has already been generated into `.env.local` for local use. That file is
gitignored — do not commit it, and use a *different* value in production.

Rotating this value signs every student out. That is the correct response if it
ever leaks.

## 3. Point the domain

Add `institute.kingsword.org` under **Project → Settings → Domains**, then create
the DNS record Vercel shows you (a `CNAME` to `cname.vercel-dns.com`).

---

## What works, and what does not, on first deploy

| | Status |
|---|---|
| Home, curriculum, pricing, glossary | Fully working |
| Sign in, gated topics, quizzes, progress within a session | Working |
| **Registration and saved progress** | **Not yet — needs a database** |

### Why

`lib/db/index.ts` currently uses `fileStore`, which writes to `.data/store.json`.
Vercel's filesystem is read-only, so every write fails there.

This is handled, not ignored. Writes raise `StorageUnavailableError`, and:

- the enrollment form shows *"Enrollment is not open yet — please email
  kti@kingsword.org"* instead of a 500
- marking a topic complete degrades quietly; it holds for the session but does
  not survive a reload

So the site is safe to put in front of people as a **brochure and preview**
immediately. Do not advertise enrollment until step 4 is done.

## 4. Attach the database

1. Provision Postgres (Vercel Postgres, Supabase, Neon — any is fine)
2. Add its connection string as `DATABASE_URL` in Vercel
3. Create the tables — the schema is in `HANDOVER.md` §4.4
4. Write `lib/db/<name>-store.ts` implementing the `DataStore` interface from
   `lib/db/types.ts`
5. Change the one line in `lib/db/index.ts`:

   ```ts
   const store: DataStore = yourStore;
   ```

Nothing else in the codebase changes — every caller depends on the interface,
not the adapter.

---

## The old GitHub Pages site

`.github/workflows/static.yml` still publishes `docs/` to
<https://kaysongt.github.io/advanced-certificate-in-biblical-studies/>. That
folder is the **old** static build and is now out of date: it predates the 80%
pass mark, the topic renaming, and the removal of discussion questions.

Once Vercel is live, pick one:

- **Retire it** — delete `.github/workflows/static.yml` and turn Pages off in
  the repo settings
- **Regenerate it** — run `python3 build.py build` and commit `docs/`. Needs a
  machine with Python; there is none on the current development box.

Leaving both live means two versions of the program are publicly visible and
they disagree with each other.
