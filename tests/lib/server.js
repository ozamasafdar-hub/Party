import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A static file server, written out rather than pulled in.
 *
 * The suite used to reach for `npx http-server`, which means the tests
 * cannot run without network and npm. Forty lines removes that: the
 * regression suite should depend on nothing it does not already need to
 * build the app.
 */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
}

/** Resolves once the port is listening. Returns { url, close }. */
export function serve(root, port) {
  const dir = path.resolve(root)

  const server = http.createServer((req, res) => {
    // The query string is how the app switches demo/live; strip it for the
    // file lookup or every ?demo request 404s
    let rel = decodeURIComponent((req.url || '/').split('?')[0])
    if (rel.endsWith('/')) rel += 'index.html'

    // Keep the response inside the served directory whatever the request says
    const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''))
    if (!file.startsWith(dir)) {
      res.writeHead(403).end('forbidden')
      return
    }

    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
        return
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        // A stale bundle between specs would be maddening to debug
        'cache-control': 'no-store'
      }).end(body)
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done))
      })
    )
  })
}
