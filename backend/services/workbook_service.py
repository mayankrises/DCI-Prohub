import io
import openpyxl
import pandas as pd
import numpy as np
from datetime import datetime, date
import hashlib

# Core workbook parser and inspector services extracted from dashboard.py
# ----------------------------------------------------------------------------
# EXCEL TEMPLATE DISCOVERY + PARSING
# ----------------------------------------------------------------------------
def _normalise_header(value):
    """Normalise a worksheet header so harmless punctuation/case changes do not matter."""
    import re

    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("\r", " ").strip().upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return " ".join(text.split())


HEADER_ALIASES = {
    "sr_no": {"SR NO", "SERIAL NO", "S NO"},
    "doc_no": {"DOCUMENT NUMBER", "DOCUMENT NO", "DOC NO", "STS DOCUMENT NUMBER"},
    "title": {"DOCUMENT TITLE", "TITLE", "DOCUMENT DESCRIPTION"},
    "discipline": {"DISCIPLINE"},
    "vendor": {"VENDOR NAME", "VENDOR", "POC", "VENDOR CONSULTANT POC"},
    "status": {"DCI STATUS", "STATUS", "FRESH RESUBMISSION"},
    "latest_rev": {"REV", "LATEST REV", "LATEST REVISION", "CURRENT REVISION"},
    "latest_uploaded_date": {"UPLOADED DATE", "ACTUAL SUBMISSION DATE", "REVISION DATE"},
    "eil_review_status": {"EIL REVIEW STATUS", "REVIEW STATUS"},
    "latest_code": {"CODE", "RETURN CODE", "RETURNED CODE"},
    "latest_from_eil_date": {"RECEIVED DATE", "FROM EIL DATE", "RETURN DATE", "REVIEW DATE"},
    "category": {"CATEGORY"},
    "l4_marked": {"L4 MARKED", "L 4 MARKED"},
    "schedule_submission_date": {"SCHEDULE SUBMISSION DATE", "PLANNED SUBMISSION DATE"},
    "remarks": {"REMARKS", "COMMENTS"},
    "eil_mandays": {"EIL MANDAYS", "EIL MAN DAYS"},
    "eil_manhours": {"EIL MANHOURS", "EIL MAN HOURS"},
    "stspl_mandays": {"STSPL MANDAYS", "STSPL MAN DAYS"},
    "stspl_manhours": {"STSPL MANHOURS", "STSPL MAN HOURS"},
    "revision_cycle": {"REVISION CYCLE"},
    "expected_manhours": {"EXPECTED MANHOURS", "EXPECTED MAN HOURS"},
}


def _header_matches(value, aliases):
    return _normalise_header(value) in aliases


def _looks_like_revision_header(value):
    """Recognise REV-0 / Rev 1 / LATEST REV. style history-block headers."""
    import re

    h = _normalise_header(value)
    if h in {"LATEST REV", "REVISION", "REV"}:
        return True
    return bool(re.fullmatch(r"REV(?:ISION)?\s*\d+", h))


def _looks_like_upload_header(value):
    return _normalise_header(value) in {
        "UPLOADED DATE", "UPLOAD DATE", "REVISION DATE", "ACTUAL SUBMISSION DATE"
    }


def _looks_like_code_header(value):
    return _normalise_header(value) in {"CODE", "RETURN CODE", "RETURNED CODE"}


def _looks_like_return_header(value):
    return _normalise_header(value) in {
        "FROM EIL DATE", "RECEIVED DATE", "RETURN DATE", "REVIEW DATE"
    }


def _row_header_values(ws, row):
    """Return normalized values for one row, expanding merged-cell anchors."""
    merged_lookup = {}
    for merged in ws.merged_cells.ranges:
        anchor = ws.cell(merged.min_row, merged.min_col).value
        for rr in range(merged.min_row, merged.max_row + 1):
            if rr != row:
                continue
            for cc in range(merged.min_col, merged.max_col + 1):
                merged_lookup[cc] = anchor

    values = []
    for col in range(1, ws.max_column + 1):
        value = ws.cell(row=row, column=col).value
        if value in (None, "") and col in merged_lookup:
            value = merged_lookup[col]
        values.append(_normalise_header(value))
    return values


