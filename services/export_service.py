import pymupdf as fitz  # PyMuPDF 1.25+
import io
import os
from repositories.document_repository import DocumentRepository
from repositories.annotation_repository import AnnotationRepository
from repositories.db import get_collab_db_client

class ExportService:
    def __init__(self):
        self.doc_repo = DocumentRepository()
        self.ann_repo = AnnotationRepository()
        self.supabase = get_collab_db_client()

    def generate_annotated_pdf(self, file_id: str) -> tuple[bytes, str]:
        """Download original file, overlay annotations, append summary, return bytes + filename."""
        file_rec = self.doc_repo.get_file_by_id(file_id)
        if not file_rec:
            raise ValueError("Document file record not found.")

        # Fetch annotations and replies
        annotations = self.ann_repo.list_annotations(file_id, include_resolved=True)
        for index, ann in enumerate(annotations):
            ann["replies"] = self.ann_repo.list_replies(ann["id"])
            ann["index"] = index + 1

        # Download original file bytes from Supabase Storage (collab project)
        try:
            res_bytes = self.supabase.storage.from_("project-documents").download(file_rec["storage_path"])
        except Exception as e:
            raise RuntimeError(f"Failed to download document from storage: {e}")

        ext = file_rec["file_extension"].lower()
        if ext == ".pdf":
            doc = fitz.open(stream=res_bytes, filetype="pdf")
        elif ext in (".png", ".jpg", ".jpeg"):
            doc = fitz.open()
            rect = fitz.Rect(0, 0, 595, 842)
            page = doc.new_page(width=595, height=842)
            page.insert_image(rect, stream=res_bytes)
        else:
            raise ValueError(f"Unsupported file format for export: {ext}")

        # Draw annotations on each page
        for ann in annotations:
            page_num = ann["page_number"] - 1
            if page_num < 0 or page_num >= len(doc):
                continue
            page = doc[page_num]
            pw, ph = page.rect.width, page.rect.height
            geo = ann["geometry"]
            style = ann.get("style") or {}

            stroke_hex = style.get("stroke", "#ff4757").lstrip("#")
            if len(stroke_hex) == 6:
                stroke_rgb = (int(stroke_hex[0:2], 16) / 255.0,
                              int(stroke_hex[2:4], 16) / 255.0,
                              int(stroke_hex[4:6], 16) / 255.0)
            else:
                stroke_rgb = (1.0, 0.28, 0.34)
            stroke_width = float(style.get("stroke_width", 2.0))

            if ann["annotation_type"] == "pin":
                x, y = geo["x"] * pw, geo["y"] * ph
                color = (0.18, 0.8, 0.44) if ann["status"] == "resolved" else (1.0, 0.28, 0.34)
                page.draw_circle(fitz.Point(x, y), 8, color=color, fill=color, width=1.5)
                page.insert_text(fitz.Point(x - 3, y + 3), str(ann["index"]),
                                 fontsize=8, color=(1, 1, 1), fontname="helv")

            elif ann["annotation_type"] == "rectangle":
                x1, y1 = geo["x"] * pw, geo["y"] * ph
                x2, y2 = (geo["x"] + geo["width"]) * pw, (geo["y"] + geo["height"]) * ph
                page.draw_rect(fitz.Rect(x1, y1, x2, y2), color=stroke_rgb, width=stroke_width)
                page.draw_rect(fitz.Rect(x1, y1 - 10, x1 + 12, y1), color=stroke_rgb, fill=stroke_rgb)
                page.insert_text(fitz.Point(x1 + 2, y1 - 2), str(ann["index"]),
                                 fontsize=7, color=(1, 1, 1))

            elif ann["annotation_type"] == "highlight":
                x1, y1 = geo["x"] * pw, geo["y"] * ph
                x2, y2 = (geo["x"] + geo["width"]) * pw, (geo["y"] + geo["height"]) * ph
                page.draw_rect(fitz.Rect(x1, y1, x2, y2),
                               color=None, fill=(1.0, 0.92, 0.23), width=0, overlay=False)
                page.insert_text(fitz.Point(x1, y1 - 2), f"#{ann['index']}",
                                 fontsize=7, color=(0.4, 0.4, 0.4))

            elif ann["annotation_type"] == "freehand":
                points = geo.get("points", [])
                for i in range(len(points) - 1):
                    p1 = fitz.Point(points[i]["x"] * pw, points[i]["y"] * ph)
                    p2 = fitz.Point(points[i + 1]["x"] * pw, points[i + 1]["y"] * ph)
                    page.draw_line(p1, p2, color=stroke_rgb, width=stroke_width)

        if annotations:
            self._append_summary_pages(doc, annotations)

        pdf_bytes = doc.tobytes()
        doc.close()
        safe_name = os.path.splitext(file_rec["original_filename"])[0]
        return pdf_bytes, f"Annotated_{safe_name}.pdf"

    def _append_summary_pages(self, doc, annotations: list):
        page = doc.new_page(width=595, height=842)
        page.draw_rect(fitz.Rect(0, 0, 595, 60), color=None, fill=(0.11, 0.12, 0.14))
        page.insert_text(fitz.Point(20, 36),
                         "PROHUB COLLABORATIVE DOCUMENT REVIEW — SUMMARY",
                         fontsize=13, color=(1, 1, 1), fontname="helv-bold")
        y = 90
        for ann in annotations:
            if y > 740:
                page = doc.new_page(width=595, height=842)
                y = 50
            page.draw_rect(fitz.Rect(20, y, 575, y + 60), color=(0.8, 0.8, 0.8), width=0.5)
            header = (f"Comment #{ann['index']}  |  Type: {ann['annotation_type'].upper()}"
                      f"  |  Page: {ann['page_number']}  |  Status: {ann['status'].upper()}")
            page.insert_text(fitz.Point(30, y + 15), header,
                             fontsize=9, color=(0.2, 0.2, 0.2), fontname="helv-bold")
            comment = (ann["comment_text"] or "(No text comment)")[:160]
            page.insert_textbox(fitz.Rect(30, y + 22, 565, y + 52), comment, fontsize=9, fontname="helv")
            y += 70
            for reply in ann.get("replies", []):
                if y > 760:
                    page = doc.new_page(width=595, height=842)
                    y = 50
                page.draw_line(fitz.Point(40, y), fitz.Point(550, y),
                               color=(0.9, 0.9, 0.9), width=0.5)
                rtext = f"  → {reply['reply_text'][:120]}  ({reply['created_at'][:10]})"
                page.insert_textbox(fitz.Rect(40, y + 5, 565, y + 25), rtext,
                                    fontsize=8, fontname="helv")
                y += 30
            y += 10
