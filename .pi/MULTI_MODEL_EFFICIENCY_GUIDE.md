# Multi-Model Agent Execution & Token Efficiency Guide
**Applicable Models: OpenAI Codex, Anthropic Claude, Google Gemini / Antigravity**

To ensure high velocity, low token consumption, and zero hallucination/file-thrashing when switching between AI models, adhere strictly to these execution rules.

---

## 1. The 5 Golden Rules of Token Efficiency

### A. Surgical Diffing Only (No Full-File Rewrites)
- **Problem**: Generating an entire 1,500-line file to change 10 lines costs ~8,000 output tokens and 60-90s of latency.
- **Rule**: Never rewrite files wholesale. Use targeted search-and-replace with unique anchor lines:
  ```json
  // Target: StartLine: 24, EndLine: 30
  // Only stream the diff replacement.
  ```

### B. Bypass Global Package Manager Loops
- **Problem**: Running `pnpm test` or `pnpm install` across 110 workspace packages triggers interactive prompts (`? The modules directories will be removed...`), causing models to hang or loop.
- **Rule**: Run local binaries directly:
  ```bash
  # FAST (6 seconds)
  ./node_modules/.bin/vitest run <path_to_test>
  ./node_modules/.bin/tsc --noEmit

  # DO NOT RUN inside agent loop
  pnpm install
  pnpm --filter ...
  ```

### C. Precision File Reading (Byte & Line Slicing)
- **Problem**: Loading a whole 2,700-line service floods context and burns 15,000 input tokens.
- **Rule**: 
  1. `grep_search` to find the exact line numbers.
  2. `view_file` with explicit `StartLine` and `EndLine` (e.g. 50-line window around target).

### D. Single-Responsibility Subagents (No File Collisions)
- **Problem**: Multiple agents editing `AppSidebar.tsx` or shared routes simultaneously causes conflicting diffs and repetitive overwrites.
- **Rule**: Each subagent gets an isolated directory (e.g. `modules/accounts-receivable/` or `e2e/`). Only the Orchestrator touches shared root contracts (`@gigalibs/contracts`).

### E. Demand Executable Evidence, Not Philosophical Critique
- **Problem**: Models in review mode produce speculative essays about code-smells rather than testing code.
- **Rule**: Prompts to Codex/Claude must require:
  - Exact file path and line number
  - Reproducible shell command or failing test assertion
  - No speculative refactoring without an active `WI-OI-NNN` work item.

---

## 2. Standard Prompt Template for Codex / Claude / External Agents

When prompting Codex or Claude, paste this boundary instruction:

```markdown
You are operating in the GigaLibs codebase under strict G0-G7 SDLC standards.
Rules:
1. Do NOT rewrite full files. Propose only minimal surgical diffs with line numbers.
2. Verify all assertions using `./node_modules/.bin/vitest run <test_path>` or `node scripts/<script>.mjs`.
3. Do NOT run `pnpm install` or interactive package commands.
4. Report findings as: [File Path] : [Line Number] : [Executable Failure / Test].
5. Do not propose speculative refactoring of functioning, tested files unless an automated gate fails.
```
