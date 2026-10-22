"""Local server for Neon Skyway.

Same as `python -m http.server`, but tells the browser not to cache the game files,
so a normal refresh always loads the latest version.

    python serve.py          -> http://localhost:5173
    python serve.py 8080     -> http://localhost:8080
"""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *args):
        pass  # keep the terminal quiet


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('', PORT), handler) as httpd:
        print(f'Neon Skyway running at http://localhost:{PORT}  (Ctrl+C to stop)')
        httpd.serve_forever()