def _header_row_score(ws, row):
    """Score how likely a row is to be the main DCI table header."""
    values = set(_row_header_values(ws, row))
    has_doc = bool(values & HEADER_ALIASES["doc_no"])
    supporting = sum(
        bool(values & HEADER_ALIASES[key])
        for key in ("title", "discipline", "vendor", "latest_rev", "latest_code")
    )
    revision_signals = sum(1 for value in values if _looks_like_revision_header(value))
    score = (100 if has_doc else 0) + supporting * 12 + min(revision_signals, 10)
    return score, has_doc, supporting


def _find_header_row(ws, scan_rows=60):
    """Discover the table-header row from semantic header names.

    The engine scans the top part of the sheet and chooses the strongest row
    containing Document Number plus at least two supporting DCI headers. It does
    not assume row 5, row 8, or any other fixed position.
    """
    candidates = []
    limit = min(scan_rows, ws.max_row)
    for row in range(1, limit + 1):
        score, has_doc, supporting = _header_row_score(ws, row)
        if has_doc and supporting >= 2:
            candidates.append((score, row))

    if not candidates:
        raise ValueError(
            "Could not locate the DCI table header. The workbook must contain a "
            "Document Number header and at least two of Document Title, Discipline, "
            "Vendor, Revision, or Code."
        )

    candidates.sort(reverse=True)
    return candidates[0][1]


def _extract_revision_label(*values):
    """Extract an explicit revision identifier from REV-0 / Revision A labels.

    Generic summary headers such as ``REV.`` or ``LATEST REV.`` intentionally
    return None so they are not mistaken for revision-history blocks.
    """
    import re

    for value in values:
        text = _normalise_header(value)
        match = re.fullmatch(r"REV(?:ISION)?\s*[-_:]?\s*([A-Z0-9][A-Z0-9._-]*)", text)
        if match:
            label = match.group(1).strip("._-")
            if label:
                return label
    return None


def _discover_revision_blocks(ws, header_row):
    """Discover revision-history blocks from a two/three-row header band.

    Supported examples include:
      REV-0 | UPLOADED DATE | CODE | FROM EIL DATE
    and a merged parent label above a detail row such as:
      [Rev-0 merged across four columns]
      REV.  | REVISION DATE | RETURN CODE | RETURN DATE

    Columns can move and extra unrelated columns can appear between blocks.
    """
    detail_rows = range(max(1, header_row - 2), min(ws.max_row, header_row + 1) + 1)
    blocks = []
    used_revision_columns = set()

    for detail_row in detail_rows:
        for col in range(1, ws.max_column + 1):
            first = ws.cell(detail_row, col).value
            parent1 = ws.cell(detail_row - 1, col).value if detail_row > 1 else None
            parent2 = ws.cell(detail_row - 2, col).value if detail_row > 2 else None

            revision_label = _extract_revision_label(first, parent1, parent2)
            if revision_label is None:
                continue

            # Locate the three companion headers within a bounded window. This
            # tolerates inserted helper columns without pairing with another block.
            window_end = min(ws.max_column, col + 7)
            upload_col = code_col = return_col = None
            for candidate in range(col + 1, window_end + 1):
                value = ws.cell(detail_row, candidate).value
                if upload_col is None and _looks_like_upload_header(value):
                    upload_col = candidate
                elif code_col is None and _looks_like_code_header(value):
                    code_col = candidate
                elif return_col is None and _looks_like_return_header(value):
                    return_col = candidate

            if not all((upload_col, code_col, return_col)):
                continue
            if not (col < upload_col < code_col < return_col):
                continue
            if col in used_revision_columns:
                continue

            blocks.append({
                "revision": col,
                "uploaded_date": upload_col,
                "code": code_col,
                "from_eil_date": return_col,
                "label": revision_label,
                "header_row": detail_row,
            })
            used_revision_columns.add(col)

    blocks.sort(key=lambda block: block["revision"])
    if not blocks:
        raise ValueError(
            "No revision-history blocks were found. Expected headers equivalent to "
            "Revision | Uploaded/Revision Date | Code | From EIL/Return Date."
        )
    return blocks


