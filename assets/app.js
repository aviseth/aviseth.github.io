/* aviseth.fyi — renders the live index from data/feed.json.
   No framework, no build step. The feed is refreshed by a GitHub Action;
   this file just draws it. */

(() => {
  'use strict'

  const $  = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const el = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  /* ── theme ─────────────────────────────────────────────────────────── */

  const root = document.documentElement
  const label = $('#theme-label')

  // Light is the design; dark is opt-in and remembered. The button names the
  // scheme you would switch TO, which is the only labelling people read right.
  const isDark = () => root.dataset.theme === 'dark'
  const paintLabel = () => { if (label) label.textContent = isDark() ? 'Light' : 'Dark' }

  paintLabel()
  $('#theme')?.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark'
    root.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch {}
    paintLabel()
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#16161A' : '#FBFAF7')
  })

  /* ── formatting ────────────────────────────────────────────────────── */

  const nf = new Intl.NumberFormat('en-GB')
  const num = n => (n == null ? '—' : nf.format(n))

  const DAY = 86400000
  function ago (iso) {
    if (!iso) return '—'
    const d = Date.now() - new Date(iso).getTime()
    if (d < 3600000) return Math.max(1, Math.round(d / 60000)) + 'm'
    if (d < DAY) return Math.round(d / 3600000) + 'h'
    if (d < 30 * DAY) return Math.round(d / DAY) + 'd'
    if (d < 365 * DAY) return Math.round(d / (30 * DAY)) + 'mo'
    return Math.round(d / (365 * DAY)) + 'y'
  }
  const day = iso => (iso ? new Date(iso).toISOString().slice(0, 10) : '—')

  /* ── ticker ────────────────────────────────────────────────────────── */

  const EVENT_LABEL = {
    push: 'push',
    'pr-merged': 'merged',
    'pr-opened': 'pr open',
    'pr-closed': 'pr closed',
    'issue-opened': 'issue',
    'issue-closed': 'issue closed',
    release: 'release',
    'repo-created': 'new repo',
    starred: 'starred'
  }

  function tickerItems (feed) {
    const g = feed.github
    const t = g?.totals || {}
    const out = []

    const stat = (k, v, sub) => ({ k, v, sub })

    if (g) {
      out.push(stat('repos', num(t.repos)))
      out.push(stat('stars', num(t.stars)))
      out.push(stat('forks', num(t.forks)))
      if (t.releases) out.push(stat('releases', num(t.releases)))
      if (g.profile?.followers != null) out.push(stat('followers', num(g.profile.followers)))
    }

    for (const p of feed.packages || []) {
      const d = p.downloads?.month ?? p.downloads?.week
      out.push({
        k: p.registry,
        v: `${p.name} ${p.version}`,
        sub: d != null ? `${num(d)}/mo` : null,
        href: p.registryUrl
      })
    }

    if (feed.scholar?.citations != null) {
      out.push(stat('citations', num(feed.scholar.citations)))
      out.push(stat('h-index', num(feed.scholar.hIndex)))
    }

    for (const e of (g?.events || []).slice(0, 14)) {
      const k = EVENT_LABEL[e.kind] || e.kind
      let v = e.repo || ''
      if (e.kind === 'push' && e.count > 1) v += ` ×${e.count}`
      out.push({ k, v, sub: ago(e.at), href: e.url })
    }

    for (const pr of (g?.externalPRs || []).slice(0, 6)) {
      out.push({ k: 'merged', v: pr.repo, sub: ago(pr.mergedAt), href: pr.url })
    }

    return out
  }

  function renderTicker (feed) {
    const track = $('#ticker-track')
    if (!track) return
    const items = tickerItems(feed)
    if (!items.length) return

    const make = () => {
      const frag = document.createDocumentFragment()
      for (const it of items) {
        const node = it.href ? el('a', 'ticker__item') : el('span', 'ticker__item')
        if (it.href) { node.href = it.href; node.rel = 'noopener' }
        node.append(el('span', 'k', it.k))
        node.append(el('b', null, it.v))
        if (it.sub) node.append(el('span', 't', it.sub))
        frag.append(node)
      }
      return frag
    }

    // Render one set, measure it, then repeat until the strip is wider than
    // the window plus one whole set. Shifting by exactly one set width is what
    // makes the loop seamless — and it stays seamless when the feed is thin.
    track.replaceChildren(make())
    requestAnimationFrame(() => {
      const set = track.scrollWidth
      if (!set) return
      const win = track.parentElement.clientWidth
      const copies = Math.max(2, Math.ceil(win / set) + 1)
      const frag = document.createDocumentFragment()
      for (let i = 1; i < copies; i++) frag.append(make())
      track.append(frag)
      track.style.setProperty('--shift', set + 'px')
      track.style.setProperty('--dur', Math.max(24, Math.round(set / 40)) + 's')
    })
  }

  /* ── stats ─────────────────────────────────────────────────────────── */

  function renderStats (feed) {
    const t = feed.github?.totals || {}
    const v = {
      repos: t.repos,
      stars: t.stars,
      forks: t.forks,
      releases: t.releases,
      packages: (feed.packages || []).length,
      citations: feed.scholar?.citations
    }
    for (const [k, val] of Object.entries(v)) {
      const node = $(`[data-stat="${k}"]`)
      if (node) node.textContent = num(val)
    }
    const synced = $('#synced')
    if (synced && feed.generatedAt) synced.textContent = `Synced ${ago(feed.generatedAt)} ago`
    const stamp = $('#stamp')
    if (stamp && feed.generatedAt) stamp.textContent = `Feed built ${day(feed.generatedAt)}`
  }

  /* ── repositories ──────────────────────────────────────────────────── */

  function renderRepos (feed) {
    const body = $('#repos tbody')
    if (!body) return
    const repos = feed.github?.repos || []
    if (!repos.length) {
      body.replaceChildren(row5('No public repositories.'))
      return
    }
    // 50-odd repositories is a landfill, not a portfolio. Lead with the ones
    // that have any signal — a star, a fork, or a push in the last year — and
    // put the archaeology behind a click.
    const YEAR = 365 * DAY
    const notable = r => r.stars > 0 || r.forks > 0 || (r.pushedAt && Date.now() - new Date(r.pushedAt) < YEAR)
    const lead = repos.filter(notable).slice(0, 16)
    const leadSet = new Set(lead.map(r => r.name))
    const rest = repos.filter(r => !leadSet.has(r.name))

    const frag = document.createDocumentFragment()
    for (const r of [...lead, ...rest]) {
      const tr = el('tr')
      if (!leadSet.has(r.name)) { tr.hidden = true; tr.dataset.rest = '1' }

      const name = el('td')
      const a = el('a', null, r.name)
      a.href = r.url; a.rel = 'noopener'
      name.append(a)
      if (r.description) name.append(el('span', 'tbl__desc', r.description))
      tr.append(name)

      const cell = (cls, label, text) => {
        const td = el('td', cls, text)
        td.dataset.l = label            // read by the narrow-screen stacked layout
        return td
      }
      tr.append(cell(null, 'lang', r.language || '—'))
      tr.append(cell('num' + (r.stars ? '' : ' tbl__star--zero'), 'stars', num(r.stars)))
      tr.append(cell('num' + (r.forks ? '' : ' tbl__star--zero'), 'forks', num(r.forks)))
      tr.append(cell('num', 'pushed', ago(r.pushedAt)))
      frag.append(tr)
    }
    body.replaceChildren(frag)

    const host = $('#repos')?.closest('.tablewrap')?.parentElement
    const old = $('#more-repos')
    if (old) old.remove()
    if (rest.length && host) {
      const btn = el('button', 'more')
      btn.id = 'more-repos'
      btn.type = 'button'
      btn.setAttribute('aria-expanded', 'false')
      const paint = open => {
        btn.replaceChildren(
          document.createTextNode(open ? 'Hide the archive  ' : 'Show everything  '),
          el('b', null, open ? `(${rest.length} older repos)` : `+${rest.length} older, quieter repos`)
        )
      }
      paint(false)
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true'
        for (const tr of $$('#repos tbody tr[data-rest]')) tr.hidden = open
        btn.setAttribute('aria-expanded', String(!open))
        paint(!open)
      })
      $('#repos').closest('.tablewrap').after(btn)
    }
  }

  const row5 = text => {
    const tr = el('tr')
    const td = el('td', 'tbl__wait', text)
    td.colSpan = 5
    tr.append(td)
    return tr
  }

  /* ── activity log ──────────────────────────────────────────────────── */

  const emptyRow = text => {
    const li = el('li', 'log__empty')
    li.append(el('span', 'log__wait', text))
    return li
  }

  function logItem (date, kind, text, href, trail) {
    const li = el('li')
    li.append(el('span', 'log__date', date))
    const what = el('span', 'log__what')
    if (kind) what.append(el('span', 'log__k', kind))
    if (href) {
      const a = el('a', null, text)
      a.href = href; a.rel = 'noopener'
      what.append(a)
    } else {
      what.append(document.createTextNode(text))
    }
    if (trail) what.append(el('span', 'log__repo', trail))
    li.append(what)
    return li
  }

  function renderLog (feed) {
    const list = $('#log')
    if (!list) return
    const events = feed.github?.events || []
    if (!events.length) {
      list.replaceChildren(emptyRow(feed.github?.mirror
        ? 'This build could not reach the GitHub events API, so there is no activity log. The scheduled build on GitHub Actions has full access and fills this in.'
        : 'No public activity in the 90-day window the events API returns.'))
      return
    }
    const frag = document.createDocumentFragment()
    for (const e of events) {
      const kind = EVENT_LABEL[e.kind] || e.kind
      const text = e.title || e.repo || '—'
      frag.append(logItem(day(e.at), kind, text, e.url, e.title ? e.repo : null))
    }
    list.replaceChildren(frag)

    // Say so when these are last-push times rather than the real commit feed.
    if (events.some(e => e.derived)) {
      const note = el('li', 'log__empty')
      note.append(el('span', 'log__wait', 'Derived from each repository\u2019s last push, not the commit feed \u2014 this build ran without access to the GitHub events API.'))
      list.append(note)
    }
  }

  function renderPRs (feed) {
    const list = $('#prs')
    if (!list) return
    const prs = feed.github?.externalPRs || []
    if (!prs.length) {
      list.replaceChildren(emptyRow(feed.github?.mirror
        ? 'Unavailable in this build \u2014 the pull-request search needs the GitHub API, which this build could not reach. The scheduled build fills it in.'
        : 'None yet. This list fills itself the moment one lands.'))
      return
    }
    const frag = document.createDocumentFragment()
    for (const p of prs) frag.append(logItem(day(p.mergedAt), 'merged', p.title, p.url, p.repo))
    list.replaceChildren(frag)
  }

  /* ── packages ──────────────────────────────────────────────────────── */

  function renderPackages (feed) {
    const host = $('#pkgs')
    if (!host) return
    const pkgs = feed.packages || []
    if (!pkgs.length) {
      host.replaceChildren(el('p', 'empty',
        'No packages registered. Add a name to pypiPackages or npmPackages in config.json and this fills in on the next build — version, release date and live download counts.'))
      return
    }
    const frag = document.createDocumentFragment()
    for (const p of pkgs) {
      const a = el('a', 'pkg')
      a.href = p.registryUrl; a.rel = 'noopener'

      const left = el('span')
      const name = el('span', 'pkg__name', p.name)
      name.append(el('span', 'pkg__reg', p.registry))
      left.append(name)
      if (p.summary) left.append(el('span', 'pkg__sum', p.summary))
      const line = [p.version && 'v' + p.version, p.releaseCount && p.releaseCount + (p.releaseCount === 1 ? ' release' : ' releases'), p.releasedAt && day(p.releasedAt)]
        .filter(Boolean).join('  ·  ')
      if (line) left.append(el('span', 'pkg__sum', line))
      a.append(left)

      const dl = el('span', 'pkg__dl')
      const n = p.downloads?.month ?? p.downloads?.week
      if (n == null) {
        dl.append(el('b', null, '—'))
        dl.append(el('span', null, 'downloads pending'))
      } else {
        dl.append(el('b', null, num(n)))
        dl.append(el('span', null, p.downloads?.month != null ? 'downloads / month' : 'downloads / week'))
      }
      a.append(dl)

      frag.append(a)
    }
    host.replaceChildren(frag)
  }

  /* ── papers ────────────────────────────────────────────────────────── */

  function renderPapers (feed) {
    const byDoi = new Map((feed.citations || []).map(c => [c.doi.toLowerCase(), c]))
    for (const li of $$('.papers li')) {
      const cite = $('.papers__cite', li)
      if (!cite) continue
      const doi = li.dataset.doi
      if (doi && byDoi.has(doi.toLowerCase())) {
        const c = byDoi.get(doi.toLowerCase())
        $('.c', cite).textContent = num(c.citations)
        $('em', cite).textContent = 'Crossref'
      } else if (li.dataset.scholar != null) {
        $('.c', cite).textContent = num(Number(li.dataset.scholar))
        $('em', cite).textContent = 'Scholar'
      }
    }

    const s = feed.scholar
    if (!s) return
    for (const node of $$('[data-scholar-stat]')) {
      const k = node.dataset.scholarStat
      node.textContent = k === 'capturedAt' ? (s.capturedAt || '—') : num(s[k])
    }
  }

  /* ── boot ──────────────────────────────────────────────────────────── */

  function render (feed) {
    renderTicker(feed)
    renderStats(feed)
    renderRepos(feed)
    renderLog(feed)
    renderPRs(feed)
    renderPackages(feed)
    renderPapers(feed)
  }

  function fail (message) {
    const track = $('#ticker-track')
    if (track) track.replaceChildren(el('span', 'ticker__item ticker__item--wait', message))
    $('#synced') && ($('#synced').textContent = 'Feed unavailable')
    for (const n of $$('.tbl__wait, .log__wait')) n.textContent = '—'
  }

  // The single-file build inlines the feed here, so the page also works from a
  // file:// URL where fetch() is blocked.
  const inlined = () => {
    const node = document.getElementById('feed')
    if (!node) return null
    try { return JSON.parse(node.textContent) } catch { return null }
  }

  async function load () {
    try {
      const res = await fetch('data/feed.json?t=' + Math.floor(Date.now() / 300000), { cache: 'no-cache' })
      if (!res.ok) throw new Error(res.status)
      render(await res.json())
    } catch (e) {
      const local = inlined()
      if (local) { render(local); return }
      console.warn('feed unavailable', e)
      fail('Index unavailable — the feed did not load.')
    }
  }

  load()

  // If the tab stays open, pick up the next scheduled build without a reload.
  setInterval(() => { if (!document.hidden) load() }, 5 * 60 * 1000)
})()
