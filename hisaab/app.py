"""The FastAPI application: JSON API under /api, and the built React UI everywhere else."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from hisaab import __version__
from hisaab.api import router as api_router
from hisaab.config import STATIC_DIR
from hisaab.db import open_database

UI_MISSING = """<!doctype html><meta charset="utf-8"><title>Hisaab</title>
<body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>Hisaab is running, but the UI isn't built</h1>
<p>The API works at <a href="/api/meta">/api/meta</a>. To build the interface, run:</p>
<pre>cd web &amp;&amp; npm install &amp;&amp; npm run build</pre>
<p>For UI development, run <code>npm run dev</code> in <code>web/</code> instead.</p></body>"""


def create_app(db_path: Path, demo: bool = False, static_dir: Path = STATIC_DIR) -> FastAPI:
    open_database(db_path).close()  # migrate and seed once at startup

    app = FastAPI(title="Hisaab", version=__version__, docs_url="/api/docs", redoc_url=None,
                  openapi_url="/api/openapi.json")
    app.state.db_path = db_path
    app.state.demo = demo
    app.include_router(api_router)

    index = static_dir / "index.html"
    if (static_dir / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def ui(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        if not index.exists():
            return HTMLResponse(UI_MISSING)
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
            return FileResponse(candidate)
        return FileResponse(index)  # client-side routes

    return app
