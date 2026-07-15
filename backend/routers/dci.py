from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.services.dci_service import (
    canonical_code,
    canonical_revision,
    compute_aging,
    derive_status,
    document_to_api,
    is_valid_revision_transition,
    revision_sort_key,
    parse_date,
)
from repositories.db import get_db_client

router = APIRouter()

EDITABLE_FIELDS = {
    "document_title",
    "discipline",
    "vendor",
    "document_type",
    "revision",
    "returned_code",
    "planned_submission_date",
    "actual_submission_date",
    "review_date",
    "approval_date",
    "forecast_month",
    "remarks",
    "assigned_engineer",
    "action_owner",
    "expected_completion_date",
}


class DocumentUpdate(BaseModel):
    document_title: str | None = None
    discipline: str | None = None
    vendor: str | None = None
    document_type: str | None = None
    revision: str | None = None
    returned_code: str | None = None
    planned_submission_date: date | None = None
    actual_submission_date: date | None = None
    review_date: date | None = None
    approval_date: date | None = None
    forecast_month: str | None = None
    remarks: str | None = None
    assigned_engineer: str | None = None
    action_owner: str | None = None
    expected_completion_date: date | None = None
    revision_date: date | None = None
    actor_user_id: str = Field(default="system", min_length=1)
    event_type: str = "dashboard_update"



class MasterDataUpdate(BaseModel):
    vendors: list[str] = []
    disciplines: list[str] = []
    revisions: list[str] = []
    code_labels: dict[str, str] = {}


class NewDocumentCreate(BaseModel):
    document_number: str = Field(min_length=1, max_length=200)
    document_title: str = Field(min_length=1, max_length=500)
    vendor: str = ""
    discipline: str = ""
    document_type: str = ""
    revision: str = "0"
    returned_code: str | None = None
    revision_date: date | None = None
    remarks: str = ""
    actor_user_id: str = "system"


def _project_id_for_document(document: dict) -> int | None:
    if document.get("project_id"):
        return int(document["project_id"])
    active = get_db_client().table("imports").select("project_id").eq("id", document["import_id"]).limit(1).execute()
    return int(active.data[0]["project_id"]) if active.data and active.data[0].get("project_id") else None


def _master_data(project_id: int) -> dict:
    result = get_db_client().table("projects").select(
        "vendor_options,discipline_options,revision_options,code_labels"
    ).eq("id", project_id).limit(1).execute()
    row = result.data[0] if result.data else {}
    documents, _ = _documents(project_id)
    vendors = sorted(set(row.get("vendor_options") or []) | {str(x.get("vendor")).strip() for x in documents if x.get("vendor")})
    disciplines = sorted(set(row.get("discipline_options") or []) | {str(x.get("discipline")).strip() for x in documents if x.get("discipline")})
    return {
        "vendors": vendors,
        "disciplines": disciplines,
        "revisions": row.get("revision_options") or [str(i) for i in range(10)],
        "code_labels": row.get("code_labels") or {"1":"Approved","2":"Commented","3":"Resubmission","R":"Retained for Records","V":"Void"},
    }


def _status_from_project_code(project_id: int | None, code: Any, submitted: Any, fallback: Any = None) -> str:
    canonical = canonical_code(code)
    if canonical and project_id:
        label = _master_data(project_id)["code_labels"].get(canonical)
        if label:
            return label
    return derive_status(canonical, submitted, fallback)

