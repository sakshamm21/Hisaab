from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hisaab.api.deps import DB

router = APIRouter(tags=["categories"])


@router.get("/categories")
def list_categories(db: DB, include_archived: bool = False) -> list[dict]:
    groups = {
        g["id"]: {**dict(g), "categories": []}
        for g in db.execute("SELECT id, name, kind, sort FROM category_groups ORDER BY sort, id")
    }
    where = "" if include_archived else "WHERE c.archived = 0"
    for c in db.execute(
        f"SELECT c.id, c.group_id, c.name, c.icon, c.color, c.bucket, c.rollover, c.archived,"
        f" (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS transaction_count"
        f" FROM categories c {where} ORDER BY c.sort, c.id"
    ):
        groups[c["group_id"]]["categories"].append(dict(c))
    return list(groups.values())


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    kind: Literal["expense", "income"] = "expense"


@router.post("/category-groups", status_code=201)
def create_group(body: GroupIn, db: DB) -> dict:
    with db:
        sort = db.execute("SELECT COALESCE(MAX(sort), -1) + 1 FROM category_groups").fetchone()[0]
        try:
            gid = db.execute("INSERT INTO category_groups (name, kind, sort) VALUES (?,?,?)",
                             (body.name.strip(), body.kind, sort)).lastrowid
        except Exception as exc:
            raise HTTPException(409, "A group with that name already exists") from exc
    return {"id": gid, "name": body.name.strip(), "kind": body.kind, "categories": []}


class GroupPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    sort: int | None = None


@router.patch("/category-groups/{gid}")
def update_group(gid: int, body: GroupPatch, db: DB) -> dict:
    fields = body.model_dump(exclude_none=True)
    if fields:
        with db:
            db.execute(f"UPDATE category_groups SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
                       (*fields.values(), gid))
    return {"ok": True}


class CategoryIn(BaseModel):
    group_id: int
    name: str = Field(min_length=1, max_length=40)
    icon: str = "circle"
    color: str = Field(default="#8b8693", pattern=r"^#[0-9a-fA-F]{6}$")
    bucket: Literal["need", "want", "saving"] | None = None


@router.post("/categories", status_code=201)
def create_category(body: CategoryIn, db: DB) -> dict:
    with db:
        sort = db.execute("SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE group_id = ?",
                          (body.group_id,)).fetchone()[0]
        try:
            cid = db.execute(
                "INSERT INTO categories (group_id, name, icon, color, bucket, sort) VALUES (?,?,?,?,?,?)",
                (body.group_id, body.name.strip(), body.icon, body.color, body.bucket, sort),
            ).lastrowid
        except Exception as exc:
            raise HTTPException(409, "That group already has a category with this name") from exc
    return dict(db.execute("SELECT * FROM categories WHERE id = ?", (cid,)).fetchone())


class CategoryPatch(BaseModel):
    group_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=40)
    icon: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    bucket: Literal["need", "want", "saving", "none"] | None = None
    rollover: bool | None = None
    archived: bool | None = None
    sort: int | None = None


@router.patch("/categories/{cid}")
def update_category(cid: int, body: CategoryPatch, db: DB) -> dict:
    if not db.execute("SELECT 1 FROM categories WHERE id = ?", (cid,)).fetchone():
        raise HTTPException(404, "Category not found")
    fields = {k: (int(v) if isinstance(v, bool) else v) for k, v in body.model_dump(exclude_none=True).items()}
    if fields.get("bucket") == "none":
        fields["bucket"] = None
    if fields:
        with db:
            db.execute(f"UPDATE categories SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
                       (*fields.values(), cid))
    return dict(db.execute("SELECT * FROM categories WHERE id = ?", (cid,)).fetchone())


@router.post("/categories/{cid}/merge-into/{target}")
def merge_category(cid: int, target: int, db: DB) -> dict:
    """Move every transaction, budget and rule from one category to another, then archive the first."""
    if cid == target:
        raise HTTPException(422, "Pick a different category")
    with db:
        moved = db.execute("UPDATE transactions SET category_id = ? WHERE category_id = ?", (target, cid)).rowcount
        db.execute("UPDATE rules SET set_category_id = ? WHERE set_category_id = ?", (target, cid))
        db.execute("UPDATE payee_memory SET category_id = ? WHERE category_id = ?", (target, cid))
        db.execute("DELETE FROM budgets WHERE category_id = ?", (cid,))
        db.execute("UPDATE categories SET archived = 1 WHERE id = ?", (cid,))
    return {"moved": moved}
