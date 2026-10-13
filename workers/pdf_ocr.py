"""Isolated stdin PDF -> review-only positioned OCR. Standard library only."""
import csv
import io
import json
import math
import os
import re
import resource
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

MAX_BYTES = 25 * 1024 * 1024
MAX_PAGES = 50
MAX_PIXELS = 20_000_000
DPI = 300


def run(args, timeout=60):
    try:
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=timeout, check=True)
    except FileNotFoundError:
        raise ValueError("document_ocr_unavailable") from None
    except subprocess.TimeoutExpired:
        raise ValueError("document_worker_timeout") from None
    except subprocess.CalledProcessError:
        raise ValueError("document_ocr_failed") from None
    if len(result.stdout) > 32 * 1024 * 1024:
        raise ValueError("document_worker_limit")
    return result.stdout.decode("utf-8", errors="strict")


def parse_tsv(text, page, width, height, pixels_x, pixels_y):
    """Keep confidence and exact OCR characters; join nearby words, not columns."""
    reader = csv.DictReader(io.StringIO(text), delimiter="\t", quoting=csv.QUOTE_NONE)
    required = {"level", "block_num", "par_num", "line_num", "left", "top", "width", "height", "conf", "text"}
    if not required.issubset(set(reader.fieldnames or [])):
        raise ValueError("document_ocr_invalid_output")
    groups, words = {}, []
    sx, sy = width / pixels_x, height / pixels_y
    for row in reader:
        if row["level"] != "5" or not row["text"].strip():
            continue
        try:
            x, y, w, h = [int(row[k]) for k in ("left", "top", "width", "height")]
            confidence = float(row["conf"])
        except (ValueError, TypeError):
            raise ValueError("document_ocr_invalid_output") from None
        if (min(x, y) < 0 or min(w, h) <= 0 or x + w > pixels_x or y + h > pixels_y
                or not math.isfinite(confidence) or not 0 <= confidence <= 100):
            raise ValueError("document_ocr_invalid_output")
        word = {"str": row["text"].strip(), "page": page, "x": x*sx, "y": height-(y+h)*sy,
                "width": w*sx, "height": h*sy, "bbox": [x*sx, height-(y+h)*sy, (x+w)*sx, height-y*sy],
                "confidence": confidence, "extraction_method": "ocr"}
        words.append(word)
        groups.setdefault((row["block_num"], row["par_num"], row["line_num"]), []).append(word)
    items = []
    for line in groups.values():
        spans = []
        for word in sorted(line, key=lambda w: w["x"]):
            leading_year = bool(spans and len(spans[-1]) == 1 and re.fullmatch(r"20\d{2}", spans[-1][0]["str"]))
            if spans and not leading_year and word["x"] - (spans[-1][-1]["x"] + spans[-1][-1]["width"]) <= 10:
                spans[-1].append(word)
            else:
                spans.append([word])
        for span in spans:
            x0 = min(w["bbox"][0] for w in span)
            y0 = min(w["bbox"][1] for w in span)
            x1 = max(w["bbox"][2] for w in span)
            y1 = max(w["bbox"][3] for w in span)
            items.append({"str": " ".join(w["str"] for w in span), "page": page, "x": x0, "y": y0,
                          "width": x1-x0, "height": y1-y0, "bbox": [x0, y0, x1, y1],
                          "confidence": min(w["confidence"] for w in span), "extraction_method": "ocr"})
    return items, words


