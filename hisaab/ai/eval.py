"""Check that a model answers money questions correctly, using the demo data.

    python -m hisaab.ai.eval                      # the model configured in Settings → AI
    python -m hisaab.ai.eval --model anthropic/claude-haiku-5.5

Each question has an answer computed directly from the database; the model passes a question
when that number appears in its reply. Uses your saved OpenRouter key (or OPENROUTER_API_KEY).
"""

from __future__ import annotations

import argparse
import contextlib
import re
import tempfile
from datetime import date
from pathlib import Path

from hisaab.ai import agent, config, tools
from hisaab.db import open_database
from hisaab.demo import generate_demo


def cases(db) -> list[tuple[str, list[int]]]:
    """(question, acceptable whole-rupee answers)."""
    from hisaab import periods

    cur = periods.current(db)
    prev = periods.shift(cur, -1)
    prev_name = date.fromisoformat(f"{prev}-01").strftime("%B %Y")
    s = tools.get_summary(db, period=prev)
    by_cat = {r["name"]: r["spent"] for r in tools.spending_by(db, "category", period=prev)["rows"]}
    swiggy = tools.search_transactions(db, text="Swiggy", date_from=f"{prev}-01", date_to=f"{prev}-31", direction="out")
    rec = tools.list_recurring(db)
    subs = sum(-i["monthly_cost"] for i in rec["items"] if i["kind"] == "subscription")
    balances = tools.account_balances(db)
    goals = {g["name"]: g for g in tools.goals_status(db)["goals"]}
    r = round
    return [
        (f"How much did I spend in {prev_name}?", [r(s["spending"])]),
        (f"How much money came in during {prev_name}?", [r(s["income"])]),
        (f"How much did I spend on Food delivery in {prev_name}?", [r(by_cat.get("Food delivery", 0))]),
        (f"How much did I spend on Rent in {prev_name}?", [r(by_cat.get("Rent", 0))]),
        (f"What was my total spend at Swiggy in {prev_name}?", [r(-swiggy["net_total"])]),
        ("How much do my subscriptions cost per month in total?", [r(abs(subs))]),
        ("What's my net worth right now?", [r(balances["net_worth"])]),
        ("How much have I saved towards my Goa trip so far?", [r(goals["Goa trip"]["saved"])]),
        (f"How much did I have left over in {prev_name} after spending?", [r(s["left_over"])]),
        ("What is my biggest spending category last month?", [r(max(by_cat.values()))]),
    ]


def numbers(text: str) -> set[int]:
    out = set()
    for m in re.findall(r"\d[\d,]*(?:\.\d+)?", text):
        with contextlib.suppress(ValueError):
            out.add(round(float(m.replace(",", ""))))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    args = ap.parse_args()
    folder = Path(tempfile.mkdtemp())
    db = open_database(folder / "eval.db")
    generate_demo(db)
    cfg = config.load(db)
    cfg.key = config.get_key("openrouter")
    cfg.provider, cfg.base_url = "openrouter", config.OPENROUTER_URL
    if args.model:
        cfg.model, cfg.fallbacks = args.model, []
    if not cfg.key:
        raise SystemExit("No OpenRouter key: add it in Settings → AI or set OPENROUTER_API_KEY.")
    passed = 0
    for question, answers in cases(db):
        text, err = "", ""
        for e in agent.run(db, cfg, question):
            if e["type"] == "done":
                text = e["text"]
            elif e["type"] == "error":
                err = e["message"]
        got = numbers(text)
        ok = any(any(abs(a - g) <= 1 for g in got) for a in answers)
        passed += ok
        print(f"{'PASS' if ok else 'FAIL'}  {question}\n      expected {answers}  {('error: ' + err) if err else text[:160]!r}")
    print(f"\n{cfg.model}: {passed}/{len(cases(db))} correct")


if __name__ == "__main__":
    main()