def _active_import(project_id: int) -> dict | None:
    result = (
        get_db_client().table("imports")
        .select("*")
        .eq("project_id", project_id)
        .eq("is_active", True)
        .eq("import_status", "complete")
        .order("uploaded_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _documents(project_id: int) -> tuple[list[dict], dict | None]:
    active = _active_import(project_id)
    if not active:
        return [], None
    result = (
        get_db_client().table("documents")
        .select("*")
        .eq("import_id", active["id"])
        .eq("is_active", True)
        .order("original_row_number")
        .execute()
    )
    return result.data or [], active


def _project_review_period(project_id: int, active: dict | None = None) -> int:
    if active and active.get("review_period_days"):
        return int(active["review_period_days"])
    result = get_db_client().table("projects").select("review_period_days").eq("id", project_id).limit(1).execute()
    return int(result.data[0].get("review_period_days") or 21) if result.data else 21


def _matches(value: Any, allowed: set[str]) -> bool:
    return not allowed or str(value or "").strip() in allowed


def _filter_documents(
    documents: list[dict],
    search: str = "",
    disciplines: set[str] | None = None,
    vendors: set[str] | None = None,
    statuses: set[str] | None = None,
    codes: set[str] | None = None,
    revisions: set[str] | None = None,
) -> list[dict]:
    disciplines = disciplines or set()
    vendors = vendors or set()
    statuses = statuses or set()
    codes = {canonical_code(value) or "" for value in (codes or set())}
    revisions = {canonical_revision(value) for value in (revisions or set())}
    needle = search.strip().casefold()
    output: list[dict] = []
    for document in documents:
        if not _matches(document.get("discipline"), disciplines):
            continue
        if not _matches(document.get("vendor"), vendors):
            continue
        if not _matches(document.get("dci_status"), statuses):
            continue
        if codes and (canonical_code(document.get("returned_code")) or "") not in codes:
            continue
        if revisions and canonical_revision(document.get("revision")) not in revisions:
            continue
        if needle:
            haystack = " ".join(str(document.get(field) or "") for field in (
                "document_number", "document_title", "discipline", "vendor", "dci_status",
                "returned_code", "revision", "remarks", "assigned_engineer", "action_owner",
            )).casefold()
            if needle not in haystack:
                continue
        output.append(document)
    return output


def _split_csv(value: str | None) -> set[str]:
    return {item.strip() for item in (value or "").split(",") if item.strip()}


@router.get("/summary")
def summary(project_id: int = 1) -> dict:
    documents, active = _documents(project_id)
    review_period = _project_review_period(project_id, active)
    api_docs = [document_to_api(item, review_period) for item in documents]
    status_counts = Counter(item.get("dci_status") or "Unknown" for item in documents)
    code_counts = Counter(canonical_code(item.get("returned_code")) or "Pending" for item in documents)
    approved = sum(code_counts[code] for code in ("1", "R"))
    returned = sum(code_counts[code] for code in ("2", "3"))
    delayed = sum(1 for item in api_docs if item["is_overdue"])
    under_review = sum(1 for item in documents if str(item.get("dci_status") or "").upper() == "WITH EIL")
    return {
        "import": active,
        "total": len(documents),
        "approved": approved,
        "returned": returned,
        "delayed": delayed,
        "under_review": under_review,
        "fresh_submission": sum(1 for item in documents if "FRESH" in str(item.get("dci_status") or "").upper()),
        "counts": dict(status_counts),
        "returned_counts": dict(code_counts),
        "review_period_days": review_period,
    }


@router.get("/documents")
def list_documents(project_id: int = 1) -> list[dict]:
    documents, active = _documents(project_id)
    review_period = _project_review_period(project_id, active)
    return [document_to_api(item, review_period) for item in documents]


@router.get("/document-choices")
def document_choices(project_id: int = 1) -> list[dict]:
    documents, _ = _documents(project_id)
    return [
        {"id": item["id"], "document_number": item.get("document_number"), "document_title": item.get("document_title")}
        for item in sorted(documents, key=lambda row: str(row.get("document_number") or ""))
        if item.get("document_number")
    ]


@router.get("/filters")
def filters(project_id: int = 1) -> dict[str, list[str]]:
    documents, _ = _documents(project_id)
    def values(field: str) -> list[str]:
        return sorted({str(item.get(field)).strip() for item in documents if item.get(field) not in (None, "")})
    revisions = sorted({canonical_revision(item.get("revision")) for item in documents if canonical_revision(item.get("revision"))}, key=revision_sort_key)
    codes = sorted({canonical_code(item.get("returned_code")) for item in documents if canonical_code(item.get("returned_code"))})
    return {
        "disciplines": values("discipline"),
        "vendors": values("vendor"),
        "statuses": values("dci_status"),
        "codes": codes,
        "revisions": revisions,
    }


@router.get("/approval-status")
def approval_status(project_id: int = 1) -> dict:
    result = summary(project_id)
    return {"counts": result["counts"], "returned_counts": result["returned_counts"], "total": result["total"]}


@router.get("/discipline-analysis")
def discipline_analysis(project_id: int = 1) -> list[dict]:
    documents, _ = _documents(project_id)
    grouped: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "approved": 0, "overdue": 0})
    review_period = _project_review_period(project_id)
    for item in documents:
        key = str(item.get("discipline") or "Unspecified")
        grouped[key]["total"] += 1
        if canonical_code(item.get("returned_code")) in {"1", "R"}:
            grouped[key]["approved"] += 1
        if compute_aging(item, review_period)["is_overdue"]:
            grouped[key]["overdue"] += 1
    return [{"discipline": key, **value} for key, value in sorted(grouped.items(), key=lambda pair: pair[1]["total"], reverse=True)]


