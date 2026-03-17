#!/bin/bash
cd "$(dirname "$0")" && python3 -c "
import http.server, socketserver, os
os.chdir('$(pwd)')
handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(('', 8899), handler) as httpd:
    httpd.serve_forever()
"