def _find_first_matching_column(ws, header_row, aliases, *, before_col=None, after_col=None):
    start = max(1, (after_col or 0) + 1)
    end = min(ws.max_column, (before_col - 1) if before_col else ws.max_column)
    for row in range(max(1, header_row - 2), min(ws.max_row, header_row + 1) + 1):
        for col in range(start, end + 1):
            if _header_matches(ws.cell(row, col).value, aliases):
                return col
    return None


def _discover_data_start_row(ws, header_row, doc_no_col, scan_limit=30):
    """Find the first actual document row below the discovered header."""
    max_row = min(ws.max_row, header_row + scan_limit)
    for row in range(header_row + 1, max_row + 1):
        value = ws.cell(row=row, column=doc_no_col).value
        if value is not None and str(value).strip():
            return row
    # Empty templates are valid: data will begin immediately below the header.
    return header_row + 1


def discover_dci_layout(ws):
    """Build a complete, runtime-discovered template profile for a DCI sheet."""
    header_row = _find_header_row(ws)
    revision_blocks = _discover_revision_blocks(ws, header_row)
    first_revision_col = min(block["revision"] for block in revision_blocks)
    last_revision_col = max(block["from_eil_date"] for block in revision_blocks)

    columns = {}
    for key in (
        "sr_no", "doc_no", "title", "discipline", "vendor", "status",
        "latest_rev", "latest_uploaded_date", "eil_review_status", "latest_code",
        "latest_from_eil_date", "category", "l4_marked", "schedule_submission_date",
    ):
        columns[key] = _find_first_matching_column(
            ws, header_row, HEADER_ALIASES[key], before_col=first_revision_col
        )

    for key in (
        "remarks", "eil_mandays", "eil_manhours", "stspl_mandays",
        "stspl_manhours", "revision_cycle", "expected_manhours",
    ):
        columns[key] = _find_first_matching_column(
            ws, header_row, HEADER_ALIASES[key], after_col=last_revision_col
        )
        if columns[key] is None:
            columns[key] = _find_first_matching_column(ws, header_row, HEADER_ALIASES[key])

    missing = [name for name in ("doc_no", "title", "discipline") if columns.get(name) is None]
    if missing:
        raise ValueError(
            "The DCI header was found, but required columns are missing: " + ", ".join(missing)
        )

    data_start_row = _discover_data_start_row(ws, header_row, columns["doc_no"])
    return {
        "engine_version": TEMPLATE_ENGINE_VERSION,
        "sheet_name": ws.title,
        "header_row": header_row,
        "data_start_row": data_start_row,
        "columns": columns,
        "revision_blocks": revision_blocks,
    }


def discover_dci_sheet_and_layout(workbook):
    """Discover the DCI sheet and its layout from any supplied workbook.

    Exact sheet name 'DCI' is preferred, but a normal Excel file may use another
    sheet name. In that case every visible worksheet is scored semantically.
    """
    candidates = []
    preferred = ["DCI"] if "DCI" in workbook.sheetnames else []
    sheet_names = preferred + [name for name in workbook.sheetnames if name not in preferred]

    errors = []
    for name in sheet_names:
        ws = workbook[name]
        if ws.sheet_state != "visible":
            continue
        try:
            layout = discover_dci_layout(ws)
            score, _, supporting = _header_row_score(ws, layout["header_row"])
            score += len(layout["revision_blocks"]) * 5 + supporting
            if name == "DCI":
                score += 1000
            candidates.append((score, ws, layout))
        except ValueError as exc:
            errors.append(f"{name}: {exc}")

    if not candidates:
        detail = "; ".join(errors[:4])
        raise ValueError(
            "No compatible DCI worksheet could be discovered in this workbook. "
            + (f"Checked sheets: {detail}" if detail else "")
        )

    candidates.sort(key=lambda item: item[0], reverse=True)
    _, ws, layout = candidates[0]
    return ws, layout


