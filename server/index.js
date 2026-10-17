// index.js
// Owner: Person 4 (Back-End B). Written by Claude.
//
// The server for the live website. GoDaddy Node.js Hosting runs `npm start`, which runs this file.
// It does two jobs:
//   1. Sends the built app from dist/ (made by `npm run build`) to the browser.
//   2. Answers POST /api/insight with Gemini, using the GEMINI_API_KEY setting.
// On your own computer, keep using `npm run dev` while you edit.

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInsightHandler } from './insightApi.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')

// Reads the key from a .env or .env.local file if there is one.
// Settings that are already set (for example by GoDaddy) win over the files.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(join(ROOT, file))
  } catch {
    // No file, that is fine.
  }
}

const PORT = Number(process.env.PORT) || 3000

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html is missing. Run `npm run build` first.')
  process.exit(1)
}

const insight = createInsightHandler(process.env)

function sendFile(res, file) {
  res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream')
  // Files in dist/assets have a fingerprint in their name, so browsers can keep them for a year.
  const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'
  res.setHeader('Cache-Control', cache)
  createReadStream(file).pipe(res)
}

createServer((req, res) => {
  let path
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    res.statusCode = 400
    return res.end('Bad request')
  }

  if (path === '/api/insight') return insight(req, res)

  // The startsWith check stops tricks like /../server/insightApi.js from reading files outside dist/.
  const file = normalize(join(DIST, path))
  if (file.startsWith(DIST + sep) && existsSync(file) && statSync(file).isFile()) return sendFile(res, file)

  // Any other address gets the app itself.
  sendFile(res, join(DIST, 'index.html'))
}).listen(PORT, () => {
  console.log(`StudyBuddy is running on port ${PORT}`)
  if (!process.env.GEMINI_API_KEY) console.log('GEMINI_API_KEY is not set, so the app will use template insights.')
})
