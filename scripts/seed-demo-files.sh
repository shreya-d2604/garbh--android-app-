#!/usr/bin/env bash
# Attach a small SYNTHETIC PDF to the seeded demo report (Kavya's "CBC + TSH", supabase/seed.sql)
# so the patient and doctor report viewers have a file to show. Storage objects cannot be created
# from SQL, so run this after every `npm run db:check` / db reset:
#
#   bash scripts/seed-demo-files.sh
#
# Local stack only. The file contains no real patient data.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
: "${API_URL:?local Supabase is not running}"

PATIENT=10000000-0000-4000-8000-000000000003
PREGNANCY=20000000-0000-4000-8000-000000000003
REPORT=50000000-0000-4000-8000-000000000001
FILE_ID=60000000-0000-4000-8000-000000000001
OBJECT="$PATIENT/$PREGNANCY/$REPORT/$FILE_ID.pdf"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# A one-page PDF with correct xref offsets (python3 computes them).
python3 - "$TMP/report.pdf" <<'PY'
import sys
lines = [
    "SYNTHETIC DEMO REPORT - NOT A REAL PATIENT",
    "City Diagnostics (demo)",
    "Complete blood count + TSH",
    "Haemoglobin      10.4 g/dL    (11.0 - 15.0)",
    "TSH              2.1 mIU/L    (0.2 - 3.0)",
]
text = "BT /F1 12 Tf 50 780 Td 16 TL " + " ".join(f"({l}) Tj T*" for l in lines) + " ET"
objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    f"<< /Length {len(text)} >>\nstream\n{text}\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]
out = b"%PDF-1.4\n"
offsets = []
for i, o in enumerate(objs, 1):
    offsets.append(len(out))
    out += f"{i} 0 obj\n{o}\nendobj\n".encode()
xref = len(out)
out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
open(sys.argv[1], "wb").write(out)
PY

auth=(-H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY")

curl -sf -X POST "$API_URL/storage/v1/object/reports/$OBJECT" "${auth[@]}" \
  -H 'Content-Type: application/pdf' -H 'x-upsert: true' --data-binary "@$TMP/report.pdf" >/dev/null

curl -sf -X POST "$API_URL/rest/v1/report_files?on_conflict=id" "${auth[@]}" \
  -H 'Content-Type: application/json' -H 'Prefer: resolution=merge-duplicates,return=minimal' \
  -d "{\"id\":\"$FILE_ID\",\"report_id\":\"$REPORT\",\"storage_path\":\"$OBJECT\",\"mime_type\":\"application/pdf\",\"size_bytes\":$(wc -c < "$TMP/report.pdf"),\"page_no\":1}"

echo "demo report file attached: reports/$OBJECT"