def layout_summary(layout):
    """Return human-readable discovery diagnostics for import preview/debugging."""
    from openpyxl.utils import get_column_letter

    detected = {}
    for field, column in layout["columns"].items():
        if column:
            detected[field] = f"{get_column_letter(column)} ({column})"
    blocks = []
    for block in layout["revision_blocks"]:
        blocks.append({
            "label": block.get("label"),
            "revision": get_column_letter(block["revision"]),
            "revision_date": get_column_letter(block["uploaded_date"]),
            "code": get_column_letter(block["code"]),
            "return_date": get_column_letter(block["from_eil_date"]),
        })
    return {
        "sheet": layout["sheet_name"],
        "header_row": layout["header_row"],
        "data_start_row": layout["data_start_row"],
        "fields": detected,
        "revision_blocks": blocks,
    }

def _find_label_value(ws, label, scan_rows=12):
    wanted = _normalise_header(label)
    for row in range(1, min(scan_rows, ws.max_row) + 1):
        for col in range(1, min(ws.max_column, 20) + 1):
            if _normalise_header(ws.cell(row, col).value) != wanted:
                continue
            # Values can be in the next cell or farther right because of merges.
            for next_col in range(col + 1, min(ws.max_column, col + 12) + 1):
                value = ws.cell(row, next_col).value
                if value not in (None, ""):
                    return value
    return None


def _cell_value(ws, row, columns, field):
    col = columns.get(field)
    return ws.cell(row=row, column=col).value if col else None



def _normalise_import_code(value):
    """Convert template labels such as Code-2 / CODE 1 to canonical DCI codes."""
    import re

    if value is None or value == "":
        return None
    text = str(value).strip().upper()
    text = re.sub(r"^CODE\s*[-:]?\s*", "", text)
    text = " ".join(text.split())
    return text or None

