import { describe, expect, it } from "vitest";
import { ELECTED_STATUS_LABEL, OUTPUTS, SOURCE_KINDS, outputById } from "./outputs";

describe("the three labelled outputs", () => {
  it("lists briefing, official results and council composition in navigation order", () => {
    expect(OUTPUTS.map((output) => [output.id, output.href])).toEqual([
      ["briefing", "/"],
      ["official", "/official-results"],
      ["council", "/predpokladane-slozeni"],
    ]);
  });

  it("gives every output its own data sources so they can never look alike", () => {
    expect(outputById("briefing").sources).toEqual(["manual", "model"]);
    expect(outputById("official").sources).toEqual(["official"]);
    expect(outputById("council").sources).toEqual(["estimate"]);
    const signatures = Object.values(SOURCE_KINDS).map((kind) => `${kind.symbol}|${kind.label}`);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("marks every source with a text symbol, not colour alone", () => {
    for (const kind of Object.values(SOURCE_KINDS)) {
      expect(kind.symbol.trim()).not.toBe("");
      expect(kind.label.trim()).not.toBe("");
    }
  });

  it("only the official output may call itself official", () => {
    for (const output of OUTPUTS.filter((item) => item.id !== "official")) {
      expect(`${output.label} ${output.sourceLine}`.toLowerCase()).not.toMatch(/oficiální výsledek/);
    }
    expect(outputById("official").sourceLine).toMatch(/ČSÚ/);
  });

  it("names the three working modes Briefing, ČSÚ and Složení, each with a context line for its short name", () => {
    expect(OUTPUTS.map((output) => output.shortLabel)).toEqual(["Briefing", "ČSÚ", "Složení"]);
    for (const output of OUTPUTS) {
      expect(output.navHint.trim()).not.toBe("");
      expect(output.label).not.toBe(output.shortLabel);
    }
  });

  it("never says a candidate is definitively elected", () => {
    expect(ELECTED_STATUS_LABEL).toBe("předpokládaně zvolen/a");
    expect(JSON.stringify(OUTPUTS).toLowerCase()).not.toContain("definitivně zvolen");
  });
});
