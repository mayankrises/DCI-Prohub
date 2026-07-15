from __future__ import annotations

import io
import os
from datetime import datetime, timezone
from collections.abc import Iterable
from typing import Any

from backend.services.dci_service import canonical_code, canonical_revision, derive_status
from backend.services.workbook_service import (
    find_import_by_hash,
    inspect_workbook_bytes,
    layout_summary,
    parse_workbook_bytes,
    validate_records,
    workbook_hash,
)

WORKBOOK_BUCKET = os.getenv("DCI_WORKBOOK_BUCKET", "dci-workbooks")


def _chunks(items: list[dict], size: int = 200) -> Iterable[list[dict]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _ensure_bucket(client: Any, bucket: str) -> None:
    try:
        names = []
        for item in client.storage.list_buckets():
            names.append(getattr(item, "name", None) or (item.get("name") if isinstance(item, dict) else None))
        if bucket not in names:
            client.storage.create_bucket(bucket, options={"public": False})
    except Exception:
        # The bucket may already exist while bucket-list permission is restricted.
        pass


def _safe_filename(filename: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in ".-_" else "_" for char in filename)
    return cleaned or "workbook.xlsx"


def preview_workbook(content: bytes, filename: str | None = None) -> dict[str, Any]:
    _, layout, diagnostics = inspect_workbook_bytes(content)
    records, history, project_name, contractor = parse_workbook_bytes(content)
    warnings, errors = validate_records(records)
    return {
        "filename": filename or "workbook.xlsx",
        "workbook_hash": workbook_hash(content),
        "project_name": project_name,
        "contractor": contractor,
        "document_count": len(records),
        "history_count": len(history),
        "warnings": warnings,
        "errors": errors,
        "layout": diagnostics or layout_summary(layout),
    }


def _record_to_document(record: dict[str, Any], project_id: int, import_id: int) -> dict[str, Any]:
    revision = canonical_revision(record.get("latest_rev"))
    code = canonical_code(record.get("latest_code"))
    submitted = record.get("latest_uploaded_date")
    reviewed = record.get("latest_from_eil_date")
    status = derive_status(code, submitted, record.get("status"))
    return {
        "project_id": project_id,
        "import_id": import_id,
        "document_key": record["document_key"],
        "original_row_number": record["original_row_number"],
        "document_number": record.get("doc_no"),
        "document_title": record.get("title"),
        "discipline": record.get("discipline"),
        "vendor": record.get("poc_submission") or record.get("poc"),
        "document_type": record.get("category"),
        "revision": revision,
        "dci_status": status,
        "returned_code": code,
        "planned_submission_date": record.get("schedule_submission_date"),
        "actual_submission_date": submitted,
        "review_date": reviewed,
        "approval_date": record.get("approval_date") if code in {"1", "R"} else None,
        "forecast_month": record.get("forecast_month") or "",
        "remarks": record.get("remarks") or "",
        "assigned_engineer": record.get("assigned_engineer") or "",
        "action_owner": record.get("action_owner") or "",
        "expected_completion_date": record.get("expected_completion_date"),
        "lifecycle_stage": status,
        "aging_days": None,
        "is_active": True,
    }


def import_workbook(
    client: Any,
    content: bytes,
    filename: str,
    project_id: int,
    actor_user_id: str,
    mode: str = "replace",
) -> dict[str, Any]:
    """Persist the original workbook, parsed rows, raw rows and revision history."""
    file_hash = workbook_hash(content)
    if find_import_by_hash(client, file_hash, project_id):
        raise RuntimeError("This exact workbook is already the active import for this project.")

    records, history, parsed_project_name, parsed_contractor = parse_workbook_bytes(content)
    warnings, errors = validate_records(records)
    if errors:
        raise ValueError("; ".join(errors))

    prior = (
        client.table("imports")
        .select("id,version_number")
        .eq("project_id", project_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    ).data or []
    version_number = int(prior[0].get("version_number") or 0) + 1 if prior else 1
    parent_import_id = prior[0]["id"] if prior and mode != "separate" else None

    project_result = client.table("projects").select("*").eq("id", project_id).limit(1).execute()
    if not project_result.data:
        raise ValueError("The selected project does not exist.")
    project = project_result.data[0]

    import_row = {
        "project_id": project_id,
        "original_filename": filename,
        "display_name": filename,
        "project_name": parsed_project_name or project.get("project_name"),
        "contractor": parsed_contractor or project.get("contractor"),
        "version_number": version_number,
        "parent_import_id": parent_import_id,
        "uploaded_by": actor_user_id,
        "source_sheet_name": "DCI",
        "row_count": len(records),
        "workbook_hash": file_hash,
        "storage_bucket": WORKBOOK_BUCKET,
        "original_storage_path": "pending",
        "review_period_days": project.get("review_period_days") or 21,
        "validation_status": "warning" if warnings else "valid",
        "import_status": "pending",
        "warning_count": len(warnings),
        "error_count": 0,
        "is_active": False,
    }
    created = client.table("imports").insert(import_row).execute()
    if not created.data:
        raise RuntimeError("The import record could not be created.")
    import_id = int(created.data[0]["id"])
    storage_path = f"projects/{project_id}/imports/{import_id}/{_safe_filename(filename)}"

    try:
        _ensure_bucket(client, WORKBOOK_BUCKET)
        client.storage.from_(WORKBOOK_BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={
                "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "upsert": "false",
            },
        )
        client.table("imports").update({"original_storage_path": storage_path}).eq("id", import_id).execute()

        document_rows = [_record_to_document(record, project_id, import_id) for record in records]
        inserted_documents: list[dict] = []
        for batch in _chunks(document_rows):
            response = client.table("documents").insert(batch).execute()
            inserted_documents.extend(response.data or [])
        ids_by_key = {row["document_key"]: row["id"] for row in inserted_documents}
        if len(ids_by_key) != len(records):
            fetched = client.table("documents").select("id,document_key").eq("import_id", import_id).execute()
            ids_by_key = {row["document_key"]: row["id"] for row in fetched.data or []}

        raw_rows: list[dict] = []
        history_rows: list[dict] = []
        for record in records:
            document_id = ids_by_key.get(record["document_key"])
            if document_id is None:
                raise RuntimeError(f"Could not map imported row {record['document_key']} to its document record.")
            raw_rows.append({
                "document_id": document_id,
                "row_data": {"record": {key: value for key, value in record.items() if key != "_history_rows"}, "history_rows": record.get("_history_rows", [])},
                "original_column_names": list(record.keys()),
                "original_row_number": record["original_row_number"],
            })
            for event in record.get("_history_rows", []):
                code = canonical_code(event.get("code"))
                history_rows.append({
                    "document_id": document_id,
                    "import_id": import_id,
                    "event_type": "import_revision",
                    "field_name": "revision",
                    "old_value": None,
                    "new_value": canonical_revision(event.get("rev_no")),
                    "revision": canonical_revision(event.get("rev_no")),
                    "returned_code": code,
                    "status": derive_status(code, event.get("uploaded_date")),
                    "remarks": "Imported from workbook revision block",
                    "changed_by": actor_user_id,
                    "source": "workbook_import",
                    "import_version": version_number,
                    "event_date": event.get("from_eil_date") or event.get("uploaded_date"),
                    "metadata": event,
                })

        for batch in _chunks(raw_rows):
            client.table("document_raw_data").insert(batch).execute()
        for batch in _chunks(history_rows):
            client.table("document_history").insert(batch).execute()

        if mode in {"replace", "version"}:
            client.table("imports").update({"is_active": False}).eq("project_id", project_id).neq("id", import_id).execute()
        client.table("imports").update({"is_active": True, "import_status": "complete"}).eq("id", import_id).execute()
        client.table("projects").update({"updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", project_id).execute()
    except Exception:
        try:
            client.table("imports").update({"is_active": False, "import_status": "failed", "error_count": 1}).eq("id", import_id).execute()
        finally:
            raise

    return {
        "status": "complete",
        "import_id": import_id,
        "row_count": len(records),
        "document_count": len(records),
        "history_count": len(history),
        "warnings": warnings,
        "version_number": version_number,
    }
