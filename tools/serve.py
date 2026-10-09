"""Local preview server for the workshop: like `python3 -m http.server`, but never cached.

Usage: python3 tools/serve.py [port]   (serves the repo root on 127.0.0.1)
"""
import functools
import http.server
import pathlib
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = pathlib.Path(__file__).resolve().parent.parent
handler = functools.partial(NoCacheHandler, directory=str(root))
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
