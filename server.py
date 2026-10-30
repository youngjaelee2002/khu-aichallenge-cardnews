"""카드뉴스 제작기 로컬 서버.

- http://localhost:8765 에서 웹 제작기(index.html)를 연다.
- 웹이 POST /api/job 으로 카드뉴스를 보내면 보관해 두고,
  피그마 플러그인이 GET /api/job?after=<id> 로 새 작업을 가져가 바로 만든다.
"""
import http.server
import json
import os
import threading
import webbrowser
from urllib.parse import parse_qs, urlparse

PORT = 8765
ROOT = os.path.dirname(os.path.abspath(__file__))

job = {"id": 0, "body": None}
lock = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        if self.path.startswith("/api/"):
            # 플러그인 화면은 출처가 null이라 CORS 허용이 필요하다
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Cache-Control", "no-store")
        else:
            # 파일을 고친 뒤 브라우저가 예전 사본을 보여 주지 않도록 매번 확인하게 한다
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, raw: bytes, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/status":
            with lock:
                return self.send_json(json.dumps({"lastId": job["id"]}).encode())
        if url.path == "/api/job":
            after = int(parse_qs(url.query).get("after", ["0"])[0] or 0)
            with lock:
                current_id, body = job["id"], job["body"]
            if body is None or current_id <= after:
                self.send_response(204)
                self.end_headers()
                return
            return self.send_json(b'{"id":%d,"data":' % current_id + body + b"}")
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/job":
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            json.loads(body)
        except ValueError:
            self.send_error(400, "JSON이 아닙니다")
            return
        with lock:
            job["id"] += 1
            job["body"] = body
            new_id = job["id"]
        print(f"[피그마로 보내기] 작업 #{new_id} 받음 ({len(body) // 1024} KB)")
        self.send_json(json.dumps({"id": new_id}).encode())

    def log_message(self, fmt, *args):
        # 플러그인이 계속 확인하는 요청은 화면에 찍지 않는다
        if "/api/" not in self.path:
            super().log_message(fmt, *args)


def main():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}/"
    print(f"카드뉴스 제작기: {url}")
    print("이 창을 닫으면 웹 제작기와 피그마 자동 연결이 멈춥니다.")
    if os.environ.get("CARDNEWS_NO_BROWSER") != "1":
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
