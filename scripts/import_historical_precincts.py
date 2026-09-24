#!/usr/bin/env python3
"""Normalize ČSÚ precinct data for Praha 6 municipal elections."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "normalized"
MUNICIPALITY_CODE = "500178"
ELECTIONS = {
    "2018": {
        "date": "20181005",
        "data_zip": "kv2018_okrsky_csv.zip",
        "registry_zip": "kv2018_registry_csv.zip",
        "data_url": "https://volby.gov.cz/opendata/kv2018/KV2018_data_20230224_csv.zip",
        "registry_url": "https://volby.gov.cz/opendata/kv2018/KV2018_reg_20230224_csv.zip",
    },
    "2022": {
        "date": "20220923",
        "data_zip": "kv2022_okrsky_csv.zip",
        "registry_zip": "kv2022_registry_csv.zip",
        "data_url": "https://volby.gov.cz/opendata/kv2022/KV2022_data_20260328_csv.zip",
        "registry_url": "https://volby.gov.cz/opendata/kv2022/KV2022reg20260328_csv.zip",
    },
}


def read_csv(archive_path: Path, member: str) -> list[dict[str, str]]:
    with zipfile.ZipFile(archive_path) as archive:
        raw = archive.read(member)
    return list(csv.DictReader(io.TextIOWrapper(io.BytesIO(raw), encoding="cp1250"), delimiter=";"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def integer(value: str) -> int:
    return int(value or 0)


def normalize(year: str, config: dict[str, str]) -> dict[str, Any]:
    data_zip = RAW / config["data_zip"]
    registry_zip = RAW / config["registry_zip"]
    summaries = [
        row for row in read_csv(data_zip, "csv/kvt3.csv")
        if row["DATUMVOLEB"] == config["date"] and row["KODZASTUP"] == MUNICIPALITY_CODE
    ]
    list_votes = [
        row for row in read_csv(data_zip, "csv/kvhl.csv")
        if row["DATUMVOLEB"] == config["date"] and row["OBEC"] == MUNICIPALITY_CODE and row["TYPZASTUP"] == "2"
    ]
    lists = [
        row for row in read_csv(registry_zip, "csv/kvros.csv")
        if row["DATUMVOLEB"] == config["date"] and row["KODZASTUP"] == MUNICIPALITY_CODE
    ]
    lists_by_order = {row["POR_STR_HL"]: row for row in lists}
    votes_by_precinct: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in list_votes:
        votes_by_precinct[row["ID_OKRSKY"]].append(row)

    normalized_precincts = []
    bad_sum_precincts: list[str] = []
    for summary in sorted(summaries, key=lambda row: integer(row["OKRSEK"])):
        ballot_rows = sorted(votes_by_precinct[summary["ID_OKRSKY"]], key=lambda row: integer(row["POR_STR_HL"]))
        if len(ballot_rows) != len(lists):
            raise ValueError(f"{year} / okrsek {summary['OKRSEK']}: {len(ballot_rows)} list rows, expected {len(lists)}")
        total_list_votes = sum(integer(row["POC_HLASU"]) for row in ballot_rows)
        valid_votes = integer(summary["PL_HL_CELK"])
        if total_list_votes != valid_votes:
            bad_sum_precincts.append(summary["OKRSEK"])
        normalized_precincts.append({
            "id": summary["ID_OKRSKY"],
            "number": integer(summary["OKRSEK"]),
            "registered_voters": integer(summary["VOL_SEZNAM"]),
            "envelopes_issued": integer(summary["VYD_OBALKY"]),
            "envelopes_cast": integer(summary["ODEVZ_OBAL"]),
            "valid_votes": valid_votes,
            "turnout_percent": round(integer(summary["ODEVZ_OBAL"]) / integer(summary["VOL_SEZNAM"]) * 100, 4) if integer(summary["VOL_SEZNAM"]) else 0,
            "list_votes": [
                {
                    "ballot_number": integer(row["POR_STR_HL"]),
                    "votes": integer(row["POC_HLASU"]),
                    "candidate_votes": [integer(row[f"HLASY_{position:02d}"]) for position in range(1, 71)],
                }
                for row in ballot_rows
            ],
        })

    if len(summaries) != 104 or len({row["ID_OKRSKY"] for row in summaries}) != 104:
        raise ValueError(f"{year}: expected exactly 104 Praha 6 precincts, got {len(summaries)}")
    if bad_sum_precincts:
        raise ValueError(f"{year}: list-vote sum differs from valid votes in precincts {', '.join(bad_sum_precincts)}")

    return {
        "schema_version": 1,
        "scope": {"municipality_code": MUNICIPALITY_CODE, "name": "Praha 6", "seats": 45},
        "election": {"year": int(year), "date": config["date"], "type": "municipal"},
        "source": {
            "publisher": "Český statistický úřad / volby.gov.cz",
            "data_url": config["data_url"],
            "registry_url": config["registry_url"],
            "download_sha256": {"precinct_data": sha256(data_zip), "registry": sha256(registry_zip)},
        },
        "lists": [
            {
                "ballot_number": integer(row["POR_STR_HL"]),
                "name": row["NAZEVCELK"],
                "abbreviation": row["ZKRATKAO8"],
                "official_votes": integer(row["HLASY_STR"]),
                "official_share_percent": float(row["PROCHLSTR"].replace(",", ".")),
                "official_seats": integer(row["MAND_STR"]),
            }
            for row in sorted(lists, key=lambda row: integer(row["POR_STR_HL"]))
        ],
        "precincts": normalized_precincts,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"schema_version": 1, "imports": []}
    for year, config in ELECTIONS.items():
        result = normalize(year, config)
        target = OUT / f"praha6-kv{year}-precincts.json"
        target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        manifest["imports"].append({
            "year": int(year),
            "file": target.name,
            "precinct_count": len(result["precincts"]),
            "list_count": len(result["lists"]),
            "valid_votes": sum(precinct["valid_votes"] for precinct in result["precincts"]),
        })
        print(f"{year}: {len(result['precincts'])} okrsků, {len(result['lists'])} listin → {target.relative_to(ROOT)}")
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
