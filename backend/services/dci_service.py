from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

APPROVED_CODES = {"1", "R"}
CLOSED_CODES = {"1", "R", "V"}


def canonical_code(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    if not text:
        return None
    text = re.sub(r"^CODE\s*[-:]?\s*", "", text)
    return text or None


def canonical_revision(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().upper()
    text = re.sub(r"^REV(?:ISION)?\s*[-:]?\s*", "", text)
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    return text


def revision_sort_key(value: Any) -> tuple[int, int | str]:
    revision = canonical_revision(value)
    if revision.isdigit():
        return (0, int(revision))
    return (1, revision)


def is_valid_revision_transition(current: Any, proposed: Any) -> bool:
    current_text = canonical_revision(current)
    proposed_text = canonical_revision(proposed)
    if not proposed_text or proposed_text == current_text:
        return True
    if current_text.isdigit() and proposed_text.isdigit():
        return int(proposed_text) == int(current_text) + 1
    return True


def derive_status(code: Any, actual_submission_date: Any = None, existing_status: Any = None) -> str:
    normalized = canonical_code(code)
    if normalized == "1":
        return "APPROVED"
    if normalized == "R":
        return "RETAINED FOR RECORD"
    if normalized == "2":
        return "RETURNED BY EIL - COMMENTS"
    if normalized == "3":
        return "RETURNED BY EIL - RESUBMIT"
    if normalized == "V":
        return "VOID"
    if actual_submission_date:
        return "WITH EIL"
    existing = str(existing_status or "").strip().upper()
    return existing or "FRESH SUBMISSION"


def parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def compute_aging(document: dict[str, Any], review_period_days: int, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    code = canonical_code(document.get("returned_code"))
    status = str(document.get("dci_status") or "").upper()
    planned = parse_date(document.get("planned_submission_date"))
    submitted = parse_date(document.get("actual_submission_date"))
    reviewed = parse_date(document.get("review_date"))

    age_days = 0
    basis = None
    due_date = None
    is_overdue = False

    if code in CLOSED_CODES or "APPROVED" in status or "VOID" in status or "RETAINED" in status:
        pass
    elif submitted and not reviewed:
        basis = "eil_review"
        age_days = max(0, (today - submitted).days)
        due_date = submitted.fromordinal(submitted.toordinal() + review_period_days)
        is_overdue = age_days > review_period_days
    elif not submitted and planned:
        basis = "first_submission"
        age_days = max(0, (today - planned).days)
        due_date = planned
        is_overdue = today > planned

    return {
        "aging_days": age_days,
        "aging_basis": basis,
        "due_date": due_date.isoformat() if due_date else None,
        "is_overdue": is_overdue,
        "overdue_by": max(0, age_days - review_period_days) if basis == "eil_review" else age_days,
    }


def document_to_api(document: dict[str, Any], review_period_days: int = 21) -> dict[str, Any]:
    aging = compute_aging(document, review_period_days)
    return {
        **document,
        "status": document.get("dci_status"),
        "approval_code": canonical_code(document.get("returned_code")),
        "uploaded_date": document.get("actual_submission_date"),
        "from_eil_date": document.get("review_date"),
        "schedule_submission_date": document.get("planned_submission_date"),
        "age_days": aging["aging_days"],
        **aging,
    }
