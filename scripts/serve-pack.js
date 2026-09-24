#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const fsp = require('fs/promises');

const root = path.resolve(process.env.ETERNAL_PACK_DIR || path.join(process.cwd(), 'pack-dist'));
const port = Number(process.env.ETERNAL_PACK_PORT || 4174);

function safe(relative) {
  const target = path.resolve(root, relative.replace(/^\/+/, ''));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('invalid path');
  return target;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const file = safe(decodeURIComponent(url.pathname));
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not file');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', url.pathname.includes('/channel/') ? 'no-cache' : 'public, max-age=31536000, immutable');
    if (file.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    else res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(file).pipe(res);
  } catch (_) {
    res.statusCode = 404;
    res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`ETERNAL PACK DEV SERVER: http://127.0.0.1:${port}/channel/stable.json`);
  console.log(`Sirviendo: ${root}`);
});
