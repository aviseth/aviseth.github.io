#!/usr/bin/env node
/**
 * Builds data/feed.json from public APIs.
 *
 * Sources
 *   GitHub   repos, profile, recent public events, merged PRs   (token optional, raises the rate limit)
 *   PyPI     package metadata + pypistats recent downloads
 *   npm      registry metadata + api.npmjs.org downloads
 *   Crossref per-DOI citation counts
 *   Scholar  best-effort scrape; falls back to the committed snapshot in config.json
 *
 * Nothing here needs a secret. GITHUB_TOKEN is used if present because Actions
 * hands us one for free, and 5000 req/hr beats 60.
 */

import { mapEvents, eventsFromPushes } from './lib/events.mjs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UA = 'aviseth.fyi-feed-builder (+https://aviseth.fyi)'
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''

const warnings = []
const warn = (msg) => { warnings.push(msg); console.warn('  ! ' + msg) }

async function getJSON (url, { headers = {}, tolerate = false } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers } })
  if (!res.ok) {
    if (tolerate) return null
    throw new Error(`${res.status} ${res.statusText} — ${url}`)
  }
  return res.json()
}

const gh = (path, opts = {}) => getJSON('https://api.github.com' + path, {
  headers: {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {})
  },
  ...opts
})

/* ------------------------------------------------------------------ GitHub */

// api.github.com is unreachable from some networks (corporate proxies, and the
// sandbox this was first written in). ungh.cc is a free read-only mirror with
// no auth — enough to seed the feed. Actions always gets the real API.
async function githubMirror (cfg) {
  const { repos = [] } = await getJSON(`https://ungh.cc/users/${cfg.github}/repos`)
  const exclude = new Set(cfg.excludeRepos || [])
  const kept = repos
    .filter(r => !exclude.has(r.name))
    .map(r => ({
      name: r.name,
      description: r.description,
      url: `https://github.com/${r.repo}`,
      homepage: null,
      language: null,
      stars: r.stars,
      forks: r.forks,
      openIssues: 0,
      topics: [],
      license: null,
      createdAt: r.createdAt,
      pushedAt: r.pushedAt
    }))
    .sort((a, b) => b.stars - a.stars || new Date(b.pushedAt) - new Date(a.pushedAt))

  warn('used the ungh.cc mirror instead of api.github.com — no languages, and the activity log is derived from push times rather than the commit feed')

  // The mirror has no events endpoint, so build a coarse but real activity log
  // out of the last-push times we do have.
  const events = eventsFromPushes(kept, cfg.eventLimit || 24)

  // Contributor lists ARE available, and an external contributor is the single
  // most meaningful adoption signal there is — worth the extra calls.
  let external = 0
  for (const r of kept.slice(0, 12)) {
    const c = await getJSON(`https://ungh.cc/repos/${cfg.github}/${r.name}/contributors`, { tolerate: true })
    external += (c?.contributors || []).filter(x => x.username?.toLowerCase() !== cfg.github.toLowerCase()).length
  }

  return {
    mirror: true,
    profile: { login: cfg.github, url: `https://github.com/${cfg.github}` },
    repos: kept.slice(0, cfg.repoLimit || 100),
    releases: [],
    events,
    externalPRs: [],
    totals: {
      repos: kept.length,
      stars: kept.reduce((s, r) => s + r.stars, 0),
      forks: kept.reduce((s, r) => s + r.forks, 0),
      releases: 0,
      externalContributors: external,
      languages: 0
    }
  }
}

