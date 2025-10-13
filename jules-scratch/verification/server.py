
import http.server
import socketserver

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    pass

Handler.extensions_map['.js'] = 'application/javascript'

httpd = socketserver.ThreadingTCPServer(("", PORT), Handler)

print("serving at port", PORT)
httpd.serve_forever()
