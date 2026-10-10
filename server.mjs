/**
 * Multi-Device Real-Time Sync & Telemetry Server for Wait & Return
 * Zero-dependency Node.js standard library (http, fs, path, url).
 * Supports Server-Sent Events (SSE), multi-phone trip synchronization,
 * and live GPS coordinate broadcasting between Rider and Driver.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------------------
// IN-MEMORY SHARED PILOT TRIP STATE & SSE SUBSCRIBERS
// ---------------------------------------------------------------------------
let sharedTripState = null;
let sharedTelemetry = {
  lat: 33.7815,
  lng: -84.3830,
  speed: 24,
  heading: 45,
  accuracy: 4,
  odometerMiles: 0.0,
  timestamp: new Date().toLocaleTimeString(),
};

const sseClients = new Set();

function broadcastToClients(payload) {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP REQUEST ROUTER
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  // CORS Headers for multi-device network testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 1. SSE Stream Endpoint: /api/trip/events
  if (pathname === '/api/trip/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({ type: 'INIT', state: sharedTripState, telemetry: sharedTelemetry })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 2. REST API: Get Current State
  if (pathname === '/api/trip/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, state: sharedTripState, telemetry: sharedTelemetry }));
    return;
  }

  // 3. REST API: Update Shared State
  if (pathname === '/api/trip/state' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        sharedTripState = { ...(sharedTripState || {}), ...data };
        broadcastToClients({ type: 'STATE_UPDATE', state: sharedTripState, telemetry: sharedTelemetry });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, state: sharedTripState }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 4. REST API: Live Driver Telemetry Stream
  if (pathname === '/api/driver/telemetry' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const coords = JSON.parse(body || '{}');
        sharedTelemetry = { ...sharedTelemetry, ...coords, timestamp: new Date().toLocaleTimeString() };
        broadcastToClients({ type: 'TELEMETRY_UPDATE', telemetry: sharedTelemetry });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, telemetry: sharedTelemetry }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 5. Driver direct shortcut: /driver -> serves index.html with driver mode flag
  if (pathname === '/driver') {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    fs.readFile(indexPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
    return;
  }

  // 6. Static File Serving
  let reqPath = pathname;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (indexErr, data) => {
        if (indexErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

const PORT = Number(process.env.PORT) || 4242;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`\n============================================================`);
  console.log(`🚗 WAIT & RETURN // MULTI-DEVICE PILOT SYNC SERVER RUNNING`);
  console.log(`• Local Desktop / Simulator: http://localhost:${PORT}`);
  console.log(`• Rider Console Link:        http://localhost:${PORT}/?mode=rider`);
  console.log(`• Driver Dashboard Link:     http://localhost:${PORT}/driver`);
  console.log(`• Real-Time Sync & Telemetry: SSE Stream Active (/api/trip/events)`);
  console.log(`• Network Accessible:        http://0.0.0.0:${PORT}`);
  console.log(`============================================================\n`);
});
