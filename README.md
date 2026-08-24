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

## Where it is deployed

This repository is `aviseth/aviseth.github.io` — a GitHub **user site**, so it
serves from the root of `https://aviseth.github.io/` with no subpath. Settings →
Pages → Source is set to **GitHub Actions**; the workflow in
`.github/workflows/refresh.yml` builds the feed and deploys on every push and
every three hours.

One repository setting is required and is easy to miss: Settings → Actions →
General → **Workflow permissions → Read and write**. Without it the step that
commits the refreshed `data/feed.json` fails with a 403 while the rest of the
run looks green.

## Moving it to a custom domain later

`aviseth.fyi` is currently a free Gravatar domain, and Gravatar locks DNS
management for the first year. Once that lifts — or once the domain is
transferred to a registrar with real DNS control, such as Cloudflare or Porkbun
— three steps connect it:

1. At the registrar, delete any existing A record on `@` and add these:

   | Type  | Name | Value |
   |-------|------|-------|
   | A     | @    | `185.199.108.153` |
   | A     | @    | `185.199.109.153` |
   | A     | @    | `185.199.110.153` |
   | A     | @    | `185.199.111.153` |
   | CNAME | www  | `aviseth.github.io.` |

   The IPv6 equivalents on `@` are optional: `2606:50c0:8000::153`,
   `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.

2. Add a file named `CNAME` at the repository root containing one line —
   `aviseth.fyi` — and push it.

3. Settings → Pages → Custom domain → `aviseth.fyi`, wait for the DNS check to
   go green, then tick **Enforce HTTPS**.

Also update `<link rel="canonical">` and `og:url` in `index.html` at that point.

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

## Contributions to other people's projects

The Open source section lists work done in repositories you do not own. Four
searches feed it — merged pull requests, open pull requests, pull requests you
reviewed, and issues you opened — deduplicated, then ranked with merges first,
then by the target repository's star count, then by date. Nothing to maintain:
open a pull request somewhere and it appears within three hours.

Three `config.json` keys shape it:

- `excludeOwners` — organisations whose repositories do not count as other
  people's projects. Employers belong here. Work you were paid for is not a
  contribution to the commons, and listing it as one invites the obvious
  objection.
- `excludeContributionRepos` — individual `owner/name` repositories to drop.
  Coursework, tutorial repos, anything where a merge says nothing about the
  work. A star threshold would be the cruder tool: a real one-star project
  still counts, a class exercise never does.
- `extraContributions` — an array for work the search API cannot see: a patch
  sent by email, a contribution made under a different handle, a maintainer's
  public acknowledgement. Each entry takes `kind`, `title`, `url`, `repo` and
  `at`, and renders marked "recorded by hand".

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

**The feed is committed, not just deployed.** The workflow writes
`data/feed.json` back to the repository on every refresh rather than only into
the build artifact. Three reasons: the page always has a source you can open and
check, the site still renders if an API is down, and `git log -p data/feed.json`
gives you the history of every number on the page.

**Scholar figures are entered by hand.** Google Scholar has no API and blocks
automated access from datacentre IPs, so the citation totals come from the
snapshot in `config.json`. Update `scholar.citations`, `hIndex`, `i10Index` and
`capturedAt` every few months. The page displays the capture date next to the
numbers, so a stale figure is never presented as a live one.


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
