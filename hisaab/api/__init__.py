from fastapi import APIRouter

from hisaab.api import (
    accounts,
    budget,
    categories,
    data,
    imports,
    meta,
    plan,
    reports,
    rules,
    summary,
    transactions,
    understand,
)

router = APIRouter(prefix="/api")
for module in (meta, accounts, categories, transactions, summary, imports, rules, data, budget, plan, reports, understand):
    router.include_router(module.router)
