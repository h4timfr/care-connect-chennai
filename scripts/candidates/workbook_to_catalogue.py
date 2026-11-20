"""
Converts the commissioned research workbook into research/chennai-provider-candidates.json.

    python scripts/candidates/workbook_to_catalogue.py <workbook.xlsx> [--out <file.json>]

Standard library only. The workbook is the source of truth; this script only changes its FORMAT
(see research/README.md, "Workbook mapping"). It never adds facts: no phones, fees, registration
numbers, schedules, availability or CareConnect participation. It stops on anything it cannot map
exactly, and checks the workbook's derived sheets against the records it converts.
"""

import hashlib
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

# Workbook IDs map 1:1 to the research-ID formats migration 00056 accepts.
FACILITY_ID = re.compile(r"^FAC-(\d{3})$")
DOCTOR_ID = re.compile(r"^DOC-(\d{3})$")
CONFIDENCE = {"HIGH": "high", "MEDIUM": "medium", "LOW/UNRESOLVED": "low"}
SOURCE_TYPE = {
    "Official provider website": "official_facility",
    "Official provider/institutional doctor directory": "official_institution",
}
CITY_SCOPE = "Chennai city"


def fail(message):
    sys.exit(f"error: {message}")


def read_sheets(path):
    """Every sheet as a list of rows (lists of strings or None), blank rows dropped."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        rels = {
            r.get("Id"): r.get("Target")
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        }
        sheets = {}
        for s in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
            target = rels[s.get(REL)].lstrip("/")
            target = target if target.startswith("xl/") else f"xl/{target}"
            rows = []
            for row in ET.fromstring(z.read(target)).iter(f"{{{NS['m']}}}row"):
                cells = {}
                for c in row.findall("m:c", NS):
                    col = re.match(r"[A-Z]+", c.get("r")).group()
                    index = 0
                    for ch in col:
                        index = index * 26 + ord(ch) - 64
                    kind, v = c.get("t"), c.find("m:v", NS)
                    if kind == "s":
                        value = shared[int(v.text)]
                    elif kind == "inlineStr":
                        value = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                    else:
                        value = v.text if v is not None else None
                    cells[index - 1] = value
                if any(v not in (None, "") for v in cells.values()):
                    rows.append([cells.get(i) for i in range(max(cells) + 1)])
            sheets[s.get("name")] = rows
    return sheets


def table(sheets, name):
    """Rows of a data sheet as dicts: row 1 is the sheet title, row 2 the header."""
    rows = sheets[name]
    header = [h for h in rows[1] if h]
    return [
        {h: (r[i].strip() if i < len(r) and r[i] and r[i].strip() else None) for i, h in enumerate(header)}
        for r in rows[2:]
    ]


def mapped_id(workbook_id, pattern, prefix):
    m = pattern.match(workbook_id or "")
    if not m:
        fail(f"unexpected research id {workbook_id!r}")
    return f"{prefix}-{m.group(1)}"


def confidence(value, where):
    if value not in CONFIDENCE:
        fail(f"{where}: unknown confidence {value!r}")
    return CONFIDENCE[value]


def source(url, source_type, supports, researched_on, conf):
    if source_type not in SOURCE_TYPE:
        fail(f"{url}: unmapped source type {source_type!r}")
    return {
        "url": url,
        "source_type": SOURCE_TYPE[source_type],
        "supports": supports,
        "researched_on": researched_on,
        "confidence": conf,
    }


def summary_totals(rows):
    totals = {}
    for r in rows:
        if r and r[0] and len(r) > 1 and r[1] is not None and re.fullmatch(r"\d+", str(r[1])):
            totals[r[0]] = int(r[1])
    return totals


def convert(path):
    sheets = read_sheets(path)
    facilities_in = table(sheets, "FACILITIES")
    doctors_in = table(sheets, "DOCTORS")
    relationships_in = table(sheets, "RELATIONSHIPS")
    registration_in = {r["doctor_research_id"]: r for r in table(sheets, "REGISTRATION")}
    sources_in = {s["source_url"]: s for s in table(sheets, "SOURCES_EVIDENCE")}
    conflicts_in = table(sheets, "DUPLICATES_CONFLICTS")
    queue_in = {q["research_id"]: q for q in table(sheets, "HUMAN_VERIFICATION")}

    def source_type_of(url):
        if url not in sources_in:
            fail(f"{url}: not in SOURCES_EVIDENCE")
        return sources_in[url]["source_type"]

    names = {f["research_id"]: f["exact_official_name"] for f in facilities_in}
    names.update({d["research_id"]: d["exact_public_name"] for d in doctors_in})

    def to_id(workbook_id):
        if workbook_id.startswith("FAC-"):
            return mapped_id(workbook_id, FACILITY_ID, "CLINIC")
        return mapped_id(workbook_id, DOCTOR_ID, "DOCTOR")

    # Each conflict finding is recorded on both records it names (no record is merged).
    conflict_issues = {}
    for c in conflicts_in:
        for own, other in (("entity_1_id", "entity_2_id"), ("entity_2_id", "entity_1_id")):
            other_id = c[other]
            if names.get(other_id) != c[f"{other[:-3]}_name"]:
                fail(f"{c['conflict_id']}: {other_id} name does not match its record")
            issue = (
                f"{c['conflict_id']} {c['conflict_type']} with {to_id(other_id)} ({names[other_id]}): "
                f"{c['finding']} Status: {c['resolution_status']}. Required action: {c['required_action']}"
            )
            conflict_issues.setdefault(c[own], []).append(issue)

    facilities = []
    for f in facilities_in:
        wid = f["research_id"]
        if f["status"] != "CANDIDATE":
            fail(f"{wid}: status {f['status']!r}")
        if f["official_website"] != f["source_urls"]:
            fail(f"{wid}: website and source differ")
        issues = [f["unresolved_conflicts"]] if f["unresolved_conflicts"] else []
        issues += conflict_issues.get(wid, [])
        elevated = queue_in[wid]["review_priority"] == "ELEVATED"
        # In this workbook, a facility's ELEVATED review priority is exactly its scope boundary.
        if elevated != (f["metro_scope"] != CITY_SCOPE):
            fail(f"{wid}: review priority does not follow metro scope")
        if elevated:
            issues.append(f"Metro scope: {f['metro_scope']}. Research review priority: ELEVATED.")
        conf = confidence(f["confidence"], wid)
        facilities.append(
            {
                "research_id": to_id(wid),
                "name": f["exact_official_name"],
                "facility_type": f["facility_type"],
                "address": f["complete_public_address"],
                "locality": f["locality"],
                "website": f["official_website"],
                "specialties": [f["specialties_services"]],
                "source_confidence": conf,
                "unresolved_issues": issues,
                "researched_on": f["date_researched"],
                "sources": [
                    source(
                        f["source_urls"],
                        f["source_type"],
                        f"{f['identity_location_evidence']} Branch: {f['branch_information']}. "
                        f"Metro scope: {f['metro_scope']}.",
                        f["date_researched"],
                        conf,
                    )
                ],
            }
        )

    doctors = []
    for d in doctors_in:
        wid = d["research_id"]
        reg = registration_in.get(wid)
        if d["status"] != "CANDIDATE":
            fail(f"{wid}: status {d['status']!r}")
        if not reg or reg["doctor_name"] != d["exact_public_name"]:
            fail(f"{wid}: REGISTRATION row missing or names differ")
        # Research never verifies registration; an authoritative match would need human review.
        for status in (d["registration_verification_status"], reg["registration_verification_status"]):
            if status != "NOT AUTHORITATIVELY VERIFIED":
                fail(f"{wid}: registration status {status!r} is not mapped")
        if d["registration_number"] or reg["registration_number"]:
            fail(f"{wid}: a registration number is present; map it explicitly")
        if d["official_profile_source"] != d["source_urls"]:
            fail(f"{wid}: profile source and source differ")
        if (d["identity_conflict_flag"] == "YES") != (wid in conflict_issues):
            fail(f"{wid}: identity conflict flag does not match DUPLICATES_CONFLICTS")
        conf = confidence(d["confidence"], wid)
        # In this workbook, a doctor's ELEVATED review priority is exactly a non-high confidence.
        if (queue_in[wid]["review_priority"] == "ELEVATED") != (conf != "high"):
            fail(f"{wid}: review priority does not follow confidence")
        if (queue_in[wid]["known_issue"] or None) != d["unresolved_conflicts"]:
            fail(f"{wid}: HUMAN_VERIFICATION issue differs from DOCTORS")
        issues = [d["unresolved_conflicts"]] if d["unresolved_conflicts"] else []
        issues += conflict_issues.get(wid, [])
        if d["provider_type"] != "Medical doctor":
            issues.append(
                f"Provider type: {d['provider_type']}. Expected registration authority: "
                f"{d['registration_authority']}."
            )
        doctors.append(
            {
                "research_id": to_id(wid),
                "full_name": d["exact_public_name"],
                "specialty": d["specialty"],
                "qualifications": d["qualifications"],
                "registration_info": None,
                "registration_status": "not_verified",
                "source_confidence": conf,
                "unresolved_issues": issues,
                "researched_on": d["date_researched"],
                "sources": [
                    source(
                        d["source_urls"],
                        source_type_of(d["source_urls"]),
                        d["identity_evidence"],
                        d["date_researched"],
                        conf,
                    )
                ],
            }
        )

    facility_by_id = {f["research_id"]: f for f in facilities_in}
    relationships = []
    for r in relationships_in:
        fac = facility_by_id.get(r["facility_research_id"])
        if not fac:
            fail(f"relationship to unknown {r['facility_research_id']}")
        # Branch name and locality must be the facility record's own (they are not stored twice).
        if r["exact_branch"] != fac["exact_official_name"] or r["branch_locality"] != fac["locality"]:
            fail(f"{r['doctor_research_id']}→{r['facility_research_id']}: branch differs from facility")
        if r["relationship_status"] != "AFFILIATION CONFIRMED":
            fail(f"unmapped relationship status {r['relationship_status']!r}")
        conf = confidence(r["relationship_confidence"], r["doctor_research_id"])
        relationships.append(
            {
                "doctor": to_id(r["doctor_research_id"]),
                "facility": to_id(r["facility_research_id"]),
                "research_status": "CONFIRMED_PUBLIC",
                "confidence": conf,
                "unresolved_issues": [r["unresolved_conflicts"]] if r["unresolved_conflicts"] else [],
                "sources": [
                    source(
                        r["evidence_source"],
                        source_type_of(r["evidence_source"]),
                        f"{r['evidence_summary']} {r['appears_current']}",
                        r["date_researched"],
                        conf,
                    )
                ],
            }
        )

    # The workbook's own totals and derived sheets must agree with what was converted.
    totals = summary_totals(sheets["Summary"])
    unresolved = {
        c[k] for c in conflicts_in if c["resolution_status"].startswith("UNRESOLVED")
        for k in ("entity_1_id", "entity_2_id")
    }
    checks = {
        "Facilities researched": len(facilities),
        "Doctors/providers researched": len(doctors),
        "Doctor-facility relationships": len(relationships),
        "Authoritative registrations verified": 0,
        "Affiliations confirmed": len(relationships),
        "Unresolved records": len(unresolved),
        "Duplicate/conflict findings": len(conflicts_in),
        "Records requiring human verification": len(queue_in),
    }
    for label, value in checks.items():
        if totals.get(label) != value:
            fail(f"Summary {label!r} is {totals.get(label)}, converted {value}")
    if len(queue_in) != len(facilities) + len(doctors):
        fail("HUMAN_VERIFICATION does not list every facility and doctor")
    confidence_sheets = (
        table(sheets, "HIGH_CONFIDENCE") + table(sheets, "MEDIUM_CONFIDENCE") + table(sheets, "LOW_UNRESOLVED")
    )
    if sorted(r["research_id"] for r in confidence_sheets) != sorted(queue_in):
        fail("confidence sheets do not partition the candidates")

    return {
        "catalogue": "chennai-provider-candidates",
        "source_workbook": {
            "file": path.replace("\\", "/").rsplit("/", 1)[-1],
            "sha256": hashlib.sha256(open(path, "rb").read()).hexdigest(),
            "research_date": next(r[1] for r in sheets["Summary"] if r and r[0] == "Research date"),
        },
        "facilities": facilities,
        "doctors": doctors,
        "relationships": relationships,
    }


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    out = args[args.index("--out") + 1] if "--out" in args else "research/chennai-provider-candidates.json"
    catalogue = convert(args[0])
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(catalogue, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(
        f"Wrote {out}: {len(catalogue['facilities'])} facilities, {len(catalogue['doctors'])} doctors, "
        f"{len(catalogue['relationships'])} relationships."
    )


if __name__ == "__main__":
    main()
