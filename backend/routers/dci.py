import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from fastapi import APIRouter, HTTPException
from repositories.db import get_db_client
import pandas as pd
from datetime import datetime

router = APIRouter()


def get_active_import(project_id: int):
    """Get the most recent active import for a project."""
    supabase = get_db_client()
    res = supabase.table("imports") \
        .select("*") \
        .eq("project_id", project_id) \
        .eq("is_active", True) \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()
    return res.data[0] if res.data else None


def get_docs_df(project_id: int) -> pd.DataFrame:
    """Return all documents for the most recent active import as a DataFrame."""
    supabase = get_db_client()
    imp = get_active_import(project_id)
    if not imp:
        return pd.DataFrame()
    res = supabase.table("documents") \
        .select("*") \
        .eq("import_id", imp["id"]) \
        .execute()
    return pd.DataFrame(res.data or [])


@router.get("/summary")
def get_summary(project_id: int = 1):
    imp = get_active_import(project_id)
    if not imp:
        return {"import": None, "total": 0}
    supabase = get_db_client()
    count_res = supabase.table("documents").select("id", count="exact").eq("import_id", imp["id"]).execute()
    return {
        "import": imp,
        "total": count_res.count or 0,
        "project_name": imp.get("project_name"),
        "contractor": imp.get("contractor"),
        "uploaded_at": imp.get("uploaded_at"),
        "review_period_days": imp.get("review_period_days", 21),
    }


@router.get("/document-choices")
def get_document_choices(project_id: int = 1):
    df = get_docs_df(project_id)
    if df.empty:
        return []
    # Return document list sorted by document_number
    subset = df[["id", "document_number", "document_title"]].dropna(subset=["document_number"])
    subset = subset.sort_values("document_number")
    return subset.to_dict(orient="records")


@router.get("/approval-status")
def get_approval_status(project_id: int = 1):
    df = get_docs_df(project_id)
    if df.empty:
        return {"counts": {}, "total": 0, "returned_counts": {}}

    total = len(df)
    status_counts = {}
    returned_counts = {}

    if "dci_status" in df.columns:
        status_counts = df["dci_status"].fillna("Unknown").value_counts().to_dict()
    if "returned_code" in df.columns:
        returned_counts = df["returned_code"].fillna("Pending").value_counts().to_dict()

    return {"counts": status_counts, "total": total, "returned_counts": returned_counts}


@router.get("/discipline-analysis")
def get_discipline_analysis(project_id: int = 1):
    df = get_docs_df(project_id)
    if df.empty or "discipline" not in df.columns:
        return []
    grouped = df.groupby("discipline").size().reset_index(name="total")
    return grouped.sort_values("total", ascending=False).to_dict(orient="records")


@router.get("/vendor-analysis")
def get_vendor_analysis(project_id: int = 1):
    df = get_docs_df(project_id)
    if df.empty or "vendor" not in df.columns:
        return []
    grouped = df.groupby("vendor").size().reset_index(name="total")
    return grouped.sort_values("total", ascending=False).to_dict(orient="records")


@router.get("/delays-aging")
def get_delays_aging(project_id: int = 1):
    imp = get_active_import(project_id)
    df = get_docs_df(project_id)
    if df.empty:
        return []

    review_period = int(imp.get("review_period_days", 21)) if imp else 21
    today = datetime.now().date()
    result = []

    # Use aging_days column if available
    if "aging_days" in df.columns:
        aged = df[df["aging_days"].notna() & (df["aging_days"] > review_period)].copy()
        for _, row in aged.iterrows():
            age = int(row["aging_days"])
            result.append({
                "doc_no": row.get("document_number") or row.get("document_key") or str(row["id"]),
                "title": row.get("document_title") or "Untitled",
                "discipline": row.get("discipline") or "–",
                "vendor": row.get("vendor") or "–",
                "age_days": age,
                "overdue_by": max(0, age - review_period),
                "status": row.get("dci_status") or "Unknown",
                "submission_date": str(row.get("actual_submission_date") or ""),
            })
    else:
        # Fallback: compute from actual_submission_date
        for _, row in df.iterrows():
            date_val = row.get("actual_submission_date")
            if not date_val:
                continue
            try:
                sub_dt = datetime.fromisoformat(str(date_val)[:10]).date()
                age = (today - sub_dt).days
                if age > review_period:
                    result.append({
                        "doc_no": row.get("document_number") or str(row["id"]),
                        "title": row.get("document_title") or "Untitled",
                        "discipline": row.get("discipline") or "–",
                        "vendor": row.get("vendor") or "–",
                        "age_days": age,
                        "overdue_by": age - review_period,
                        "status": row.get("dci_status") or "Unknown",
                        "submission_date": str(sub_dt),
                    })
            except Exception:
                continue

    result.sort(key=lambda x: x["age_days"], reverse=True)
    return result


@router.get("/timeline")
def get_timeline(project_id: int = 1):
    df = get_docs_df(project_id)
    if df.empty:
        return []
    for col in ["actual_submission_date", "planned_submission_date", "created_at"]:
        if col in df.columns and df[col].notna().any():
            df["_month"] = pd.to_datetime(df[col], errors="coerce").dt.to_period("M").astype(str)
            monthly = df[df["_month"] != "NaT"].groupby("_month").size().reset_index(name="count")
            monthly.columns = ["month", "count"]
            return monthly.sort_values("month").to_dict(orient="records")
    return []


@router.get("/register")
def get_register(project_id: int = 1, page: int = 1, page_size: int = 50, search: str = ""):
    df = get_docs_df(project_id)
    if df.empty:
        return {"data": [], "total": 0, "page": page, "page_size": page_size}

    # Keep useful columns only
    keep_cols = [c for c in [
        "document_number", "document_title", "discipline", "vendor",
        "document_type", "revision", "dci_status", "returned_code",
        "planned_submission_date", "actual_submission_date",
        "review_date", "lifecycle_stage", "aging_days", "assigned_engineer"
    ] if c in df.columns]
    df = df[keep_cols]

    if search:
        mask = df.apply(lambda row: row.astype(str).str.contains(search, case=False, na=False).any(), axis=1)
        df = df[mask]

    total = len(df)
    start = (page - 1) * page_size
    page_df = df.iloc[start: start + page_size].fillna("–")
    return {"data": page_df.to_dict(orient="records"), "total": total, "page": page, "page_size": page_size}
