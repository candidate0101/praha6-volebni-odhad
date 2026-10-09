#!/usr/bin/env python3
"""Compact per-precinct 2018/2022 results for the map detail (no candidate votes)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NORMALIZED = ROOT / "data" / "normalized"


def compact(year: int) -> dict:
    source = json.loads((NORMALIZED / f"praha6-kv{year}-precincts.json").read_text(encoding="utf-8"))
    order = [item["ballot_number"] for item in source["lists"]]
    precincts = {}
    for precinct in source["precincts"]:
        votes = {item["ballot_number"]: item["votes"] for item in precinct["list_votes"]}
        precincts[str(precinct["number"])] = {
            "turnoutPercent": round(precinct["turnout_percent"], 2),
            "validVotes": precinct["valid_votes"],
            "listVotes": [votes.get(number, 0) for number in order],
        }
    return {
        "year": year,
        "date": source["election"]["date"],
        "source": source["source"]["data_url"],
        "lists": [{"ballotNumber": item["ballot_number"], "name": item["name"], "abbreviation": item["abbreviation"]} for item in source["lists"]],
        "precincts": precincts,
    }


def main() -> None:
    output = {
        "schema_version": 1,
        "note": "Odvozeno z praha6-kv2018/kv2022-precincts.json (ČSÚ). Okrsky se párují podle čísla.",
        "elections": [compact(2022), compact(2018)],
    }
    path = NORMALIZED / "praha6-precinct-history.json"
    path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {path.stat().st_size} B")


if __name__ == "__main__":
    main()
