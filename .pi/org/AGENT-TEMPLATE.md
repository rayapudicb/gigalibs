# Agent definition template

Copy to `.pi/agents/<agent_id>/AGENT.md`. Keep it to one page. Add the agent to [ROSTER.md](ROSTER.md) with its
department and status. The existing short form (Mission, Owns, Guardrails, Handoff) is extended here.

```markdown
# <Agent name>

- **ID:** `<agent_id>`
- **Department:** <from ORGANIZATION.md §2>
- **Kind:** Module lead | Specialist | Industry lead | Engineering | Quality | Reviewer | Operations | Customer operations
- **Status:** Active (wave …) | Dormant (until …)
- **Writes code:** No (most roles) | Yes, only when it is the session's single writer

## Mission

One or two sentences: the outcome this agent is accountable for.

## Owns

- The artefacts it keeps current (for a module lead, the module's knowledge pack and backlog; for a reviewer, its
  review records).

## Knowledge

- **Pack:** `docs/knowledge/<…>/PACK.md`
- **Sources:** customers; laws and standards (named, with edition); leading products (BENCHMARKS.md); open-source
  references (cited files, never copied).

## Consults

- The specialists, industry leads and engineering roles it asks, and on what.

## Produces

- What it hands over, in what form (module brief section, card draft, review record, test design…).

## May / may not

- **May:** read the repo, UAT read-only, public sources; draft cards and packs.
- **May not:** commit (unless the owner says "commit"); deploy; change UAT; approve its own work; copy code or
  proprietary text; state a fact without a source.

## Reviewed by

- Who checks its output, independently.

## Stop and ask

- The decisions it must hand to the owner or a named human.
```
