"""AI layer tests with a fake OpenAI-compatible server (no network, no key)."""

import json
import os
import stat

import httpx
import pytest

from hisaab.ai import agent, client, config, jobs, tools
from hisaab.ai.client import AiError, stream_chat
from hisaab.ai.config import AiConfig
from hisaab.ai.privacy import Masker


def sse(*chunks) -> bytes:
    return b"".join(f"data: {json.dumps(c)}\n\n".encode() for c in chunks) + b"data: [DONE]\n\n"


def text_chunks(text: str):
    return [{"model": "fake/model", "choices": [{"delta": {"content": part}}]} for part in text.split("|")]


def tool_chunks(name: str, args: dict, call_id: str = "call_1"):
    raw = json.dumps(args)
    return [
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": call_id, "function": {"name": name, "arguments": raw[:5]}}]}}]},
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": raw[5:]}}]}}]},
    ]


class FakeServer:
    """Replies with the scripted responses in order and records every request body."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[dict] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(json.loads(request.content))
        status, body = self.responses.pop(0)
        return httpx.Response(status, content=body, headers={"content-type": "text/event-stream"})


CFG = AiConfig("openrouter", "fake/model", "https://example.invalid/api/v1", "sk-test", ["fake/fallback"])


def test_stream_parses_text_and_split_tool_calls():
    server = FakeServer((200, sse(*tool_chunks("get_summary", {"period": "2026-10"}), *text_chunks("Hel|lo"))))
    events = list(stream_chat(CFG, [{"role": "user", "content": "hi"}], tools.SCHEMAS, transport=httpx.MockTransport(server)))
    turn = events[-1][1]
    assert [e[1] for e in events if e[0] == "text"] == ["Hel", "lo"]
    assert turn.tool_calls[0].name == "get_summary" and turn.tool_calls[0].args() == {"period": "2026-10"}
    body = server.requests[0]
    assert body["models"] == ["fake/model", "fake/fallback"] and body["stream"] is True and len(body["tools"]) == len(tools.SCHEMAS)


def test_friendly_errors():
    for code, phrase in ((401, "key"), (429, "busy"), (402, "credit")):
        server = FakeServer((code, json.dumps({"error": {"message": "x"}}).encode()))
        with pytest.raises(AiError, match=phrase):
            list(stream_chat(CFG, [], transport=httpx.MockTransport(server)))


def test_agent_runs_tools_and_answers(demo_db):
    server = FakeServer(
        (200, sse(*tool_chunks("get_summary", {"period": "2026-10"}))),
        (200, sse(*text_chunks("You spent |₹55,844 in October."))),
    )
    events = list(agent.run(demo_db, CFG, "How much did I spend in October?", transport=httpx.MockTransport(server)))
    kinds = [e["type"] for e in events]
    assert kinds[0] == "thread" and "tool" in kinds and kinds[-1] == "done"
    assert events[-1]["text"] == "You spent ₹55,844 in October."
    # The tool's result went back to the model as a tool message, with rupee amounts.
    tool_msg = next(m for m in server.requests[1]["messages"] if m["role"] == "tool")
    result = json.loads(tool_msg["content"])
    assert result["spending"] == tools.get_summary(demo_db, period="2026-10")["spending"]
    # The conversation is saved, and a follow-up includes it.
    thread = events[0]["thread_id"]
    assert [r[0] for r in demo_db.execute("SELECT role FROM ai_messages WHERE thread_id = ?", (thread,))] == ["user", "assistant"]
    assert demo_db.execute("SELECT COUNT(*) FROM ai_requests WHERE purpose = 'chat'").fetchone()[0] == 2


def test_agent_proposals_and_errors(demo_db):
    server = FakeServer(
        (200, sse(*tool_chunks("propose_budget", {"category": "food delivery", "amount": 4000}))),
        (200, sse(*text_chunks("I've suggested a budget."))),
    )
    events = list(agent.run(demo_db, CFG, "Set a food budget", transport=httpx.MockTransport(server)))
    proposal = next(e for e in events if e["type"] == "proposal")
    assert proposal["category"] == "Food delivery" and proposal["amount"] == 400000
    # Nothing was changed by the AI.
    cid = proposal["category_id"]
    assert demo_db.execute("SELECT amount FROM budgets WHERE category_id = ? AND month = ?", (cid, proposal["period"])).fetchone()[0] != 400000
    bad = list(agent.run(demo_db, CFG, "hi", transport=httpx.MockTransport(FakeServer((401, b"{}")))))
    assert bad[-1]["type"] == "error"


def test_people_are_masked_before_sending(demo_db):
    bank = demo_db.execute("SELECT id FROM accounts WHERE kind = 'bank'").fetchone()[0]
    demo_db.execute("INSERT INTO transactions (account_id, date, amount, payee, is_person) VALUES (?, '2026-11-09', -150000, 'Priya Sharma', 1)", (bank,))
    demo_db.commit()
    m = Masker(demo_db)
    assert m.mask("Paid Priya Sharma and priya sharma") == "Paid Person A and Person A"
    assert m.unmask("Person A got ₹1,500") == "Priya Sharma got ₹1,500"
    server = FakeServer((200, sse(*tool_chunks("search_transactions", {"text": "Priya"}))), (200, sse(*text_chunks("Person A: ₹1,500"))))
    events = list(agent.run(demo_db, CFG, "What did I pay Priya Sharma?", transport=httpx.MockTransport(server)))
    sent = json.dumps(server.requests)
    assert "Priya Sharma" not in sent and "Person A" in sent
    assert events[-1]["text"] == "Priya Sharma: ₹1,500"


def test_tools_return_rupees(demo_db):
    s = tools.get_summary(demo_db, period="2026-10")
    assert s["income"] >= 85000 and isinstance(s["spending"], float)
    rows = tools.spending_by(demo_db, "merchant", period="2026-10")["rows"]
    assert rows[0]["name"] == "Landlord" and rows[0]["spent"] == 22000
    found = tools.search_transactions(demo_db, text="Spotify", limit=3)
    assert found["matches"] >= 3 and len(found["transactions"]) == 3
    assert tools.run_tool(demo_db, "nope", {})["error"]
    assert "error" in tools.run_tool(demo_db, "get_summary", {"bogus": 1})
    for name in ("budget_status", "list_recurring", "goals_status", "get_forecast", "account_balances"):
        assert "error" not in tools.run_tool(demo_db, name, {})


def test_key_is_stored_privately(tmp_path, monkeypatch, demo_db):
    monkeypatch.setenv("HISAAB_CONFIG_DIR", str(tmp_path))
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    config.set_key("openrouter", "sk-or-v1-abcdefghijklmnop")
    path = config.secrets_path()
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert config.load(demo_db).key == "sk-or-v1-abcdefghijklmnop"
    assert config.mask("sk-or-v1-abcdefghijklmnop") == "sk-or-…mnop"
    # Never in the database, so never in backups or exports.
    assert not demo_db.execute("SELECT 1 FROM settings WHERE value LIKE '%abcdefgh%'").fetchone()
    config.set_key("openrouter", "")
    assert config.load(demo_db).key == ""


def test_ai_api_end_to_end(client, monkeypatch, tmp_path):
    monkeypatch.setenv("HISAAB_CONFIG_DIR", str(tmp_path))
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    assert client.get("/api/ai/status").json()["ready"] is False
    assert client.post("/api/ai/chat", json={"message": "hi"}).status_code == 422
    s = client.put("/api/ai/settings", json={"provider": "openrouter", "model": "fake/model", "key": "sk-or-v1-0123456789abcdef"}).json()
    assert s["ready"] and s["key"] == "sk-or-…cdef"
    server = FakeServer((200, sse(*text_chunks("Hello there"))))
    monkeypatch.setattr(client_module(), "TRANSPORT", httpx.MockTransport(server))
    r = client.post("/api/ai/chat", json={"message": "hi"})
    events = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]
    assert events[-1]["type"] == "done" and events[-1]["text"] == "Hello there"
    assert client.get("/api/ai/log").json()[0]["purpose"] == "chat"
    assert "Bearer" not in json.dumps(client.get("/api/ai/log").json())


def client_module():
    return client


def test_categorize_never_sends_people(demo_db):
    bank = demo_db.execute("SELECT id FROM accounts WHERE kind = 'bank'").fetchone()[0]
    demo_db.executemany("INSERT INTO transactions (account_id, date, amount, payee, is_person) VALUES (?, '2026-11-09', -5000, ?, ?)",
                        [(bank, "Croma Retail", 0), (bank, "Rahul Verma", 1)])
    demo_db.commit()
    reply = {"Croma Retail": "Shopping"}
    server = FakeServer((200, sse(*text_chunks(json.dumps(reply)))))
    out = jobs.suggest_categories(demo_db, CFG, transport=httpx.MockTransport(server))
    assert {"payee": "Croma Retail", "category": "Shopping"}.items() <= next(o for o in out if o["payee"] == "Croma Retail").items()
    assert "Rahul Verma" not in json.dumps(server.requests)
