"""Read-only evidence audit of Bradford's official CountyCertificates XLSX.

This is an offline audit, never a runtime fallback or a clearance determination.
Usage: python3 scripts/audit-bradford-certificates.py source.xlsx 05194-0-00000
"""
import datetime
import hashlib
import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal
from pathlib import Path


def audit(path, parcel):
    if not re.fullmatch(r"\d{5}-[A-Z0-9]-\d{5}", parcel):
        raise ValueError("An exact Bradford parcel is required")
    raw = Path(path).read_bytes()
    if len(raw) > 8_000_000:
        raise ValueError("Source size exceeds audit limit")
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if sum(i.file_size for i in archive.infolist()) > 128_000_000:
            raise ValueError("Expanded source exceeds audit limit")
        def xml(name):
            content = archive.read(name)
            if b"<!DOCTYPE" in content or b"<!ENTITY" in content:
                raise ValueError("Unsupported XML declarations")
            return ET.fromstring(content)
        book = xml("xl/workbook.xml")
        properties = book.find("s:workbookPr", ns)
        date1904 = properties is not None and properties.get("date1904") in ("1", "true")
        epoch = datetime.date(1904, 1, 1) if date1904 else datetime.date(1899, 12, 30)
        def date(value):
            return None if not value or Decimal(value) == 0 else str(epoch + datetime.timedelta(days=int(Decimal(value))))
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(el.itertext()) for el in xml("xl/sharedStrings.xml").findall("s:si", ns)]
        matches, inspected = [], 0
        sheet = xml("xl/worksheets/sheet1.xml")
        rows = sheet.findall("s:sheetData/s:row", ns)
        if len(rows) > 100_000:
            raise ValueError("Source row limit exceeded")
        for row in rows:
            cells = {}
            for cell in row.findall("s:c", ns):
                if cell.find("s:f", ns) is not None:
                    raise ValueError("Formula cells require separate source review")
                v = cell.find("s:v", ns)
                inline = cell.find("s:is", ns)
                value = v.text if v is not None else "".join(inline.itertext()) if inline is not None else ""
                value = strings[int(value)] if cell.get("t") == "s" else value or ""
                cells[re.sub(r"\d+", "", cell.get("r", ""))] = value.strip()
            if row.get("r") == "1":
                if any(cells.get(k) != v for k, v in {"A": "CO", "B": "Parcel", "D": "Tax Year", "F": "Paid Status", "AS": "Cert #", "AR": "Unpaid Bal"}.items()):
                    raise ValueError("Unexpected official export schema")
                continue
            if not cells.get("B"):
                continue
            inspected += 1
            if cells["B"] != parcel:
                continue
            if cells.get("A") != "14" or cells.get("C") != "R":
                raise ValueError("County/roll identity differs")
            money = lambda key: format(Decimal(cells[key]).quantize(Decimal(".01")), "f")
            if Decimal(cells["AO"]) + Decimal(cells["AP"]) + Decimal(cells["AQ"]) != Decimal(cells["AR"]):
                raise ValueError("Certificate balance does not reconcile")
            matches.append({"source_row": int(row.get("r")), "parcel": parcel, "tax_year": cells["D"], "bill": cells["G"], "owner": cells["J"], "certificate_number": cells["AS"], "certificate_type": cells["E"], "holder_type": cells["AT"], "paid_status": cells["F"], "face_amount": money("AO"), "interest": money("AP"), "fees": money("AQ"), "export_balance": money("AR"), "sale_date": date(cells["AW"]), "export_date": date(cells["AZ"]), "prior_years_delinquent_flag": cells["AY"], "payment_date": date(cells["AM"]) if cells["F"] == "P" else None, "paid_amount": money("AN") if cells["F"] == "P" else None})
    return {"source_url": "https://www.bradfordtaxcollector.com/Property/CountyCertificates", "sha256": hashlib.sha256(raw).hexdigest(), "worksheet_path": "xl/worksheets/sheet1.xml", "populated_parcel_rows_inspected": inspected, "scope": "COUNTY_CERTIFICATE_EXPORT_ONLY", "full_certificate_history_verified": False, "historical_clearance_established": False, "note": "Absence is not evidence of no liability. Export balances are dated observations, not current payoff quotes. Individual-held certificates and undisclosed retention remain outside verified scope.", "matches": matches}


if __name__ == "__main__":
    print(json.dumps(audit(sys.argv[1], sys.argv[2]), indent=2))