def extract(data, selected=None):
    if len(data) > MAX_BYTES:
        raise ValueError("source_too_large")
    if not data.startswith(b"%PDF-"):
        raise ValueError("document_not_pdf")
    pdfinfo = os.environ.get("TAXES_PDFINFO", "/usr/bin/pdfinfo")
    raster = os.environ.get("TAXES_PDFTOPPM", "/usr/bin/pdftoppm")
    tesseract = os.environ.get("TAXES_TESSERACT", "/usr/bin/tesseract")
    with tempfile.TemporaryDirectory(prefix="taxes-ocr-") as tmp:
        source = Path(tmp)/"source.pdf"
        source.write_bytes(data)
        info = run([pdfinfo, "-f", "1", "-l", str(MAX_PAGES), str(source)], timeout=20)
        count_match = re.search(r"^Pages:\s+(\d+)", info, re.M)
        if not count_match:
            raise ValueError("document_ocr_invalid_output")
        count = int(count_match[1])
        if not 1 <= count <= MAX_PAGES:
            raise ValueError("document_page_limit")
        if re.search(r"^Encrypted:\s+yes", info, re.M):
            raise ValueError("document_encrypted")
        numbers = selected if selected is not None else list(range(1, count+1))
        if not numbers or len(set(numbers)) != len(numbers) or any(n < 1 or n > count for n in numbers):
            raise ValueError("document_page_limit")
        dimensions = {int(n): (float(w), float(h)) for n, w, h in re.findall(
            r"^Page\s+(\d+) size:\s+([\d.]+) x ([\d.]+) pts", info, re.M)}
        rotations = {int(n): int(r) for n, r in re.findall(r"^Page\s+(\d+) rot:\s+(-?\d+)", info, re.M)}
        version = run([tesseract, "--version"], timeout=10).splitlines()[0]
        items, words, pages, quality = [], [], [], []
        for number in numbers:
            if number not in dimensions:
                raise ValueError("document_ocr_invalid_output")
            width, height = dimensions[number]
            if rotations.get(number, 0) % 180:
                width, height = height, width
            if min(width, height) <= 0 or math.ceil(width*DPI/72)*math.ceil(height*DPI/72) > MAX_PIXELS:
                raise ValueError("document_ocr_pixel_limit")
            prefix = Path(tmp)/"page"
            run([raster, "-f", str(number), "-l", str(number), "-singlefile", "-r", str(DPI),
                 "-gray", "-png", str(source), str(prefix)], timeout=30)
            image = prefix.with_suffix(".png")
            with image.open("rb") as f:
                header = f.read(24)
            if header[:8] != b"\x89PNG\r\n\x1a\n":
                raise ValueError("document_ocr_invalid_output")
            px, py = struct.unpack(">II", header[16:24])
            if not px or not py or px*py > MAX_PIXELS:
                raise ValueError("document_ocr_pixel_limit")
            tsv = run([tesseract, str(image), "stdout", "-l", "eng", "--dpi", str(DPI), "--psm", "3", "tsv"])
            page_items, page_words = parse_tsv(tsv, number, width, height, px, py)
            if not page_words:
                raise ValueError("document_ocr_empty")
            items.extend(page_items)
            words.extend(page_words)
            pages.append({"page": number, "width": width, "height": height})
            confidences = [w["confidence"] for w in page_words]
            quality.append({"page": number, "word_count": len(confidences), "mean_confidence": round(sum(confidences)/len(confidences), 2),
                            "low_confidence_words": sum(c < 80 for c in confidences)})
            image.unlink()
        return {"items": items, "words": words, "pages": pages, "totalPages": count, "engine": "tesseract",
                "engine_version": version, "method": "ocr", "ocr_pages": numbers, "dpi": DPI, "language": "eng",
                "quality": quality, "review_required": True}


def main():
    resource.setrlimit(resource.RLIMIT_AS, (1024**3, 1024**3))
    resource.setrlimit(resource.RLIMIT_CPU, (300, 300))
    resource.setrlimit(resource.RLIMIT_FSIZE, (32*1024**2, 32*1024**2))
    try:
        args = sys.argv[1:]
        if len(args) > 1 or (args and not re.fullmatch(r"--pages=\d+(?:,\d+)*", args[0])):
            raise ValueError("document_page_limit")
        selected = [int(n) for n in args[0].split("=", 1)[1].split(",")] if args else None
        output = extract(sys.stdin.buffer.read(MAX_BYTES+1), selected)
        text = json.dumps(output, separators=(",", ":"))
        if len(text.encode()) > 32*1024**2:
            raise ValueError("document_worker_limit")
        print(text)
    except Exception as exc:
        code = str(exc)
        allowed = {"source_too_large", "document_not_pdf", "document_page_limit", "document_encrypted",
                   "document_ocr_unavailable", "document_ocr_failed", "document_ocr_invalid_output",
                   "document_ocr_pixel_limit", "document_ocr_empty", "document_worker_timeout", "document_worker_limit"}
        print(json.dumps({"error": code if code in allowed else "document_ocr_failed"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
