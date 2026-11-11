"""Insights, forecast and the month in review."""

from typing import Annotated

from fastapi import APIRouter, Path

from hisaab import insights, periods, review
from hisaab.api.deps import DB

router = APIRouter(tags=["insights"])


@router.get("/insights")
def get_insights(db: DB) -> dict:
    return {"items": insights.generate(db), "forecast": insights.forecast(db)}


@router.get("/review/latest")
def latest_review(db: DB) -> dict:
    """The most recent finished month."""
    return review.build(db, periods.shift(periods.current(db), -1))


@router.get("/review/{period}")
def get_review(period: Annotated[str, Path(pattern=r"^\d{4}-\d{2}$")], db: DB) -> dict:
    return review.build(db, period)
