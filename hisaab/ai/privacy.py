"""What leaves the computer: people you pay become "Person A", "Person B"…

Merchants keep their names (that's what makes answers useful); individuals don't. The mapping
stays local, so the answer you see shows real names again.
"""

from __future__ import annotations

import re
import sqlite3
import string


class Masker:
    def __init__(self, db: sqlite3.Connection):
        names = [r[0] for r in db.execute(
            "SELECT payee FROM transactions WHERE is_person = 1 AND payee != '' GROUP BY payee COLLATE NOCASE"
            " ORDER BY MIN(id)")]
        self.to_alias: dict[str, str] = {}
        for i, name in enumerate(names):
            letters = string.ascii_uppercase
            alias = f"Person {letters[i % 26]}{'' if i < 26 else i // 26}"
            self.to_alias[name.lower()] = alias
        self.to_name = {v: k for k, v in self.to_alias.items()}
        self.real = {n.lower(): n for n in names}
        self._pattern = re.compile("|".join(re.escape(n) for n in sorted(names, key=len, reverse=True)), re.I) if names else None

    def mask(self, text: str) -> str:
        if not self._pattern:
            return text
        return self._pattern.sub(lambda m: self.to_alias[m.group(0).lower()], text)

    def unmask(self, text: str) -> str:
        if not self.to_alias:
            return text
        return re.sub(r"Person [A-Z]\d*", lambda m: self.real.get(self.to_name.get(m.group(0), ""), m.group(0)), text)

    def is_person(self, payee: str) -> bool:
        return payee.lower() in self.to_alias
