#!/usr/bin/env python3
"""Stress-test the precinct extrapolation on 2018 -> 2022 results.

This is a transparent historical exercise, not evidence that 2026 is predictable.
It evaluates only lists with a direct, reasonably comparable ballot mapping.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "analysis" / "backtest-2018-to-2022.json"
STAGES = (1, 5, 10, 25, 50, 75)
SHRINKAGE_K = 6
# 2022 ballot number -> directly comparable 2018 ballot number.
COMPARABLE = {"Piráti": (1, 8), "ANO": (10, 6), "KSČM": (3, 7)}


def load(year: int) -> dict:
    return json.loads((ROOT / "data" / "normalized" / f"praha6-kv{year}-precincts.json").read_text())


def votes(precinct: dict, ballot: int) -> int:
    return next(row["votes"] for row in precinct["list_votes"] if row["ballot_number"] == ballot)


def orders(precincts: list[dict]) -> dict[str, list[dict]]:
    randomised = precincts[:]
    random.Random(20261009).shuffle(randomised)
    return {
        "po_cisle": sorted(precincts, key=lambda p: p["number"]),
        "obracene_po_cisle": sorted(precincts, key=lambda p: p["number"], reverse=True),
        "nejvetsi_nejdrive": sorted(precincts, key=lambda p: p["valid_votes"], reverse=True),
        "deterministicky_nahodne": randomised,
    }


def forecast_share(entered_pairs: list[tuple[dict, dict]], remaining_2018: list[dict], old_ballot: int, new_ballot: int) -> float:
    shrink = len(entered_pairs) / (len(entered_pairs) + SHRINKAGE_K)
    swings = [votes(now, new_ballot) / now["valid_votes"] - votes(old, old_ballot) / old["valid_votes"]
              for now, old in entered_pairs if now["valid_votes"] and old["valid_votes"]]
    mean_swing = sum(swings) / len(swings) if swings else 0
    entered_votes = sum(votes(now, new_ballot) for now, _ in entered_pairs)
    entered_valid = sum(now["valid_votes"] for now, _ in entered_pairs)
    expected_votes = sum(max(0, votes(old, old_ballot) / old["valid_votes"] + mean_swing * shrink) * old["valid_votes"]
                         for old in remaining_2018 if old["valid_votes"])
    expected_valid = sum(p["valid_votes"] for p in remaining_2018)
    return (entered_votes + expected_votes) / (entered_valid + expected_valid)


def main() -> None:
    old = {p["number"]: p for p in load(2018)["precincts"]}
    new = {p["number"]: p for p in load(2022)["precincts"]}
    if set(old) != set(new):
        raise ValueError("2018 and 2022 precinct sets differ")
    final = {label: sum(votes(p, new_ballot) for p in new.values()) / sum(p["valid_votes"] for p in new.values())
             for label, (_, new_ballot) in COMPARABLE.items()}
    results: dict[str, dict[str, dict[str, float]]] = {}
    for order_name, ordered_new in orders(list(new.values())).items():
        results[order_name] = {}
        for stage in STAGES:
            entered_new = ordered_new[:stage]
            entered_old = [old[p["number"]] for p in entered_new]
            remaining_old = [old[p["number"]] for p in ordered_new[stage:]]
            per_list = {}
            for label, (old_ballot, new_ballot) in COMPARABLE.items():
                predicted = forecast_share(list(zip(entered_new, entered_old)), remaining_old, old_ballot, new_ballot)
                per_list[label] = {"predicted_share": predicted, "actual_share": final[label], "absolute_error_pp": abs(predicted - final[label]) * 100}
            results[order_name][str(stage)] = per_list
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"scope": "2018_to_2022_stress_test", "warning": "Historical stress test; not a calibrated 2026 forecast.", "comparable_lists": COMPARABLE, "stages": STAGES, "results": results}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"backtest written: {OUT.relative_to(ROOT)}")
    for stage in STAGES:
        errors = [result[str(stage)][label]["absolute_error_pp"] for result in results.values() for label in COMPARABLE]
        print(f"{stage:>2} okrsků: průměrná absolutní chyba {sum(errors) / len(errors):.2f} p. b.")


if __name__ == "__main__":
    main()