@router.get("/vendor-analysis")
def vendor_analysis(project_id: int = 1) -> list[dict]:
    documents, _ = _documents(project_id)
    grouped: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "approved": 0, "returned": 0})
    for item in documents:
        key = str(item.get("vendor") or "Unspecified")
        grouped[key]["total"] += 1
        code = canonical_code(item.get("returned_code"))
        if code in {"1", "R"}:
            grouped[key]["approved"] += 1
        if code in {"2", "3"}:
            grouped[key]["returned"] += 1
    return [{"vendor": key, **value} for key, value in sorted(grouped.items(), key=lambda pair: pair[1]["total"], reverse=True)]


@router.get("/delays-aging")
def delays_aging(project_id: int = 1) -> list[dict]:
    documents, active = _documents(project_id)
    review_period = _project_review_period(project_id, active)
    output = []
    for item in documents:
        aging = compute_aging(item, review_period)
        if not aging["is_overdue"]:
            continue
        output.append({
            "id": item["id"],
            "doc_no": item.get("document_number") or str(item["id"]),
            "title": item.get("document_title") or "Untitled",
            "discipline": item.get("discipline") or "–",
            "vendor": item.get("vendor") or "–",
            "status": item.get("dci_status") or "Unknown",
            "revision": item.get("revision") or "–",
            "uploaded_date": item.get("actual_submission_date") or "",
            **aging,
        })
    return sorted(output, key=lambda item: item["overdue_by"], reverse=True)


@router.get("/timeline")
def monthly_timeline(project_id: int = 1) -> dict[str, list[dict]]:
    documents, _ = _documents(project_id)
    buckets: dict[str, Counter] = {"submissions": Counter(), "returns": Counter(), "approvals": Counter()}
    for item in documents:
        for bucket, field in (("submissions", "actual_submission_date"), ("returns", "review_date"), ("approvals", "approval_date")):
            value = item.get(field)
            if value:
                buckets[bucket][str(value)[:7]] += 1
    return {
        key: [{"month": month, "count": count} for month, count in sorted(counter.items())]
        for key, counter in buckets.items()
    }


@router.get("/register")
def register(
    project_id: int = 1,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    search: str = "",
    discipline: str | None = None,
    vendor: str | None = None,
    status: str | None = None,
    code: str | None = None,
    revision: str | None = None,
) -> dict:
    documents, active = _documents(project_id)
    filtered = _filter_documents(
        documents,
        search=search,
        disciplines=_split_csv(discipline),
        vendors=_split_csv(vendor),
        statuses=_split_csv(status),
        codes=_split_csv(code),
        revisions=_split_csv(revision),
    )
    total = len(filtered)
    start = (page - 1) * page_size
    review_period = _project_review_period(project_id, active)
    data = [document_to_api(item, review_period) for item in filtered[start : start + page_size]]
    return {"data": data, "total": total, "page": page, "page_size": page_size}




