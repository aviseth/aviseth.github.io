/**
 * Turns the GitHub public-events stream into the flat shape the page renders.
 * Split out from the builder so it can be tested against a fixture without a
 * network call — see scripts/test-events.mjs.
 */

export const EVENT_LABEL = {
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

export function mapEvents (raw = []) {
  const out = []
  for (const e of raw) {
    const full = e.repo?.name || ''
    const repo = full.split('/')[1] || full
    const base = { repo, at: e.created_at, url: `https://github.com/${full}` }

    switch (e.type) {
      case 'PushEvent': {
        const commits = e.payload?.commits || []
        if (!commits.length) break
        const head = commits[commits.length - 1]
        out.push({
          ...base,
          kind: 'push',
          count: e.payload.size ?? commits.length,
          title: (head?.message || '').split('\n')[0].slice(0, 90),
          url: head?.sha ? `https://github.com/${full}/commit/${head.sha}` : base.url
        })
        break
      }
      case 'PullRequestEvent': {
        const pr = e.payload?.pull_request
        const action = e.payload?.action
        if (action === 'closed' && !pr?.merged) { out.push({ ...base, kind: 'pr-closed', title: pr?.title?.slice(0, 90), url: pr?.html_url || base.url }); break }
        out.push({
          ...base,
          kind: pr?.merged ? 'pr-merged' : `pr-${action}`,
          title: pr?.title?.slice(0, 90),
          url: pr?.html_url || base.url
        })
        break
      }
      case 'IssuesEvent':
        out.push({ ...base, kind: `issue-${e.payload?.action}`, title: e.payload?.issue?.title?.slice(0, 90), url: e.payload?.issue?.html_url || base.url })
        break
      case 'ReleaseEvent':
        out.push({ ...base, kind: 'release', title: e.payload?.release?.tag_name || e.payload?.release?.name, url: e.payload?.release?.html_url || base.url })
        break
      case 'CreateEvent':
        if (e.payload?.ref_type === 'repository') out.push({ ...base, kind: 'repo-created', title: repo })
        break
      case 'WatchEvent':
        out.push({ ...base, kind: 'starred', title: full })
        break
    }
  }
  return out
}

/**
 * Fallback when the events API is out of reach: a coarse but real activity log
 * derived from each repository's last push time. Marked `derived` so the page
 * can say where it came from rather than pretending it is the commit feed.
 */
export function eventsFromPushes (repos = [], limit = 20) {
  return [...repos]
    .filter(r => r.pushedAt)
    .sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt))
    .slice(0, limit)
    .map(r => ({ kind: 'push', repo: r.name, at: r.pushedAt, url: r.url, derived: true }))
}
