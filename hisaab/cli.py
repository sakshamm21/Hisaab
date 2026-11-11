"""The `hisaab` command: start the app and open it in the browser (or its own window).

    hisaab                  start with your data and open the browser
    hisaab --demo           explore with sample data, kept apart from yours
    hisaab --window         open in a desktop window (pip install 'hisaab[window]')
    hisaab backup           save a backup now and print where it went
"""

from __future__ import annotations

import argparse
import socket
import threading
import time
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
    parser = argparse.ArgumentParser(prog="hisaab", description="Hisaab: a local-first personal finance tracker.")
    parser.add_argument("--version", action="version", version=f"hisaab {__version__}")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="port (default 8765)")
    parser.add_argument("--host", default=DEFAULT_HOST, help="address to listen on (default 127.0.0.1, this computer only)")
    parser.add_argument("--data-dir", help="folder for the database and backups")
    parser.add_argument("--demo", action="store_true", help="explore with fresh sample data (kept apart from your real data)")
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser")
    parser.add_argument("--window", action="store_true", help="open in a desktop window instead of the browser (needs hisaab[window])")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("backup", help="save a backup of your data now")
    return parser


def _backup(args) -> None:
    from hisaab.backup import create_backup

    db_path = database_path(data_dir(args.data_dir))
    if not db_path.exists():
        raise SystemExit(f"No data yet at {db_path}. Run `hisaab` first.")
    print(create_backup(db_path, "manual"))


def _window(url: str, server: uvicorn.Server) -> None:
    try:
        import webview
    except ImportError as exc:
        raise SystemExit("Window mode needs pywebview:  pip install 'hisaab[window]'  (or run without --window)") from exc
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)
    webview.create_window("Hisaab", url, width=1360, height=900, min_size=(380, 600))
    webview.start()
    server.should_exit = True


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    if args.command == "backup":
        return _backup(args)

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

    server = uvicorn.Server(uvicorn.Config(app, host=args.host, port=port, log_level="warning"))
    if args.window:
        return _window(url, server)
    if not args.no_browser:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    server.run()


if __name__ == "__main__":
    main()
