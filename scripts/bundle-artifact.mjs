#!/usr/bin/env node
/**
 * Emits dist/artifact.html — the same page, shaped for a claude.ai Artifact.
 *
 * Artifacts supply their own <!doctype>/<html>/<head>/<body>, so this strips
 * ours and hands over just the content. Google Fonts is the one external host
 * the Artifact CSP allows, so that <link> survives; everything else is already
 * inlined by bundle-preview.mjs.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = await readFile(resolve(ROOT, 'dist/preview.html'), 'utf8')

const pick = (re, label) => {
  const m = src.match(re)
  if (!m) throw new Error(`bundle-artifact: could not find ${label}`)
  return m[0]
}

const title  = pick(/<title>[\s\S]*?<\/title>/, 'title')
const fonts  = pick(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, 'font link')
const style  = pick(/<style>[\s\S]*?<\/style>/, 'inline stylesheet')
const boot   = pick(/<script>\s*\/\/ Dark is opt-in[\s\S]*?<\/script>/, 'theme bootstrap')
const body   = pick(/<body>[\s\S]*<\/body>/, 'body')
  .replace(/^<body>\n?/, '')
  .replace(/\n?<\/body>$/, '')

const out = [title, fonts, style, boot, body].join('\n')

await mkdir(resolve(ROOT, 'dist'), { recursive: true })
await writeFile(resolve(ROOT, 'dist/artifact.html'), out)

for (const bad of ['<!doctype', '<html', '</html>', '<head>', '<body>']) {
  if (out.toLowerCase().includes(bad)) throw new Error(`bundle-artifact: ${bad} leaked into the output`)
}
console.log(`✓ dist/artifact.html — ${(out.length / 1024).toFixed(0)} KB, no page skeleton`)