class DashboardConfigUpdate(BaseModel):
    closed_codes: list[str] = Field(default_factory=lambda: ["1", "R", "V"])
    resubmission_codes: list[str] = Field(default_factory=lambda: ["2", "3"])


def _project_config(project_id: int) -> dict:
    result = get_db_client().table("projects").select("closed_codes,resubmission_codes").eq("id", project_id).limit(1).execute()
    row = result.data[0] if result.data else {}
    return {
        "closed_codes": [canonical_code(v) for v in (row.get("closed_codes") or ["1", "R", "V"]) if canonical_code(v)],
        "resubmission_codes": [canonical_code(v) for v in (row.get("resubmission_codes") or ["2", "3"]) if canonical_code(v)],
    }


def _month_matrix(documents: list[dict], field: str) -> list[dict]:
    counter: Counter = Counter()
    for item in documents:
        value = parse_date(item.get(field))
        if value:
            counter[(value.year, value.month)] += 1
    years = sorted({year for year, _ in counter}, reverse=True)[:4]
    return [{"year": year, "months": [counter[(year, month)] for month in range(1, 13)]} for year in years]


def _aging_bucket(days: int, due: bool = False) -> str:
    if due:
        return "Not due yet"
    if days <= 7:
        return "0-7 days"
    if days <= 14:
        return "8-14 days"
    if days <= 21:
        return "15-21 days"
    return ">21 days"



@router.get("/master-data")
def get_master_data(project_id: int = 1) -> dict:
    return _master_data(project_id)


@router.put("/master-data")
def update_master_data(project_id: int, payload: MasterDataUpdate) -> dict:
    def clean(items: list[str]) -> list[str]:
        return list(dict.fromkeys(x.strip() for x in items if x and x.strip()))
    row = {
        "vendor_options": clean(payload.vendors),
        "discipline_options": clean(payload.disciplines),
        "revision_options": clean(payload.revisions) or [str(i) for i in range(10)],
        "code_labels": {canonical_code(k) or k.strip(): v.strip() for k, v in payload.code_labels.items() if k.strip() and v.strip()},
    }
    updated = get_db_client().table("projects").update(row).eq("id", project_id).execute()
    if not updated.data:
        raise HTTPException(status_code=404, detail="Project not found.")
    return _master_data(project_id)


@router.post("/documents")
def create_new_document(project_id: int, payload: NewDocumentCreate) -> dict:
    client = get_db_client()
    active = _active_import(project_id)
    if not active:
        raise HTTPException(status_code=409, detail="Import a workbook before creating a document.")
    duplicate = client.table("documents").select("id").eq("import_id", active["id"]).eq("document_number", payload.document_number.strip()).limit(1).execute()
    if duplicate.data:
        raise HTTPException(status_code=409, detail="A document with this number already exists.")
    max_row = client.table("documents").select("original_row_number").eq("import_id", active["id"]).order("original_row_number", desc=True).limit(1).execute()
    row_number = int(max_row.data[0].get("original_row_number") or 0) + 1 if max_row.data else 1
    revision = canonical_revision(payload.revision) or "0"
    code = canonical_code(payload.returned_code)
    revision_date = payload.revision_date.isoformat() if payload.revision_date else None
    status = _status_from_project_code(project_id, code, revision_date, "New Task") if code else "New Task"
    row = {
        "project_id": project_id,
        "import_id": active["id"],
        "document_key": f"manual:{payload.document_number.strip().casefold()}",
        "original_row_number": row_number,
        "document_number": payload.document_number.strip(),
        "document_title": payload.document_title.strip(),
        "vendor": payload.vendor.strip(),
        "discipline": payload.discipline.strip(),
        "document_type": payload.document_type.strip(),
        "revision": revision,
        "returned_code": code,
        "actual_submission_date": revision_date,
        "dci_status": status,
        "lifecycle_stage": status,
        "remarks": payload.remarks,
        "last_changed_by": payload.actor_user_id,
    }
    created = client.table("documents").insert(row).execute()
    if not created.data:
        raise HTTPException(status_code=500, detail="Document could not be created.")
    document = created.data[0]
    client.table("document_raw_data").insert({
        "document_id": document["id"], "row_data": {"record": row, "history_rows": []},
        "original_column_names": [], "original_row_number": row_number,
    }).execute()
    client.table("document_history").insert({
        "document_id": document["id"], "import_id": active["id"], "event_type": "document_created",
        "field_name": "document", "new_value": payload.document_number, "revision": revision,
        "returned_code": code, "status": status, "remarks": payload.remarks,
        "changed_by": payload.actor_user_id, "source": "dashboard", "event_date": date.today().isoformat(),
        "metadata": {"manual": True},
    }).execute()
    return document_to_api(document, _project_review_period(project_id, active))