def parse_workbook_bytes(file_bytes):
    """Parse any DCI workbook matching the supplied template's header names.

    The header row, data start row and revision blocks are discovered at runtime;
    moving the table from row 8 to row 5 no longer breaks imports.
    """
    import openpyxl

    _validate_xlsx_container(file_bytes)
    wb = openpyxl.load_workbook(
        io.BytesIO(file_bytes),
        data_only=True,
        read_only=False,
        keep_links=True,
    )
    ws, layout = discover_dci_sheet_and_layout(wb)
    columns = layout["columns"]

    project_name = _find_label_value(ws, "PROJECT")
    contractor = _find_label_value(ws, "CONTRACTOR")
    records, history = [], []

    consecutive_empty_rows = 0
    for r in range(layout["data_start_row"], ws.max_row + 1):
        doc_no = _cell_value(ws, r, columns, "doc_no")
        if doc_no is None or str(doc_no).strip() == "":
            consecutive_empty_rows += 1
            if records and consecutive_empty_rows >= MAX_CONSECUTIVE_EMPTY_ROWS:
                break
            continue
        consecutive_empty_rows = 0
        if _normalise_header(doc_no) in HEADER_ALIASES["doc_no"]:
            # Ignore repeated headers sometimes inserted between print sections.
            continue

        vendor = _cell_value(ws, r, columns, "vendor")
        rec = {
            "sr_no": _cell_value(ws, r, columns, "sr_no"),
            "doc_no": str(doc_no).strip(),
            "title": _cell_value(ws, r, columns, "title"),
            "discipline": _cell_value(ws, r, columns, "discipline"),
            "poc_submission": vendor,
            "latest_rev": _cell_value(ws, r, columns, "latest_rev"),
            "latest_uploaded_date": _date_jsonable(_cell_value(ws, r, columns, "latest_uploaded_date")),
            "eil_review_status": _cell_value(ws, r, columns, "eil_review_status"),
            "latest_code": _normalise_import_code(_cell_value(ws, r, columns, "latest_code")),
            "latest_from_eil_date": _date_jsonable(_cell_value(ws, r, columns, "latest_from_eil_date")),
            "category": _cell_value(ws, r, columns, "category"),
            "l4_marked": _cell_value(ws, r, columns, "l4_marked"),
            "schedule_submission_date": _date_jsonable(_cell_value(ws, r, columns, "schedule_submission_date")),
            "status": _cell_value(ws, r, columns, "status"),
            "poc": vendor,
            "eil_mandays": _cell_value(ws, r, columns, "eil_mandays"),
            "eil_manhours": _cell_value(ws, r, columns, "eil_manhours"),
            "stspl_mandays": _cell_value(ws, r, columns, "stspl_mandays"),
            "stspl_manhours": _cell_value(ws, r, columns, "stspl_manhours"),
            "revision_cycle": _cell_value(ws, r, columns, "revision_cycle"),
            "expected_manhours": _cell_value(ws, r, columns, "expected_manhours"),
            "remarks": _cell_value(ws, r, columns, "remarks") or "",
            "assigned_engineer": "",
            "action_owner": "",
            "expected_completion_date": None,
            "forecast_month": "",
            "approval_date": None,
            "original_row_number": r,
        }
        rec["document_key"] = f"{rec['doc_no']}::ROW-{r}"

        row_history = []
        for block in layout["revision_blocks"]:
            rev_no = ws.cell(row=r, column=block["revision"]).value
            uploaded = ws.cell(row=r, column=block["uploaded_date"]).value
            code = ws.cell(row=r, column=block["code"]).value
            from_eil = ws.cell(row=r, column=block["from_eil_date"]).value
            if all(value in (None, "") for value in (rev_no, uploaded, code, from_eil)):
                continue
            row_history.append({
                "doc_no": rec["doc_no"],
                "rev_no": rev_no,
                "uploaded_date": _date_jsonable(uploaded),
                "code": _normalise_import_code(code),
                "from_eil_date": _date_jsonable(from_eil),
            })

        # Some templates calculate the current summary fields from revision blocks.
        # If cached formula results are absent, fall back to the last populated block.
        if row_history:
            latest_history = row_history[-1]
            if rec["latest_rev"] in (None, ""):
                rec["latest_rev"] = latest_history["rev_no"]
            if rec["latest_uploaded_date"] in (None, ""):
                rec["latest_uploaded_date"] = latest_history["uploaded_date"]
            if rec["latest_code"] in (None, ""):
                rec["latest_code"] = latest_history["code"]
            if rec["latest_from_eil_date"] in (None, ""):
                rec["latest_from_eil_date"] = latest_history["from_eil_date"]

        rec["_history_rows"] = row_history
        records.append(rec)
        history.extend(row_history)

    return records, history, project_name, contractor


def _jsonable(value):
    """Make an openpyxl cell value safe to store in JSONB."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _date_jsonable(value):
    """Convert genuine Excel/Python dates to ISO without accepting return codes."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.date().isoformat()

    # Numeric Excel serials may appear when the cell lacks a date format.
    # Accept only plausible modern serials; short numeric return codes remain invalid.
    if isinstance(value, (int, float, np.integer, np.floating)):
        if pd.isna(value) or not (20000 <= float(value) <= 80000):
            return None
        try:
            return pd.to_datetime(float(value), unit="D", origin="1899-12-30").date().isoformat()
        except Exception:
            return None

    text = str(value).strip()
    if not text or _normalise_header(text) in {"R", "V", "CODE 1", "CODE 2", "CODE 3"}:
        return None
    try:
        parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
        return None if pd.isna(parsed) else parsed.date().isoformat()
    except Exception:
        return None



