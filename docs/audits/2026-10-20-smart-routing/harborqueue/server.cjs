'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { HarborQueue } = require('./scheduler.cjs');

function createServer({ queue, indexFile = path.join(__dirname, 'index.html') }) {
  if (!queue || typeof queue.snapshot !== 'function') throw new TypeError('queue must expose snapshot()');
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed\n');
      return;
    }
    if (url.pathname === '/api/state') {
      const body = `${JSON.stringify(queue.snapshot())}\n`;
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(body),
      });
      response.end(body);
      return;
    }
    if (url.pathname === '/') {
      fs.readFile(indexFile, (error, body) => {
        if (error) {
          response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Dashboard unavailable\n');
          return;
        }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
        response.end(body);
      });
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found\n');
  });
}

if (require.main === module) {
  const portText = process.argv[2] || process.env.PORT || '3000';
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    console.error(`Invalid port: ${portText}`);
    process.exitCode = 1;
  } else {
    const file = path.resolve(process.env.HARBOR_QUEUE_FILE || 'harborqueue-state.json');
    const queue = new HarborQueue({
      file,
      run: async () => { throw new Error('The dashboard server has no job executor'); },
    });
    const server = createServer({ queue });
    server.listen(port, () => {
      const address = server.address();
      console.log(`HarborQueue dashboard: http://localhost:${address.port}`);
    });
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      server.close(async () => {
        await queue.close();
      });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
}

module.exports = { createServer };
