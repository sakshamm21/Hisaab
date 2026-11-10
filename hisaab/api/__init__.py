from fastapi import APIRouter

from hisaab.api import accounts, categories, meta, summary, transactions

router = APIRouter(prefix="/api")
for module in (meta, accounts, categories, transactions, summary):
    router.include_router(module.router)