def _validate_xlsx_container(file_bytes):
    """Reject oversized, renamed, encrypted, or malformed uploads before parsing."""
    if not isinstance(file_bytes, (bytes, bytearray)) or not file_bytes:
        raise ValueError("The uploaded workbook is empty.")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"The workbook is larger than the allowed {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )
    if not zipfile.is_zipfile(io.BytesIO(file_bytes)):
        raise ValueError("This is not a valid .xlsx workbook.")
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            names = set(archive.namelist())
            required = {"[Content_Types].xml", "xl/workbook.xml"}
            if not required.issubset(names):
                raise ValueError("The uploaded file is not a valid Excel .xlsx package.")
            encrypted_markers = {"EncryptedPackage", "EncryptionInfo"}
            if names & encrypted_markers:
                raise ValueError("Password-protected Excel workbooks are not supported.")
    except zipfile.BadZipFile as exc:
        raise ValueError("The uploaded workbook is damaged or incomplete.") from exc


def workbook_hash(file_bytes):
    """Stable content fingerprint used for exact-duplicate detection."""
    return hashlib.sha256(file_bytes).hexdigest()


def validate_records(records):
    """Validate parsed document rows without guessing or silently discarding problems."""
    warnings, errors = [], []
    if not records:
        errors.append(
            "The workbook structure was recognised, but no document rows containing "
            "a Document Number were found."
        )
        return warnings, errors

    seen = {}
    duplicate_numbers = set()
    for record in records:
        doc_no = str(record.get("doc_no") or "").strip()
        if not doc_no:
            errors.append(
                f"Excel row {record.get('original_row_number', '?')} has no Document Number."
            )
            continue
        if doc_no in seen:
            duplicate_numbers.add(doc_no)
        else:
            seen[doc_no] = record.get("original_row_number")

    if duplicate_numbers:
        sample = ", ".join(sorted(duplicate_numbers)[:10])
        warnings.append(
            f"{len(duplicate_numbers)} duplicate Document Number value(s) were found: {sample}"
            + (" …" if len(duplicate_numbers) > 10 else "")
            + ". They will remain separate records using their original Excel row numbers."
        )

    missing_titles = [
        record.get("original_row_number")
        for record in records
        if not str(record.get("title") or "").strip()
    ]
    if missing_titles:
        warnings.append(f"{len(missing_titles)} document row(s) have no Document Title.")

    invalid_history_dates = 0
    for record in records:
        for event in record.get("_history_rows", []):
            uploaded = pd.to_datetime(event.get("uploaded_date"), errors="coerce")
            returned = pd.to_datetime(event.get("from_eil_date"), errors="coerce")
            if pd.notna(uploaded) and pd.notna(returned) and returned < uploaded:
                invalid_history_dates += 1
    if invalid_history_dates:
        warnings.append(
            f"{invalid_history_dates} revision block(s) have a Return Date earlier than "
            "their Revision Date. They will be retained but excluded from turnaround metrics."
        )

    return warnings, errors


def inspect_workbook_bytes(file_bytes):
    """Validate and discover a workbook once, returning reusable diagnostics."""
    import openpyxl

    _validate_xlsx_container(file_bytes)
    workbook = openpyxl.load_workbook(
        io.BytesIO(file_bytes),
        data_only=False,
        read_only=False,
        keep_links=True,
    )
    worksheet, layout = discover_dci_sheet_and_layout(workbook)
    return worksheet, layout, layout_summary(layout)


# ----------------------------------------------------------------------------
# IMPORT WORKFLOW (Supabase writes)
# ----------------------------------------------------------------------------
def find_import_by_hash(supabase, file_hash, project_id=None):
    query = (
        supabase.table("imports")
        .select("*")
        .eq("workbook_hash", file_hash)
        .eq("is_active", True)
    )
    if project_id is not None:
        query = query.eq("project_id", project_id)
    res = query.order("uploaded_at", desc=True).limit(1).execute()
    return res.data[0] if res.data else None


def list_imports(supabase, project_id=None):
    query = (
        supabase.table("imports")
        .select("*")
        .eq("is_active", True)
    )
    if project_id is not None:
        query = query.eq("project_id", project_id)
    res = query.order("uploaded_at", desc=True).execute()
    return res.data or []


def list_projects(supabase):
    res = (
        supabase.table("projects")
        .select("*")
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def get_project(supabase, project_id):
    res = supabase.table("projects").select("*").eq("id", project_id).single().execute()
    return res.data


