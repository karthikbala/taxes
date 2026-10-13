"""Private stdin PDF -> bounded JSON. No network, source lookup or business inference."""
import json, sys, resource

resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_CPU, (300, 300))
resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
try:
    import pymupdf
    data = sys.stdin.buffer.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024 or not data.startswith(b"%PDF-"):
        raise ValueError("document_not_pdf")
    document = pymupdf.open(stream=data, filetype="pdf")
    if document.page_count > 50:
        raise ValueError("document_page_limit")
    items, pages, ocr_pages, tables = [], [], [], []
    for index, page in enumerate(document):
        height = float(page.rect.height)
        pages.append({"page": index + 1, "width": float(page.rect.width), "height": height})
        textpage = None
        embedded = page.get_text("text").strip()
        # OCR only pages with no useful text, or mixed pages requested by the fallback.
        if "--ocr" in sys.argv and (not embedded or page.get_images()):
            textpage = page.get_textpage_ocr(language="eng", dpi=300, full=not bool(embedded))
            ocr_pages.append(index + 1)
        layout = page.get_text("dict", textpage=textpage, sort=False)
        # Table candidates retain printed cells and geometry; business parsers must validate them.
        if textpage is None:
            for table in page.find_tables().tables:
                x0, y0, x1, y1 = table.bbox
                tables.append({"page": index + 1, "bbox": [float(x0), height-float(y1), float(x1), height-float(y0)], "cells": table.extract()})
        for block in layout["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    x0, y0, x1, y1 = span["bbox"]
                    # PDF.js exposes bottom-origin baseline coordinates; PyMuPDF uses top-origin.
                    origin = span.get("origin", (x0, y1))
                    items.append({"str": text, "x": float(origin[0]), "y": height - float(origin[1]), "width": float(x1-x0), "height": float(y1-y0), "page": index+1,
                                  "bbox": [float(x0), height-float(y1), float(x1), height-float(y0)], "extraction_method": "ocr" if index+1 in ocr_pages else "embedded_text"})
    print(json.dumps({"items": items, "pages": pages, "totalPages": document.page_count, "engine": "pymupdf", "engine_version": pymupdf.VersionBind,
                      "method": "ocr" if ocr_pages else "embedded_text", "ocr_pages": ocr_pages, "tables": tables}, separators=(",", ":")))
except ImportError:
    print(json.dumps({"error": "document_worker_unavailable"})); sys.exit(1)
except Exception as exc:
    code = str(exc) if str(exc) in {"document_not_pdf", "document_page_limit"} else "document_worker_failed"
    print(json.dumps({"error": code})); sys.exit(1)
