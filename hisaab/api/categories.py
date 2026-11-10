from fastapi import APIRouter

from hisaab.api.deps import DB

router = APIRouter(tags=["categories"])


@router.get("/categories")
def list_categories(db: DB) -> list[dict]:
    groups = {
        g["id"]: {**dict(g), "categories": []}
        for g in db.execute("SELECT id, name, kind FROM category_groups ORDER BY sort, id")
    }
    for c in db.execute(
        "SELECT id, group_id, name, icon, color, bucket FROM categories"
        " WHERE archived = 0 ORDER BY sort, id"
    ):
        groups[c["group_id"]]["categories"].append(dict(c))
    return list(groups.values())