@router.get("/dashboard-config")
def dashboard_config(project_id: int = 1) -> dict:
    return _project_config(project_id)


@router.put("/dashboard-config")
def update_dashboard_config(project_id: int, payload: DashboardConfigUpdate) -> dict:
    values = {
        "closed_codes": sorted({canonical_code(v) for v in payload.closed_codes if canonical_code(v)}),
        "resubmission_codes": sorted({canonical_code(v) for v in payload.resubmission_codes if canonical_code(v)}),
    }
    updated = get_db_client().table("projects").update(values).eq("id", project_id).execute()
    if not updated.data:
        raise HTTPException(status_code=404, detail="Project not found.")
    return values


@router.get("/analytics")
def dashboard_analytics(
    project_id: int = 1,
    search: str = "",
    discipline: str | None = None,
    vendor: str | None = None,
    status: str | None = None,
    code: str | None = None,
    revision: str | None = None,
) -> dict:
    documents, active = _documents(project_id)
    documents = _filter_documents(
        documents, search=search, disciplines=_split_csv(discipline), vendors=_split_csv(vendor),
        statuses=_split_csv(status), codes=_split_csv(code), revisions=_split_csv(revision),
    )
    config = _project_config(project_id)
    closed = set(config["closed_codes"])
    resubmit = set(config["resubmission_codes"])
    review_period = _project_review_period(project_id, active)
    today = date.today()

    open_docs = [item for item in documents if (canonical_code(item.get("returned_code")) or "") not in closed]
    consultant = []
    client = []
    for item in open_docs:
        code_value = canonical_code(item.get("returned_code"))
        submitted = parse_date(item.get("actual_submission_date"))
        reviewed = parse_date(item.get("review_date"))
        planned = parse_date(item.get("planned_submission_date"))
        row = document_to_api(item, review_period)
        if code_value in resubmit or not submitted:
            due_date = planned
            days = max(0, (today - due_date).days) if due_date else 0
            row.update({"pending_with": "consultant", "pending_days": days, "not_due": bool(due_date and today <= due_date)})
            consultant.append(row)
        elif submitted and not reviewed and not code_value:
            due_date = submitted.fromordinal(submitted.toordinal() + review_period)
            days = max(0, (today - submitted).days)
            row.update({"pending_with": "client", "pending_days": days, "not_due": today <= due_date})
            client.append(row)
        elif submitted and not code_value:
            days = max(0, (today - submitted).days)
            row.update({"pending_with": "client", "pending_days": days, "not_due": days <= review_period})
            client.append(row)

    def aging_payload(rows: list[dict]) -> dict:
        counts = Counter(_aging_bucket(int(r.get("pending_days") or 0), bool(r.get("not_due"))) for r in rows)
        labels = ["Not due yet", "0-7 days", "8-14 days", "15-21 days", ">21 days"]
        return {
            "total": len(rows),
            "overdue": sum(1 for r in rows if not r.get("not_due") and int(r.get("pending_days") or 0) > (review_period if r.get("pending_with") == "client" else 0)),
            "buckets": [{"label": label, "count": counts[label]} for label in labels],
            "documents": sorted(rows, key=lambda r: int(r.get("pending_days") or 0), reverse=True)[:100],
        }

    code_counts = Counter(canonical_code(item.get("returned_code")) or "Pending code" for item in documents)
    pending_by_revision = Counter(canonical_revision(item.get("revision")) or "Fresh" for item in open_docs if not canonical_code(item.get("returned_code")))
    resubmit_by_revision = Counter(canonical_revision(item.get("revision")) or "Fresh" for item in open_docs if canonical_code(item.get("returned_code")) in resubmit)
    open_by_code = Counter(canonical_code(item.get("returned_code")) or "Fresh / no code" for item in open_docs)

    return {
        "config": config,
        "review_period_days": review_period,
        "kpis": {
            "total": len(documents), "open": len(open_docs), "pending_consultant": len(consultant),
            "pending_client": len(client), "closed": len(documents) - len(open_docs),
        },
        "aging": {"consultant": aging_payload(consultant), "client": aging_payload(client)},
        "submission_progress": _month_matrix(documents, "actual_submission_date"),
        "review_progress": _month_matrix(documents, "review_date"),
        "approval_codes": [{"code": key, "count": value} for key, value in code_counts.most_common()],
        "pending_code_by_revision": [{"revision": key, "count": value} for key, value in sorted(pending_by_revision.items(), key=lambda x: revision_sort_key(x[0]))],
        "resubmission_by_revision": [{"revision": key, "count": value} for key, value in sorted(resubmit_by_revision.items(), key=lambda x: revision_sort_key(x[0]))],
        "open_by_code": [{"code": key, "count": value} for key, value in open_by_code.most_common()],
    }


