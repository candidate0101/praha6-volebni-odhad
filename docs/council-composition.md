# Předpokládané složení Zastupitelstva Prahy 6

Route `/predpokladane-slozeni` is a third output: it is neither an official result nor the Crystal Ball forecast. It converts selected current/modelled list votes into an indicative 45-seat council composition.

## Current behaviour

- The user can select modelled list votes from the internal briefing or its current manually entered precinct sums.
- Only a list with at least 5 % of the selected list votes enters the D'Hondt allocation, matching the supplied workbook's input rule.
- People shown as `předpokládaně zvolen/a` are selected solely by candidate-list order.
- The text must remain: `Odhad podle pořadí kandidátky; může se změnit vlivem preferenčních hlasů.`

## Candidate votes

`orderCandidatesByPreference` accepts candidate preference votes together with a list's votes. A candidate reaching at least 10 % of their list's votes is promoted above other candidates, ordered by preference votes descending; remaining candidates retain ballot order. This is the reordering rule to apply when ČSÚ candidate-vote imports are available.

The dedicated official-results schema has append-only `official_candidate_votes`, keyed by imported precinct revision, ballot number and candidate order. The importer must aggregate candidate votes from the latest accepted precinct revisions and pass them to this function. Until then the page deliberately supplies no preference votes and never asserts that a named person is definitively elected.
