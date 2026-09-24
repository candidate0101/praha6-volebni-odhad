#!/usr/bin/env python3
"""Build a per-precinct historical basis for the 2026 forecast model."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
NORMALIZED = ROOT / "data" / "normalized"
CROSSWALK_PATH = ROOT / "data" / "list-crosswalk-2026.json"
OUT_PATH = NORMALIZED / "forecast-basis-2026.json"


def load_year(year: str) -> dict[str, Any]:
    return json.loads((NORMALIZED / f"praha6-kv{year}-precincts.json").read_text(encoding="utf-8"))


def historical_votes_for_list(precinct: dict[str, Any], ref: dict[str, Any]) -> float | None:
    if ref["mode"] in ("novy subjekt", "nesrovnavat") or not ref["ballotNumbers"]:
        return None
    votes_by_ballot = {row["ballot_number"]: row["votes"] for row in precinct["list_votes"]}
    total = 0.0
    for ballot_number in ref["ballotNumbers"]:
        total += votes_by_ballot.get(ballot_number, 0) * ref["weight"]
    return total


def build_year_index(year_data: dict[str, Any]) -> dict[int, dict[str, Any]]:
    return {precinct["number"]: precinct for precinct in year_data["precincts"]}


def main() -> None:
    crosswalk = json.loads(CROSSWALK_PATH.read_text(encoding="utf-8"))
    data_2018 = load_year("2018")
    data_2022 = load_year("2022")
    index_2018 = build_year_index(data_2018)
    index_2022 = build_year_index(data_2022)

    precinct_numbers = sorted(set(index_2018) | set(index_2022))
    if set(index_2018) != set(index_2022):
        raise ValueError("2018 and 2022 precinct numbering differs; cannot build a shared basis")

    precincts_out = []
    for number in precinct_numbers:
        p2018 = index_2018[number]
        p2022 = index_2022[number]
        by_list: dict[str, dict[str, float | None]] = {}
        for entry in crosswalk["current_lists"]:
            list_id = entry["id"]
            by_list[list_id] = {
                "v2022": historical_votes_for_list(p2022, entry["refs2022"]),
                "v2018": historical_votes_for_list(p2018, entry["refs2018"]),
            }
        precincts_out.append({
            "number": number,
            "validVotes2022": p2022["valid_votes"],
            "validVotes2018": p2018["valid_votes"],
            "byList": by_list,
        })

    out = {
        "schema_version": 1,
        "source": "Odvozeno z data/normalized/praha6-kv2018 a kv2022, krizova mapa data/list-crosswalk-2026.json",
        "crosswalk_status": crosswalk["status"],
        "precincts": precincts_out,
    }
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"forecast basis: {len(precincts_out)} okrsku -> {OUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
