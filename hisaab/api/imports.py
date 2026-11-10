"""Statement import. The file is sent as the raw request body (no multipart dependency needed)."""

import json
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from hisaab.api.deps import DB
from hisaab.importer import service
from hisaab.importer.csv_import import MappingNeeded

router = APIRouter(tags=["imports"])

MAX_BYTES = 20 * 1024 * 1024


@router.post("/imports/preview")
async def preview_import(
    request: Request,
    db: DB,
    account_id: int,
    filename: str,
    mapping: Annotated[str | None, Query(description="JSON {date, description, amount|withdrawal+deposit, balance}")] = None,
) -> dict:
    if not db.execute("SELECT 1 FROM accounts WHERE id = ?", (account_id,)).fetchone():
        raise HTTPException(422, "Pick an account to import into")
    data = await request.body()
    if not data:
        raise HTTPException(422, "The file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "That file is larger than 20 MB")
    try:
        parsed = service.parse_file(data, filename, json.loads(mapping) if mapping else None)
    except MappingNeeded as exc:
        raise HTTPException(422, {"message": str(exc), "columns": exc.columns}) from exc
    except service.UnsupportedFile as exc:
        raise HTTPException(415, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not parsed.rows:
        raise HTTPException(422, "No transactions found in that file")
    return service.preview(db, account_id, parsed)


class CommitIn(BaseModel):
    account_id: int
    filename: str
    format: str
    period: list[str] | None = None
    rows: list[dict]


@router.post("/imports/commit", status_code=201)
def commit_import(body: CommitIn, db: DB) -> dict:
    return service.commit(db, body.account_id, body.filename, body.format, body.period, body.rows)


@router.get("/imports")
def list_imports(db: DB) -> list[dict]:
    return [dict(r) for r in db.execute(
        "SELECT i.*, a.name AS account FROM imports i JOIN accounts a ON a.id = i.account_id"
        " ORDER BY i.created_at DESC, i.id DESC")]


@router.delete("/imports/{import_id}")
def undo_import(import_id: int, db: DB) -> dict:
    if not db.execute("SELECT 1 FROM imports WHERE id = ?", (import_id,)).fetchone():
        raise HTTPException(404, "Import not found")
    return {"removed": service.undo(db, import_id)}
