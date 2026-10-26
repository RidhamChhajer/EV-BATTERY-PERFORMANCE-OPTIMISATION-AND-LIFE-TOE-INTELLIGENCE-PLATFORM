"""Serve the removable frontend on localhost; the prediction backend stays separate."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class FrontendHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        frontend = Path(self.directory).resolve()
        target = Path(super().translate_path(path)).resolve()
        examples = frontend / 'examples'
        if target.is_relative_to(examples):
            relative = target.relative_to(examples)
            if len(relative.parts) == 1 and relative.name.endswith('_request.json'):
                return str(frontend.parent / 'examples' / relative)
        return str(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5173)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Choose a port from 1 to 65535.')
    handler = partial(FrontendHandler, directory=str(Path(__file__).resolve().parent))
    try:
        with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
            print(f'Frontend ready at http://127.0.0.1:{args.port}; Ctrl+C stops it.', flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        parser.exit(1, f'Cannot start the frontend: {error}. Choose another port if it is occupied.\n')


if __name__ == '__main__':
    main()
