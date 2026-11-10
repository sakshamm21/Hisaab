"""Settings, backups and export."""

import csv
import io
import json
from datetime import date

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from hisaab import backup
from hisaab.api.deps import DB
from hisaab.db import migrate

router = APIRouter(tags=["data"])

EDITABLE_SETTINGS = {"currency", "locale", "month_start_day", "theme", "onboarded", "needs_target",
                     "wants_target", "savings_target"}


@router.get("/settings")
def get_settings(db: DB) -> dict:
    return {r["key"]: r["value"] for r in db.execute("SELECT key, value FROM settings")
            if not r["key"].startswith("ai_key")}


class SettingsIn(BaseModel):
    values: dict[str, str | int | float | bool] = Field(default_factory=dict)


@router.put("/settings")
def put_settings(body: SettingsIn, db: DB) -> dict:
    bad = set(body.values) - EDITABLE_SETTINGS
    if bad:
        raise HTTPException(422, f"Unknown settings: {', '.join(sorted(bad))}")
    if "month_start_day" in body.values and not 1 <= int(body.values["month_start_day"]) <= 28:
        raise HTTPException(422, "Month start day must be between 1 and 28")
    with db:
        for k, v in body.values.items():
            db.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                       (k, str(int(v) if isinstance(v, bool) else v)))
    return get_settings(db)


@router.get("/backups")
def list_backups(request: Request) -> list[dict]:
    return backup.list_backups(request.app.state.db_path)


@router.post("/backups", status_code=201)
def make_backup(request: Request) -> dict:
    path = backup.create_backup(request.app.state.db_path)
    return {"name": path.name}


@router.get("/backups/{name}")
def download_backup(name: str, request: Request) -> FileResponse:
    try:
        path = backup.backup_path(request.app.state.db_path, name)
    except FileNotFoundError as exc:
        raise HTTPException(404, "Backup not found") from exc
    return FileResponse(path, filename=name, media_type="application/vnd.sqlite3")


@router.post("/backups/restore")
async def restore_backup(request: Request) -> dict:
    data = await request.body()
    if not data:
        raise HTTPException(422, "Choose a backup file")
    try:
        safety = backup.restore(request.app.state.db_path, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    from hisaab.db import connect

    conn = connect(request.app.state.db_path)
    migrate(conn)  # an older backup may need newer tables
    conn.close()
    return {"restored": True, "previous_data_saved_as": safety.name}


EXPORT_SQL = """
    SELECT t.date, a.name AS account, t.payee, c.name AS category, g.name AS category_group,
           printf('%.2f', t.amount / 100.0) AS amount, t.notes, t.tags,
           CASE WHEN t.transfer_id IS NOT NULL THEN 'yes' ELSE '' END AS transfer,
           t.raw_description AS bank_description
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN category_groups g ON g.id = c.group_id
    WHERE t.split_parent_id IS NULL ORDER BY t.date, t.id
"""


@router.get("/export/transactions.csv")
def export_csv(db: DB) -> Response:
    rows = db.execute(EXPORT_SQL).fetchall()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(rows[0].keys() if rows else ["date", "account", "payee", "category", "amount"])
    writer.writerows(tuple(r) for r in rows)
    return Response(out.getvalue(), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="hisaab-transactions-{date.today()}.csv"'})


@router.get("/export/all.json")
def export_json(db: DB) -> Response:
    tables = ["accounts", "category_groups", "categories", "transactions", "budgets", "recurring", "goals",
              "goal_entries", "rules", "payee_memory", "imports"]
    data = {t: [dict(r) for r in db.execute(f"SELECT * FROM {t}")] for t in tables}
    data["settings"] = get_settings(db)
    data["exported_at"] = date.today().isoformat()
    return Response(json.dumps(data, ensure_ascii=False, indent=1), media_type="application/json", headers={
        "Content-Disposition": f'attachment; filename="hisaab-export-{date.today()}.json"'})
