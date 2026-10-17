#!/usr/bin/env python3
"""Move the release worktree's deploy tool copy to the next release. Refuses unless the tool's current release is the
predecessor named here (releases only move forward from what UAT runs).

usage: retarget.py <proof-scripts dir> <card> <revision> <state> <release id> <prev revision> <prev state> <backup>"""
import re, sys
folder, card, revision, state, release_id, prev_revision, prev_state, backup = sys.argv[1:9]
for value, pattern in [(revision, r'[0-9a-f]{40}'), (prev_revision, r'[0-9a-f]{40}'), (state, r'[0-9a-f]{64}'),
                       (prev_state, r'[0-9a-f]{64}'), (backup, r'gigalibs_backup_\d{8}_\d{6}Z'),
                       (release_id, r'local-\d{8}T\d{6}Z-[0-9a-f]{12}-[0-9a-f]{12}'), (card, r'WI-OI-\w+')]:
    assert re.fullmatch(pattern, value), value
tag = f'{revision[:12]}-{state[:12]}'
assert release_id.endswith(tag), (release_id, tag)
p = f'{folder}/deploy-uat.mjs'
s = open(p).read()
start = s.rindex('\n//', 0, s.index('export const RELEASE')) + 1
while s.rfind('\n//', 0, start - 1) == s.rfind('\n', 0, start - 1):
    start = s.rfind('\n//', 0, start - 1) + 1
end = s.index('});', s.index('export const RELEASE')) + 3
block = s[start:end]
current = re.search(r"revision: '([0-9a-f]{40})'", block).group(1)
current_state = re.search(r"sourceState: '([0-9a-f]{64})'", block).group(1)
block_prev = re.search(r"previousRevision: '([0-9a-f]{40})'", block).group(1)
block_prev_state = re.search(r"previousState: '([0-9a-f]{64})'", block).group(1)
# Either the tool targets the predecessor (it was deployed), or it targets a release that was never deployed and
# whose own predecessor is ours (that release is superseded before deployment).
assert (current, current_state) == (prev_revision, prev_state) or (block_prev, block_prev_state) == (prev_revision, prev_state), \
    f'tool targets {current[:12]} (after {block_prev[:12]}), not the predecessor {prev_revision[:12]}'
new = f"""// {card} release (owner-approved): release/wi120u-workforce at {revision[:7]}. The predecessor is the running
// {prev_revision[:7]}, on uat-postgres. --deploy is passed a fresh backup of uat-postgres.
export const RELEASE = Object.freeze({{
  tag: '{tag}',
  revision: '{revision}',
  sourceState: '{state}',
  releaseId: '{release_id}',
  previousRevision: '{prev_revision}',
  previousState: '{prev_state}',
  backup: '{backup}',
}});"""
open(p, 'w').write(s[:start] + new + s[end:])
print(f'retargeted to {revision[:7]} (from {prev_revision[:7]}) with backup {backup}')
