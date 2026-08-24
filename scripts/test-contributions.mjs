#!/usr/bin/env node
import { searchQueries, normalise, rank, dedupe, summarise, dropPrivate } from './lib/contributions.mjs'
import assert from 'node:assert/strict'

const qs = searchQueries('aviseth', ['Crispa-ai'], ['vtech-tut/github-tutorial'])
assert.equal(qs.length, 4)
assert.ok(qs[0].q.includes('-user:aviseth') && qs[0].q.includes('-user:Crispa-ai'), 'own and employer repos excluded')
assert.ok(qs[0].q.includes('-repo:vtech-tut/github-tutorial'), 'named repos excluded')
assert.ok(qs.every(x => x.q.includes('-repo:vtech-tut/github-tutorial')), 'exclusion applies to every search')
assert.ok(qs[2].q.includes('reviewed-by:aviseth') && qs[2].q.includes('-author:aviseth'), 'reviews exclude self-authored')

const raw = [
  { title: 'Fix cli typo', html_url: 'https://github.com/pallets/flask/pull/1', number: 1, state: 'closed',
    repository_url: 'https://api.github.com/repos/pallets/flask', pull_request: { merged_at: '2026-08-01T00:00:00Z' } },
  { title: 'No repo', html_url: 'x', number: 2, state: 'open', created_at: '2026-08-02T00:00:00Z' }
]
const n = normalise(raw, 'merged')
assert.equal(n.length, 1, 'items without a repository_url are dropped')
assert.equal(n[0].repo, 'pallets/flask')
assert.equal(n[0].at, '2026-08-01T00:00:00Z')

const mixed = [
  { kind: 'issue',   url: 'a', repo: 'r/1', repoStars: 9000, at: '2026-08-05T00:00:00Z' },
  { kind: 'merged',  url: 'b', repo: 'r/2', repoStars: 10,   at: '2026-08-01T00:00:00Z' },
  { kind: 'merged',  url: 'c', repo: 'r/3', repoStars: 5000, at: '2026-07-01T00:00:00Z' },
  { kind: 'open-pr', url: 'd', repo: 'r/4', repoStars: 100,  at: '2026-08-06T00:00:00Z' }
]
assert.deepEqual(rank(mixed).map(x => x.url), ['c', 'b', 'd', 'a'],
  'merges first, then by stars; issues last even when huge and recent')

const dup = dedupe([
  { kind: 'review', url: 'same', repo: 'r/1' },
  { kind: 'merged', url: 'same', repo: 'r/1' },
  { kind: 'issue',  url: 'other', repo: 'r/2' }
])
assert.equal(dup.length, 2, 'same URL collapses')
assert.equal(dup.find(d => d.url === 'same').kind, 'merged', 'the stronger kind wins')

const s = summarise([
  { kind: 'merged', repo: 'a/x', repoStars: 100 },
  { kind: 'merged', repo: 'a/x', repoStars: 100 },
  { kind: 'merged', repo: 'b/y', repoStars: 50 },
  { kind: 'issue',  repo: 'c/z', repoStars: 999 }
])
assert.deepEqual(s, { total: 4, merged: 3, projects: 2, reach: 250 },
  'projects counts distinct repos merged into; reach sums their stars')

const meta = new Map([
  ['acme/secret', { private: true }],
  ['pallets/flask', { private: false }],
  ['other/unknown', undefined]
])
const dp = dropPrivate([
  { repo: 'acme/secret', url: '1' },
  { repo: 'pallets/flask', url: '2' },
  { repo: 'no/metadata', url: '3' }
], meta)
assert.deepEqual(dp.kept.map(c => c.repo), ['pallets/flask', 'no/metadata'],
  'private dropped; unknown metadata kept rather than silently discarded')
assert.deepEqual(dp.removed, ['acme/secret'])

console.log('✓ contributions: queries, normalise, rank, dedupe, summarise all pass')
