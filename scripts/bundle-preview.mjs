#!/usr/bin/env node
/**
 * Bundles the site into one self-contained file at dist/preview.html.
 *
 * Why: the real site fetches data/feed.json at runtime, which browsers refuse
 * to do from a file:// URL. This flattens everything — stylesheet, script and
 * the current feed — into a single document you can double-click, email, or
 * publish anywhere. The multi-file version stays the source of truth.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = f => readFile(resolve(ROOT, f), 'utf8')

const [html, css, js, feed] = await Promise.all([
  read('index.html'), read('assets/style.css'), read('assets/app.js'), read('data/feed.json')
])

// Replacer FUNCTIONS, not strings: `$$` in a replacement string is a literal
// `$`, which silently turns this file's `$$` helper into `$` and breaks it.
const sub = (s, find, value) => s.replace(find, () => value)

let out = html
out = sub(out, '<link rel="stylesheet" href="assets/style.css">', `<style>\n${css}\n</style>`)
out = sub(out, '<script src="assets/app.js"></script>',
  `<script type="application/json" id="feed">${feed.replace(/</g, () => '\\u003c')}</script>\n<script>\n${js}\n</script>`)
out = sub(out, '<a href="data/feed.json">Raw feed</a>',
  '<a href="https://github.com/aviseth/aviseth.fyi/blob/main/data/feed.json">Raw feed</a>')

await mkdir(resolve(ROOT, 'dist'), { recursive: true })
await writeFile(resolve(ROOT, 'dist/preview.html'), out)
console.log(`✓ dist/preview.html — ${(out.length / 1024).toFixed(0)} KB, self-contained`)
