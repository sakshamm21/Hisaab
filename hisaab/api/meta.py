from fastapi import APIRouter, Request

from hisaab import __version__
from hisaab.api.deps import DB

router = APIRouter(tags=["meta"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/meta")
def meta(request: Request, db: DB) -> dict:
    settings = {row["key"]: row["value"] for row in db.execute("SELECT key, value FROM settings")}
    return {
        "version": __version__,
        "demo": request.app.state.demo,
        "settings": {
            "currency": settings.get("currency", "INR"),
            "locale": settings.get("locale", "en-IN"),
            "month_start_day": int(settings.get("month_start_day", "1")),
            "theme": settings.get("theme", "system"),
        },
    }
