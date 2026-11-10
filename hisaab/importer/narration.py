"""Understand Indian bank narrations: who was paid, how, and with which reference.

Examples (ICICI style; other banks are similar):
    UPI/Swiggy Ltd/swiggyupi@axb/Payment/AXIS BANK/410000000001/ICI703c...
    UPI/Spotify In/spotify@i/MandateReq/ICICI Bank/410000000009/...
    ACH/PPFAS 01122025/CAMS/ICIC0000000000000001/1000000000001
    MMT/IMPS/410000000008/Arjun R/HDFC0999999
    BIL/INFT/EL00000001/OtherICICIFT/VIKRAM SINGH
    NFS/CASH WDL/410000000008/GURGAON
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Payment kinds
UPI, UPI_MANDATE, NACH, IMPS, NEFT, RTGS, BILL, CARD, ATM, INTEREST, CHARGES, OTHER = (
    "upi", "upi_mandate", "nach", "imps", "neft", "rtgs", "bill", "card", "atm", "interest",
    "charges", "other",
)


@dataclass
class Narration:
    kind: str
    payee: str = ""
    vpa: str = ""
    reference: str = ""
    is_person: bool = False  # a payment to an individual rather than a business


_REF = re.compile(r"(?<!\d)(\d{10,16})(?!\d)")
_VPA = re.compile(r"[\w.\-]+@[\w.\-]*")
_PHONE_LOCAL = re.compile(r"^\+?\d{10,12}$")
# UPI handles that personal apps hand out (merchants usually have their own or a QR prefix)
_PERSONAL_HANDLES = ("ok", "ybl", "ibl", "axl", "paytm", "apl", "upi", "pts", "ptyes", "ptsbi", "ptaxis")
_MERCHANT_MARKERS = re.compile(
    r"\b(ltd|limited|pvt|private|llp|store|stores|mart|mark|market|enterprises|traders|services|"
    r"technologies|tech|foods|cafe|restaurant|hotel|pharmacy|medical|petroleum|fuel|motors|india|in)\b",
    re.I,
)
_MERCHANT_VPA_PREFIX = ("paytm.", "paytmqr", "ibkpos", "bharatpe", "q", "gpay-", "pay.", "mab.", "yespay",
                        "razorpay", "rzp", "payu", "cf.", "billdesk", "msw", "zomato", "swiggy", "zepto")


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip(" /-")


def _looks_like_person(name: str, vpa: str) -> bool:
    from hisaab.categorize import known_merchant

    if known_merchant(f"{name} {vpa}"):
        return False
    local, _, handle = vpa.lower().partition("@")
    if local.startswith(_MERCHANT_VPA_PREFIX) or _MERCHANT_MARKERS.search(name):
        return False
    if _PHONE_LOCAL.match(local):
        return True
    # "Ravi K", "RAVI KUMAR": one or two short alphabetic words
    words = name.split()
    personal_handle = handle.startswith(_PERSONAL_HANDLES) or not handle
    return personal_handle and 1 <= len(words) <= 3 and all(w.isalpha() for w in words)


def parse_narration(text: str) -> Narration:
    raw = _clean(text)
    upper = raw.upper()
    parts = [p.strip() for p in raw.split("/")]
    head = parts[0].upper() if parts else ""
    ref_match = _REF.search(raw)
    ref = ref_match.group(1) if ref_match else ""

    if head == "UPI" and len(parts) >= 3:
        payee = _clean(parts[1])
        vpa_match = _VPA.search(parts[2]) if len(parts) > 2 else None
        vpa = vpa_match.group(0) if vpa_match else ""
        kind = UPI_MANDATE if "MANDATEREQ" in upper.replace(" ", "") else UPI
        return Narration(kind, payee, vpa, ref, is_person=kind == UPI and _looks_like_person(payee, vpa))

    if head in ("ACH", "NACH") or upper.startswith("NACH"):
        # "ACH/PPFAS 01122025 CAMS/..." -> "PPFAS": the mandate code before the date
        match = re.match(r"\s*([A-Za-z][A-Za-z .&-]*?)(?:\s+\d|$)", parts[1]) if len(parts) > 1 else None
        return Narration(NACH, _clean(match.group(1)) if match else "", reference=ref)

    if "IMPS" in parts[:2] or head in ("MMT", "IMPS"):
        # MMT/IMPS/<ref>/<note or name>/<name>/<ifsc>
        names = [p for p in parts[2:] if p and not _REF.fullmatch(p) and not re.fullmatch(r"[A-Z]{4}0\w{6}", p)]
        payee = _clean(names[-1] if names else "")
        return Narration(IMPS, payee, reference=ref, is_person=bool(payee) and not _MERCHANT_MARKERS.search(payee))

    if head in ("NEFT", "RTGS") or upper.startswith(("NEFT", "RTGS")):
        names = [p for p in parts[1:] if p and not _REF.fullmatch(p) and not re.fullmatch(r"[A-Z]{4}0\w{6}", p)]
        payee = _clean(names[0] if names else "")
        return Narration(NEFT if "NEFT" in head else RTGS, payee, reference=ref)

    if head in ("BIL", "BPAY", "BBPS", "RCHG", "TOP") or upper.startswith(("BIL/", "BBPS")):
        payee = _clean(parts[-1]) if len(parts) > 1 else ""
        return Narration(BILL, payee, reference=ref,
                         is_person="INFT" in upper and bool(payee) and not _MERCHANT_MARKERS.search(payee))

    if head in ("NFS", "ATM", "VAT", "MAT", "CCWD") or "CASH WDL" in upper or "ATM WDL" in upper:
        return Narration(ATM, "ATM withdrawal", reference=ref)

    if head in ("VPS", "IPS", "POS", "ONL"):
        payee = _clean(parts[1]) if len(parts) > 1 else ""
        return Narration(CARD, payee, reference=ref)

    if "INT.PD" in upper or "INTEREST" in upper:
        return Narration(INTEREST, "Interest", reference=ref)

    if re.search(r"\b(CHG|CHARGES|FEE|GST|SMS CHRG|AMC)\b", upper):
        return Narration(CHARGES, "Bank charges", reference=ref)

    return Narration(OTHER, "", reference=ref)


_GENERIC_HINTS = {"", "nach trxn", "debit trxn", "credit trxn", "fund transfer", "upi", "neft", "imps",
                  "rtgs", "transfer", "atm", "cash"}


def display_payee(hint: str, narration: Narration) -> str:
    """The name shown in the app. Prefer the bank's short name, tidied; fall back to the narration."""
    hint = _clean(hint)
    if hint.lower() in _GENERIC_HINTS:
        hint = ""
    name = narration.payee if narration.kind in (NACH, ATM, INTEREST, CHARGES) else (hint or narration.payee)
    name = name or hint
    if narration.kind == NACH:
        return name  # mandate codes like PPFAS are looked up by code later
    return name.title() if name.isupper() and len(name) > 3 else name
