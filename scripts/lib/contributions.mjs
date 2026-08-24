/**
 * Work done in other people's repositories.
 *
 * The GitHub search API is the only way to find this, and a single query for
 * merged PRs misses most of it — an open PR under review, an issue that made a
 * maintainer change something, a code review you gave. All four count as
 * contribution; only the first is a merge.
 *
 * Split from the builder so the shaping is testable without a network call.
 */

// `-user:{login}` drops your own repositories. Extra owners are dropped too,
// so employer orgs do not get counted as "other people's projects".
export function searchQueries (login, excludeOwners = [], excludeRepos = []) {
  // `-repo:` drops specific repositories: coursework, tutorial forks, anything
  // where the merge says nothing about the work. A star floor would be cruder —
  // a real one-star project still counts, a class exercise never does.
  const not = [
    '-user:' + login,
    ...excludeOwners.map(o => '-user:' + o),
    ...excludeRepos.map(r => '-repo:' + r)
  ].join(' ')
  return [
    { kind: 'merged',   q: `author:${login} type:pr is:merged ${not}` },
    { kind: 'open-pr',  q: `author:${login} type:pr is:open ${not}` },
    { kind: 'review',   q: `reviewed-by:${login} type:pr -author:${login} ${not}` },
    { kind: 'issue',    q: `author:${login} type:issue ${not}` }
  ]
}

export const KIND_LABEL = {
  merged: 'merged',
  'open-pr': 'in review',
  review: 'reviewed',
  issue: 'issue'
}

// Sort key: a merge into a big project is the strongest signal, an issue on a
// small one the weakest. Stars break ties within a kind; recency breaks the rest.
const RANK = { merged: 0, review: 1, 'open-pr': 2, issue: 3 }

export function normalise (items = [], kind) {
  return items.map(i => ({
    kind,
    title: i.title,
    url: i.html_url,
    repo: (i.repository_url || '').replace('https://api.github.com/repos/', ''),
    number: i.number,
    at: i.pull_request?.merged_at || i.closed_at || i.created_at,
    state: i.state
  })).filter(x => x.repo)
}

export function rank (list = []) {
  return [...list].sort((a, b) =>
    (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) ||
    (b.repoStars ?? 0) - (a.repoStars ?? 0) ||
    new Date(b.at) - new Date(a.at)
  )
}

/** Dedupe: the same PR can surface in more than one query. */
export function dedupe (list = []) {
  const seen = new Map()
  for (const c of list) {
    const key = c.url
    const existing = seen.get(key)
    if (!existing || (RANK[c.kind] ?? 9) < (RANK[existing.kind] ?? 9)) seen.set(key, c)
  }
  return [...seen.values()]
}

/** Headline for the section: "6 merged into 4 projects". */
export function summarise (list = []) {
  const merged = list.filter(c => c.kind === 'merged')
  return {
    total: list.length,
    merged: merged.length,
    projects: new Set(merged.map(c => c.repo)).size,
    reach: merged.reduce((s, c) => s + (c.repoStars || 0), 0)
  }
}
