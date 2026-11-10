from fastapi import APIRouter

from hisaab.api import accounts, budget, categories, data, imports, meta, plan, rules, summary, transactions

router = APIRouter(prefix="/api")
for module in (meta, accounts, categories, transactions, summary, imports, rules, data, budget, plan):
    router.include_router(module.router)
