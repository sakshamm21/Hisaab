"""The `hisaab` command: start the app and open it in the browser."""

from __future__ import annotations

import argparse
import socket
import threading
import webbrowser

import uvicorn

from hisaab import __version__
from hisaab.config import DEFAULT_HOST, DEFAULT_PORT, data_dir, database_path


def _free_port(host: str, preferred: int, tries: int = 10) -> int:
    for port in range(preferred, preferred + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex((host, port)) != 0:
                return port
    raise SystemExit(f"Ports {preferred}-{preferred + tries - 1} are all busy. Pass --port.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hisaab", description="Hisaab: a local-first personal finance tracker."
    )
    parser.add_argument("--version", action="version", version=f"hisaab {__version__}")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="port (default 8765)")
    parser.add_argument("--host", default=DEFAULT_HOST,
                        help="address to listen on (default 127.0.0.1, this computer only)")
    parser.add_argument("--data-dir", help="folder for the database and backups")
    parser.add_argument("--demo", action="store_true",
                        help="explore with fresh sample data (kept apart from your real data)")
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    folder = data_dir(args.data_dir)
    db_path = database_path(folder, demo=args.demo)

    if args.demo:
        from hisaab.db import open_database
        from hisaab.demo import generate_demo

        for suffix in ("", "-wal", "-shm"):
            db_path.with_name(db_path.name + suffix).unlink(missing_ok=True)
        conn = open_database(db_path)
        generate_demo(conn)
        conn.close()

    from hisaab.app import create_app

    app = create_app(db_path, demo=args.demo)
    port = _free_port(args.host, args.port)
    url = f"http://{'127.0.0.1' if args.host in ('0.0.0.0', '::') else args.host}:{port}"

    print(f"\n  Hisaab {__version__}{'  (demo data)' if args.demo else ''}")
    print(f"  Open      {url}")
    print(f"  Data      {db_path}")
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print("  Warning   listening beyond this computer; anyone on your network can reach it.")
    print("  Stop      Ctrl+C\n")

    if not args.no_browser:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    uvicorn.run(app, host=args.host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
