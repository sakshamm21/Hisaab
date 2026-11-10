from fastapi import APIRouter

from hisaab.api import accounts, categories, data, imports, meta, rules, summary, transactions

router = APIRouter(prefix="/api")
for module in (meta, accounts, categories, transactions, summary, imports, rules, data):
    router.include_router(module.router)