@router.get("/document/{document_id}")
def get_document(document_id: int) -> dict:
    client = get_db_client()
    result = client.table("documents").select("*").eq("id", document_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found.")
    document = result.data[0]
    active = client.table("imports").select("review_period_days").eq("id", document["import_id"]).limit(1).execute()
    review_period = int(active.data[0].get("review_period_days") or 21) if active.data else 21
    return document_to_api(document, review_period)


@router.get("/document/{document_id}/timeline")
def document_timeline(document_id: int) -> dict:
    client = get_db_client()
    document = get_document(document_id)
    raw_result = client.table("document_raw_data").select("row_data").eq("document_id", document_id).limit(1).execute()
    history_result = (
        client.table("document_history")
        .select("*")
        .eq("document_id", document_id)
        .order("changed_at")
        .execute()
    )
    events: list[dict] = []
    if raw_result.data:
        for item in raw_result.data[0].get("row_data", {}).get("history_rows", []):
            revision = canonical_revision(item.get("rev_no"))
            submitted = item.get("uploaded_date")
            returned = item.get("from_eil_date")
            code = canonical_code(item.get("code"))
            if submitted:
                events.append({"date": submitted, "type": "submitted", "title": f"Revision {revision or '—'} submitted", "revision": revision, "code": None, "source": "workbook"})
            if returned:
                events.append({"date": returned, "type": "returned", "title": f"Returned with code {code or '—'}", "revision": revision, "code": code, "source": "workbook"})
            if code in {"1", "R"} and returned:
                events.append({"date": returned, "type": "approved", "title": "Approved" if code == "1" else "Retained for record", "revision": revision, "code": code, "source": "workbook"})
    for item in history_result.data or []:
        events.append({
            "date": item.get("event_date") or item.get("changed_at"),
            "type": item.get("event_type") or "updated",
            "title": f"{item.get('field_name') or 'Document'} updated",
            "field": item.get("field_name"),
            "old_value": item.get("old_value"),
            "new_value": item.get("new_value"),
            "revision": item.get("revision"),
            "code": item.get("returned_code"),
            "changed_by": item.get("changed_by"),
            "source": item.get("source"),
        })
    if not events:
        events.append({"date": document.get("updated_at") or document.get("created_at"), "type": "current_state", "title": document.get("dci_status") or "Current document state", "revision": document.get("revision"), "code": document.get("returned_code"), "source": "current"})
    events.sort(key=lambda item: str(item.get("date") or ""))
    return {"document": document, "events": events}


@router.patch("/document/{document_id}")
def update_document(document_id: int, payload: DocumentUpdate) -> dict:
    client = get_db_client()
    current = get_document(document_id)
    values = payload.model_dump(exclude_none=True)
    actor = values.pop("actor_user_id", "system")
    event_type = values.pop("event_type", "dashboard_update")
    if values.get("revision_date") is not None:
        values["actual_submission_date"] = values.pop("revision_date")
    changes = {key: value.isoformat() if isinstance(value, date) else value for key, value in values.items() if key in EDITABLE_FIELDS}

    if "revision" in changes:
        changes["revision"] = canonical_revision(changes["revision"])
        if not is_valid_revision_transition(current.get("revision"), changes["revision"]):
            current_rev = canonical_revision(current.get("revision")) or "none"
            raise HTTPException(status_code=422, detail=f"Revision must advance sequentially from {current_rev}.")
    if "returned_code" in changes:
        changes["returned_code"] = canonical_code(changes["returned_code"])

    project_id = _project_id_for_document(current)
    changes["dci_status"] = _status_from_project_code(
        project_id,
        changes.get("returned_code", current.get("returned_code")),
        changes.get("actual_submission_date", current.get("actual_submission_date")),
        current.get("dci_status"),
    )
    changes["lifecycle_stage"] = changes["dci_status"]
    changes["last_changed_by"] = actor
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    old_values = {key: current.get(key) for key in changes if key not in {"updated_at", "last_changed_by"}}
    changed_values = {key: value for key, value in changes.items() if key in {"dci_status", "lifecycle_stage", "last_changed_by", "updated_at"} or str(current.get(key) or "") != str(value or "")}
    if not changed_values:
        return current

    updated = client.table("documents").update(changed_values).eq("id", document_id).execute()
    if not updated.data:
        raise HTTPException(status_code=409, detail="The document could not be updated.")

    history_rows = []
    for field, new_value in changed_values.items():
        if field in {"updated_at", "last_changed_by", "lifecycle_stage"}:
            continue
        old_value = old_values.get(field)
        if str(old_value or "") == str(new_value or ""):
            continue
        history_rows.append({
            "document_id": document_id,
            "import_id": current["import_id"],
            "event_type": event_type,
            "field_name": field,
            "old_value": None if old_value is None else str(old_value),
            "new_value": None if new_value is None else str(new_value),
            "revision": changed_values.get("revision", current.get("revision")),
            "returned_code": changed_values.get("returned_code", current.get("returned_code")),
            "status": changed_values.get("dci_status", current.get("dci_status")),
            "remarks": changed_values.get("remarks", current.get("remarks")),
            "changed_by": actor,
            "source": "dashboard",
            "event_date": datetime.now(timezone.utc).date().isoformat(),
            "metadata": {"actor_user_id": actor},
        })
    if history_rows:
        client.table("document_history").insert(history_rows).execute()

    try:
        raw = client.table("document_raw_data").select("row_data").eq("document_id", document_id).limit(1).execute()
        if raw.data:
            row_data = raw.data[0].get("row_data") or {}
            record = row_data.get("record") or {}
            field_map = {
                "document_title": "title", "discipline": "discipline", "vendor": "poc_submission",
                "revision": "latest_rev", "returned_code": "latest_code",
                "planned_submission_date": "schedule_submission_date",
                "actual_submission_date": "latest_uploaded_date", "review_date": "latest_from_eil_date",
                "remarks": "remarks",
            }
            for field, value in changed_values.items():
                record[field_map.get(field, field)] = value
            row_data["record"] = record
            client.table("document_raw_data").update({
                "row_data": row_data,
                "last_synchronized_at": datetime.now(timezone.utc).isoformat(),
            }).eq("document_id", document_id).execute()
    except Exception:
        pass

    return get_document(document_id)
