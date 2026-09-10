/**
 * AYUMU MONKEY TEST – server.js
 * Запуск: node server.js
 * Открыть: http://localhost:3000
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = 3000;
const DIR     = __dirname;
const LB_FILE = path.join(DIR, 'leaderboard.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.json': 'application/json',
  '.ico' : 'image/x-icon',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // GET /api/leaderboard
  if (req.method === 'GET' && req.url === '/api/leaderboard') {
    if (!fs.existsSync(LB_FILE)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
      return;
    }
    fs.readFile(LB_FILE, 'utf8', (err, data) => {
      if (err) { res.writeHead(500); res.end('Server error'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
    return;
  }

  // POST /api/leaderboard
  if (req.method === 'POST' && req.url === '/api/leaderboard') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const pretty = JSON.stringify(parsed, null, 2);
        fs.writeFile(LB_FILE, pretty, 'utf8', (err) => {
          if (err) { res.writeHead(500); res.end('Write error'); return; }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
      } catch {
        res.writeHead(400); res.end('Invalid JSON');
      }
    });
    return;
  }

  const urlPath  = req.url.split('?')[0];
  const filePath = path.join(DIR, urlPath === '/' ? 'index.html' : urlPath);

  if (!filePath.startsWith(DIR)) { res.writeHead(403); res.end(); return; }

  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🐵  Тест Аюму // Monkey Benchmark запущен!');
  console.log(`  👉  Открой в браузере: http://localhost:${PORT}`);
  console.log('');
  console.log('  Лидерборд сохраняется в leaderboard.json');
  console.log('  Ctrl+C для остановки');
  console.log('');
});