async function github (cfg) {
  let user
  try {
    user = await gh(`/users/${cfg.github}`)
  } catch (e) {
    warn(`api.github.com unreachable (${e.message})`)
    return githubMirror(cfg)
  }

  const repos = []
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/users/${cfg.github}/repos?per_page=100&page=${page}&sort=pushed`)
    repos.push(...batch)
    if (batch.length < 100) break
  }

  const exclude = new Set(cfg.excludeRepos || [])
  const kept = repos
    .filter(r => !r.private && !r.archived)
    .filter(r => !(cfg.excludeForks && r.fork))
    .filter(r => !exclude.has(r.name))
    .map(r => ({
      name: r.name,
      description: r.description,
      url: r.html_url,
      homepage: r.homepage || null,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      openIssues: r.open_issues_count,
      topics: r.topics || [],
      license: r.license?.spdx_id || null,
      createdAt: r.created_at,
      pushedAt: r.pushed_at
    }))
    .sort((a, b) => b.stars - a.stars || new Date(b.pushedAt) - new Date(a.pushedAt))

  // Releases across the ten most recently pushed repos — cheap, and releases
  // are the single clearest "this is a package, not a folder" signal.
  const releases = []
  const recent = [...kept].sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt)).slice(0, 10)
  for (const r of recent) {
    const rel = await gh(`/repos/${cfg.github}/${r.name}/releases?per_page=3`, { tolerate: true })
    for (const x of rel || []) {
      if (x.draft) continue
      releases.push({ repo: r.name, tag: x.tag_name, name: x.name, url: x.html_url, publishedAt: x.published_at })
    }
  }
  releases.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))

  // Public event stream — the raw material for the ticker.
  const raw = await gh(`/users/${cfg.github}/events/public?per_page=100`, { tolerate: true })
  if (!raw) warn('GitHub events API returned nothing — activity log will fall back to push times')
  let events = mapEvents(raw || [])
  if (!events.length) events = eventsFromPushes(kept)

  // Merged PRs into repos Avi does not own — the contributions that actually count.
  let externalPRs = []
  const search = await getJSON(
    `https://api.github.com/search/issues?q=${encodeURIComponent(`author:${cfg.github} type:pr is:merged -user:${cfg.github}`)}&sort=updated&per_page=30`,
    { headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, tolerate: true }
  )
  if (search?.items) {
    externalPRs = search.items.map(i => ({
      title: i.title,
      url: i.html_url,
      repo: i.repository_url.replace('https://api.github.com/repos/', ''),
      mergedAt: i.pull_request?.merged_at || i.closed_at
    }))
  } else {
    warn('GitHub PR search unavailable (rate limit or no token) — external PR list left as-is')
  }

  return {
    profile: {
      login: user.login,
      name: user.name,
      bio: user.bio,
      avatar: user.avatar_url,
      url: user.html_url,
      followers: user.followers,
      following: user.following,
      publicRepos: user.public_repos,
      createdAt: user.created_at
    },
    repos: kept.slice(0, cfg.repoLimit || 100),
    releases,
    events: events.slice(0, cfg.eventLimit || 24),
    externalPRs,
    totals: {
      repos: kept.length,
      stars: kept.reduce((s, r) => s + r.stars, 0),
      forks: kept.reduce((s, r) => s + r.forks, 0),
      releases: releases.length,
      languages: [...new Set(kept.map(r => r.language).filter(Boolean))].length
    }
  }
}

/* ----------------------------------------------------------- PyPI and npm */

async function pypi (names = []) {
  const out = []
  for (const name of names) {
    const meta = await getJSON(`https://pypi.org/pypi/${name}/json`, { tolerate: true })
    if (!meta) { warn(`PyPI: ${name} not found`); continue }
    // pypistats rate-limits by IP and shared runners hit it. Try twice, then
    // ship the package without a download figure rather than failing the build.
    let stats = await getJSON(`https://pypistats.org/api/packages/${name}/recent`, { tolerate: true })
    if (!stats) {
      await new Promise(r => setTimeout(r, 2500))
      stats = await getJSON(`https://pypistats.org/api/packages/${name}/recent`, { tolerate: true })
      if (!stats) warn(`pypistats unavailable for ${name} — download count omitted this build`)
    }
    const version = meta.info.version
    const files = meta.releases?.[version] || []
    out.push({
      registry: 'pypi',
      name,
      version,
      summary: meta.info.summary,
      url: meta.info.project_urls?.Homepage || meta.info.package_url,
      registryUrl: `https://pypi.org/project/${name}/`,
      releasedAt: files[0]?.upload_time_iso_8601 || null,
      releaseCount: Object.keys(meta.releases || {}).length,
      downloads: stats?.data ? { day: stats.data.last_day, week: stats.data.last_week, month: stats.data.last_month } : null
    })
  }
  return out
}

