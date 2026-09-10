"""
AYUMU MONKEY TEST – server.py
Запуск: python3 server.py
Открыть: http://localhost:3000
"""
import json, os, sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT    = 3000
LB_FILE = os.path.join(os.path.dirname(__file__), 'leaderboard.json')

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if int(args[1]) >= 400:
            super().log_message(fmt, *args)

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode()
        self.send_response(code)
        self.send_header('Content-Type',   'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/leaderboard':
            if os.path.exists(LB_FILE):
                with open(LB_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            else:
                data = []
            self.send_json(200, data)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/leaderboard':
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            try:
                entries = json.loads(body)
                with open(LB_FILE, 'w', encoding='utf-8') as f:
                    json.dump(entries, f, ensure_ascii=False, indent=2)
                self.send_json(200, {'ok': True})
            except Exception as e:
                self.send_json(400, {'error': str(e)})
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('', PORT), Handler)
    print()
    print('  🐵  Тест Аюму // Monkey Benchmark запущен!')
    print(f'  👉  Открой в браузере: http://localhost:{PORT}')
    print()
    print('  Лидерборд сохраняется в leaderboard.json')
    print('  Ctrl+C для остановки')
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Сервер остановлен.')
        sys.exit(0)