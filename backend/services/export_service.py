from __future__ import annotations

import io
import re
from datetime import date, datetime
from typing import Any

import openpyxl
from openpyxl.styles import Font, PatternFill

from backend.services.dci_service import canonical_revision
from backend.services.workbook_service import discover_dci_sheet_and_layout


def _all_rows(query: Any, page_size: int = 1000) -> list[dict]:
    output: list[dict] = []
    start = 0
    while True:
        response = query.range(start, start + page_size - 1).execute()
        batch = response.data or []
        output.extend(batch)
        if len(batch) < page_size:
            return output
        start += page_size


def _is_formula(cell: Any) -> bool:
    return cell.data_type == "f" or (isinstance(cell.value, str) and cell.value.startswith("="))


def _excel_value(value: Any) -> Any:
    if value in (None, ""):
        return None
    if isinstance(value, (date, datetime)):
        return value
    text = str(value).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        try:
            return date.fromisoformat(text)
        except ValueError:
            pass
    return value


def _write_preserving_formula(ws: Any, row: int, column: int | None, value: Any) -> None:
    if not column:
        return
    cell = ws.cell(row=row, column=column)
    if _is_formula(cell):
        return
    cell.value = _excel_value(value)
    if isinstance(cell.value, (date, datetime)):
        cell.number_format = "dd-mmm-yyyy"


def _find_revision_block(ws: Any, row: int, revision: Any, blocks: list[dict]) -> dict | None:
    wanted = canonical_revision(revision)
    for block in blocks:
        if canonical_revision(block.get("label")) == wanted:
            return block
        existing = ws.cell(row=row, column=block["revision"]).value
        if canonical_revision(existing) == wanted and wanted:
            return block
    for block in blocks:
        values = [
            ws.cell(row=row, column=block[key]).value
            for key in ("revision", "uploaded_date", "code", "from_eil_date")
        ]
        if all(value in (None, "") for value in values):
            return block
    return None


def generate_updated_workbook(client: Any, import_id: int) -> bytes:
    import_result = client.table("imports").select("*").eq("id", import_id).limit(1).execute()
    if not import_result.data:
        raise ValueError("Import not found.")
    meta = import_result.data[0]
    original = client.storage.from_(meta["storage_bucket"]).download(meta["original_storage_path"])
    workbook = openpyxl.load_workbook(io.BytesIO(original), data_only=False, keep_links=True)
    ws, layout = discover_dci_sheet_and_layout(workbook)

    documents = _all_rows(
        client.table("documents").select("*").eq("import_id", import_id).order("original_row_number")
    )
    columns = layout["columns"]
    warnings: list[str] = []

    for document in documents:
        row = int(document["original_row_number"])
        summary_values = {
            "doc_no": document.get("document_number"),
            "title": document.get("document_title"),
            "discipline": document.get("discipline"),
            "vendor": document.get("vendor"),
            "status": document.get("dci_status"),
            "latest_rev": document.get("revision"),
            "latest_uploaded_date": document.get("actual_submission_date"),
            "latest_code": document.get("returned_code"),
            "latest_from_eil_date": document.get("review_date"),
            "schedule_submission_date": document.get("planned_submission_date"),
            "remarks": document.get("remarks"),
        }
        for field, value in summary_values.items():
            _write_preserving_formula(ws, row, columns.get(field), value)

        block = _find_revision_block(ws, row, document.get("revision"), layout["revision_blocks"])
        if block:
            _write_preserving_formula(ws, row, block["revision"], document.get("revision"))
            _write_preserving_formula(ws, row, block["uploaded_date"], document.get("actual_submission_date"))
            _write_preserving_formula(ws, row, block["code"], document.get("returned_code"))
            _write_preserving_formula(ws, row, block["from_eil_date"], document.get("review_date"))
        elif any(document.get(key) for key in ("revision", "actual_submission_date", "returned_code", "review_date")):
            warnings.append(f"No free revision block for {document.get('document_number') or document['id']}.")

    if warnings:
        sheet_name = "Dashboard Export Warnings"
        if sheet_name in workbook.sheetnames:
            del workbook[sheet_name]
        warning_ws = workbook.create_sheet(sheet_name)
        warning_ws["A1"] = "Export warnings"
        warning_ws["A1"].font = Font(bold=True)
        warning_ws["A1"].fill = PatternFill("solid", fgColor="FFF2CC")
        for index, warning in enumerate(warnings, start=2):
            warning_ws.cell(index, 1, warning)
        warning_ws.column_dimensions["A"].width = 100

    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def generate_history_report(client: Any, import_id: int) -> bytes:
    documents = _all_rows(
        client.table("documents")
        .select("id,document_number,document_title,discipline,vendor")
        .eq("import_id", import_id)
    )
    document_map = {row["id"]: row for row in documents}
    events = _all_rows(
        client.table("document_history").select("*").eq("import_id", import_id).order("changed_at")
    )

    workbook = openpyxl.Workbook()
    ws = workbook.active
    ws.title = "Document History"
    headers = [
        "Document Number", "Document Title", "Discipline", "Vendor", "Event",
        "Field", "Old Value", "New Value", "Revision", "Return Code", "Status",
        "Changed By", "Changed At", "Source",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="D9EAF7")
    for event in events:
        document = document_map.get(event.get("document_id"), {})
        ws.append([
            document.get("document_number"), document.get("document_title"),
            document.get("discipline"), document.get("vendor"), event.get("event_type"),
            event.get("field_name"), event.get("old_value"), event.get("new_value"),
            event.get("revision"), event.get("returned_code"), event.get("status"),
            event.get("changed_by"), event.get("event_date") or event.get("changed_at"), event.get("source"),
        ])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for column in ws.columns:
        letter = column[0].column_letter
        ws.column_dimensions[letter].width = min(45, max(12, max(len(str(cell.value or "")) for cell in column) + 2))

    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()