async function npm (names = []) {
  const out = []
  for (const name of names) {
    const meta = await getJSON(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { tolerate: true })
    if (!meta) { warn(`npm: ${name} not found`); continue }
    const version = meta['dist-tags']?.latest
    const stats = await getJSON(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`, { tolerate: true })
    const month = await getJSON(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(name)}`, { tolerate: true })
    out.push({
      registry: 'npm',
      name,
      version,
      summary: meta.description,
      url: meta.homepage || `https://www.npmjs.com/package/${name}`,
      registryUrl: `https://www.npmjs.com/package/${name}`,
      releasedAt: meta.time?.[version] || null,
      releaseCount: Object.keys(meta.versions || {}).length,
      downloads: { day: null, week: stats?.downloads ?? null, month: month?.downloads ?? null }
    })
  }
  return out
}

/* ------------------------------------------------------- Crossref citations */

async function crossref (dois = []) {
  const out = []
  for (const doi of dois) {
    const r = await getJSON(`https://api.crossref.org/works/${doi}?mailto=avi@crispa.ai`, { tolerate: true })
    if (!r) { warn(`Crossref: ${doi} unavailable`); continue }
    const m = r.message
    out.push({
      doi,
      title: m.title?.[0],
      venue: m['container-title']?.[0],
      year: m.issued?.['date-parts']?.[0]?.[0],
      citations: m['is-referenced-by-count'],
      url: m.URL
    })
  }
  return out
}

/* ------------------------------------------------------------- Scholar */

// Google blocks datacentre IPs most of the time. Try; keep the committed
// snapshot when it fails, and mark which one the page is showing.
async function scholar (cfg) {
  const snapshot = {
    id: cfg.scholar.id,
    citations: cfg.scholar.citations,
    hIndex: cfg.scholar.hIndex,
    i10Index: cfg.scholar.i10Index,
    capturedAt: cfg.scholar.capturedAt,
    live: false
  }
  try {
    const res = await fetch(`https://scholar.google.com/citations?user=${cfg.scholar.id}&hl=en`, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' }
    })
    if (!res.ok) throw new Error(res.status)
    const html = await res.text()
    const nums = [...html.matchAll(/gsc_rsb_std">(\d+)<\/td>/g)].map(m => Number(m[1]))
    if (nums.length < 6) throw new Error('unexpected markup')
    return { ...snapshot, citations: nums[0], hIndex: nums[2], i10Index: nums[4], capturedAt: new Date().toISOString().slice(0, 10), live: true }
  } catch (e) {
    warn(`Scholar scrape failed (${e.message}) — using committed snapshot from ${snapshot.capturedAt}`)
    return snapshot
  }
}

/* --------------------------------------------------------------- assemble */

const step = async (label, fn) => {
  process.stdout.write(`→ ${label}\n`)
  try { return await fn() } catch (e) { warn(`${label} failed: ${e.message}`); return null }
}

const cfg = JSON.parse(await readFile(resolve(ROOT, 'config.json'), 'utf8'))

const [g, py, js, cr, sc] = [
  await step('github', () => github(cfg)),
  await step('pypi', () => pypi(cfg.pypiPackages)),
  await step('npm', () => npm(cfg.npmPackages)),
  await step('crossref', () => crossref(cfg.crossref?.dois)),
  await step('scholar', () => scholar(cfg))
]

// Never ship an empty feed over a good one just because an API blinked.
let previous = null
try { previous = JSON.parse(await readFile(resolve(ROOT, 'data/feed.json'), 'utf8')) } catch {}

const packages = [...(py || []), ...(js || [])]
const feed = {
  generatedAt: new Date().toISOString(),
  warnings,
  github: g || previous?.github || null,
  packages: packages.length ? packages : (previous?.packages || []),
  citations: (cr && cr.length ? cr : previous?.citations) || [],
  scholar: sc || previous?.scholar || null
}

if (!feed.github) {
  console.error('✗ no GitHub data and no previous feed to fall back on — refusing to write')
  process.exit(1)
}

await mkdir(resolve(ROOT, 'data'), { recursive: true })
await writeFile(resolve(ROOT, 'data/feed.json'), JSON.stringify(feed, null, 2) + '\n')

const t = feed.github.totals
console.log(`\n✓ data/feed.json — ${t.repos} repos · ${t.stars}★ · ${t.forks} forks · ${feed.packages.length} packages · ${feed.github.events.length} events`)
if (warnings.length) console.log(`  ${warnings.length} warning(s) recorded in the feed`)
