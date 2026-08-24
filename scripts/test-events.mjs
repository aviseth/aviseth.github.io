#!/usr/bin/env node
/** Fixture test for the events mapper. Run: node scripts/test-events.mjs */

import { mapEvents, eventsFromPushes } from './lib/events.mjs'
import assert from 'node:assert/strict'

// Shapes taken from the documented GitHub events payloads.
const fixture = [
  { type: 'PushEvent', created_at: '2026-08-24T09:10:00Z', repo: { name: 'aviseth/importcost' },
    payload: { size: 3, commits: [{ sha: 'a1', message: 'wip' }, { sha: 'b2', message: 'lazy imports for PEP 810\n\nbody' }] } },
  { type: 'PullRequestEvent', created_at: '2026-08-23T18:00:00Z', repo: { name: 'pallets/flask' },
    payload: { action: 'closed', pull_request: { merged: true, title: 'Fix cli typo', html_url: 'https://github.com/pallets/flask/pull/1' } } },
  { type: 'PullRequestEvent', created_at: '2026-08-23T17:00:00Z', repo: { name: 'psf/requests' },
    payload: { action: 'closed', pull_request: { merged: false, title: 'Rejected', html_url: 'https://github.com/psf/requests/pull/2' } } },
  { type: 'ReleaseEvent', created_at: '2026-08-24T08:00:00Z', repo: { name: 'aviseth/portalkit' },
    payload: { release: { tag_name: 'v0.1.1', html_url: 'https://github.com/aviseth/portalkit/releases/tag/v0.1.1' } } },
  { type: 'IssuesEvent', created_at: '2026-08-22T10:00:00Z', repo: { name: 'aviseth/flakerate' },
    payload: { action: 'opened', issue: { title: 'Quarantine expiry is off by one', html_url: 'https://github.com/aviseth/flakerate/issues/4' } } },
  { type: 'CreateEvent', created_at: '2026-08-20T10:00:00Z', repo: { name: 'aviseth/flakerate' }, payload: { ref_type: 'repository' } },
  { type: 'CreateEvent', created_at: '2026-08-20T10:00:00Z', repo: { name: 'aviseth/flakerate' }, payload: { ref_type: 'branch' } },
  { type: 'PushEvent', created_at: '2026-08-19T10:00:00Z', repo: { name: 'aviseth/x' }, payload: { size: 0, commits: [] } },
  { type: 'ForkEvent', created_at: '2026-08-18T10:00:00Z', repo: { name: 'aviseth/y' }, payload: {} }
]

const got = mapEvents(fixture)
const kinds = got.map(e => e.kind)

assert.deepEqual(kinds, ['push', 'pr-merged', 'pr-closed', 'release', 'issue-opened', 'repo-created'],
  'unexpected kinds: ' + kinds.join(','))
assert.equal(got[0].title, 'lazy imports for PEP 810', 'push title should be the head commit subject only')
assert.equal(got[0].count, 3, 'push count should come from payload.size, not the truncated commit array')
assert.equal(got[0].url, 'https://github.com/aviseth/importcost/commit/b2', 'push should deep-link the head commit')
assert.equal(got[1].url, 'https://github.com/pallets/flask/pull/1')
assert.equal(got[3].title, 'v0.1.1')
assert.equal(got[5].repo, 'flakerate')

const derived = eventsFromPushes([
  { name: 'old', url: 'u', pushedAt: '2025-01-01T00:00:00Z' },
  { name: 'new', url: 'u', pushedAt: '2026-08-24T00:00:00Z' },
  { name: 'never', url: 'u', pushedAt: null }
])
assert.deepEqual(derived.map(d => d.repo), ['new', 'old'], 'derived events sort newest first and drop nulls')
assert.equal(derived[0].derived, true)

console.log(`✓ events mapper: ${got.length} events from ${fixture.length} raw, all assertions pass`)
