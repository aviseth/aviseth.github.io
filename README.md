# aviseth.fyi

A personal site with a live index. The prose is written by hand; every number on
the page comes straight from a public API and refreshes itself.

```
index.html              the site — all the writing lives here, edit it directly
assets/style.css        design system: hard rules, no radii, one accent
assets/app.js           renders data/feed.json into the ticker, tables and stats
scripts/build-feed.mjs  fetches GitHub / PyPI / npm / Crossref / Scholar
scripts/lib/events.mjs  maps the GitHub events stream (unit-tested)
scripts/test-events.mjs fixture test: node scripts/test-events.mjs
scripts/bundle-preview.mjs   → dist/preview.html  (one self-contained file)
scripts/bundle-artifact.mjs  → dist/artifact.html (same, for a claude.ai Artifact)
config.json             what to fetch
data/feed.json          generated — do not edit by hand
.github/workflows/      refreshes the feed every 3h and deploys to Pages
```

No framework, no build step, no dependencies. `scripts/build-feed.mjs` is plain
Node 22 using the built-in `fetch`.

## Deploying it

1. **Create the repo.** Public, named `aviseth.fyi` (any name works — the CNAME
   file is what binds the domain).

   ```bash
   git init && git add -A
   git commit -m "initial"
   git branch -M main
   git remote add origin git@github.com:aviseth/aviseth.fyi.git
   git push -u origin main
   ```

2. **Turn on Pages.** Settings → Pages → Source: **GitHub Actions**.

3. **Point the domain.** `aviseth.fyi` is registered at WordPress.com, which
   does let you set custom DNS records: **Domains → aviseth.fyi → DNS records**.
   Add these six and delete any existing A record on `@` that points at
   WordPress:

   | Type  | Name | Value |
   |-------|------|-------|
   | A     | @    | `185.199.108.153` |
   | A     | @    | `185.199.109.153` |
   | A     | @    | `185.199.110.153` |
   | A     | @    | `185.199.111.153` |
   | CNAME | www  | `aviseth.github.io.` |

   Optionally add the IPv6 AAAA records on `@` as well:
   `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
   `2606:50c0:8003::153`.

   Then Settings → Pages → Custom domain → `aviseth.fyi`, and tick **Enforce
   HTTPS** once the certificate is issued (usually under an hour, occasionally
   24). The `CNAME` file in this repo already says `aviseth.fyi`, so Pages picks
   it up on the first deploy.

   If WordPress.com is also *hosting* a site on that domain, disconnect it
   first — the A records will not take effect while the domain is attached to a
   WordPress site.

That's it. Free, and the first Action run replaces the seeded feed with real
data within a couple of minutes.

## Running the feed builder locally

```bash
node scripts/build-feed.mjs
```

Unauthenticated GitHub gives you 60 requests an hour, which is enough. To use
the full 5,000:

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/build-feed.mjs
```

If `api.github.com` is unreachable — a proxy, a firewall — the script falls back
to the `ungh.cc` mirror and records a warning in the feed. The mirror has no
language, fork or event data, so the page will look thinner than it should. The
committed `data/feed.json` was seeded that way; the first Actions run fixes it.

## Adding things

**A package.** Publish it, then add the name to `config.json`:

```json
"pypiPackages": ["your-package"],
"npmPackages": ["your-package"]
```

It appears in the Packages section and the ticker on the next build, with live
download counts from pypistats and the npm registry.

**A paper.** Add the DOI to `config.json` under `crossref.dois`, and add the
`<li>` to the `.papers` list in `index.html` with a matching `data-doi`. The
citation count fills itself in. For anything without a DOI, use
`data-scholar="N"` instead and update the number when you check Scholar.

**A job.** Copy a `.cv__item` block in the Experience section. Newest at the
top; the `cv__now` class is what makes the current one red.

**An essay.** Copy an `<li>` in the Writing section. Date on the left as
`YYYY-MM-DD` with non-breaking hyphens (`&#8209;`) so it never wraps.

**A project.** Copy a `.row` block in `index.html`. Four is about the right
number; more than six and nobody reads any of them.

## Where the writing lives

Everything you would want to edit is plain HTML in `index.html`, in reading
order:

| Section | What it is |
|---|---|
| Hero | The one-line claim and the four-cell fact table |
| 01 Selected work | Four hand-written case notes |
| 02 Experience | Full timeline, ten roles, plus education |
| 03 Open source | Live — repo table, activity log, external PRs, packages |
| 04 Research | Papers; citation counts fill in live |
| 05 Writing | Medium essays and other appearances |
| 06 Off the clock | Cricket and cities |

The theme is **light by default**; dark is opt-in via the button and remembered
in `localStorage`. If you would rather it follow the operating system, add a
`@media (prefers-color-scheme: dark)` block mirroring the
`:root[data-theme="dark"]` tokens in `assets/style.css`.

## Two things worth knowing

**The commit trail is the point, not a side effect.** The workflow commits
`data/feed.json` on every refresh, so the repository accumulates a dated,
tamper-evident record of stars, forks, downloads and citations over time. That
history is worth more than any snapshot — it is a contemporaneous record rather
than a reconstructed one.

**Scholar is best-effort.** Google blocks datacentre IPs most of the time, so
the Action will usually fail to scrape it and fall back to the snapshot in
`config.json`. Update `scholar.citations`, `hIndex`, `i10Index` and `capturedAt`
by hand every few months. The page shows the capture date, so a stale number is
never presented as a live one.


## Why the activity log can look empty locally

`api.github.com` is unreachable from some sandboxed environments, which is not
the same thing as having no activity. When the builder cannot reach it, it
falls back to the `ungh.cc` mirror — which has repositories but no events
endpoint and no pull-request search — and the page says so rather than
implying the lists are empty.

On GitHub Actions there is no such restriction: the runner has full API access
and the workflow passes the automatic `GITHUB_TOKEN`, which is 5,000 requests
an hour. The activity log and the external-PR list populate on the first
scheduled run.

To fill them in locally instead:

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/build-feed.mjs
```
