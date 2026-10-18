#!/usr/bin/env python3
"""Compare a journey run's findings with the last accepted run (the baseline below) and list its blockers.

usage: python3 -I .pi/handoff/release-tools/compare-journey.py e2e/test-results/journey/findings.json

Exit code 1 if the run has a blocker the release was expected to clear, or more findings of any kind than the
baseline. A worse run is reported as worse: never edit the baseline to make a run pass. Update the baseline only after
the owner accepts a run, in the same commit as the release evidence."""
import collections, json, sys

# Baseline: journey b0j8mq on release f9de9a3 (2026-10-16).
BASELINE_RUN = 'b0j8mq'
BASELINE = {'LAYOUT': 29, 'ACCESSIBILITY': 17, 'UX': 4, 'BLOCKER': 2}
KNOWN_BLOCKERS = {  # cleared by WI-OI-120be (W1-A); each must be gone after that release
    'The technician raises a request',
    'The supervisor reviews and closes the work order',
}
# WI-OI-120bh: CMMS has no closed state yet, so this step blocks honestly until supervisor sign-off is built.
KNOWN_GAPS = {'The supervisor signs off and closes the work order': 'supervisor sign-off not built'}

run = json.load(open(sys.argv[1]))
findings = run['findings']
counts = collections.Counter(finding.get('kind') for finding in findings)
print(f"run {run.get('run')}: {len(findings)} findings; baseline {BASELINE_RUN}: {sum(BASELINE.values())}")
worse = False
for kind in sorted(set(BASELINE) | set(counts)):
    now, was = counts.get(kind, 0), BASELINE.get(kind, 0)
    mark = 'WORSE' if now > was else ('better' if now < was else 'same')
    worse = worse or now > was
    print(f'  {kind:<14} {now:>3} (baseline {was:>3})  {mark}')
for finding in findings:
    if finding.get('kind') == 'BLOCKER':
        step = finding.get('step')
        known = ('known, expected cleared by W1-A' if step in KNOWN_BLOCKERS
                 else f'known gap: {KNOWN_GAPS[step]}' if step in KNOWN_GAPS else 'NEW')
        print(f"  BLOCKER [{known}]: {finding.get('step')}")
        worse = True
sys.exit(1 if worse else 0)
