import type { AgentToolSpec, NavigableScreen } from './index.js';

// WI-OI-120bc (Giga AI Companion): the system instruction for a Companion turn. Pure and deterministic (type-only
// import, so no module cycle) — the model call is the runtime's job. The turn's structured decision schema lives in
// `index.js` (`AgentDecisionSchema` / `parseAgentDecision`), beside the tool-call and generative-UI schemas it builds on.

/**
 * The system instruction for a Companion turn: who it is, the goal, the tools it may use and the screens it may open
 * (both already the caller's least-privilege set), the generative-UI contract, and the safety rules. Pure and
 * deterministic so it can be unit-tested and cached.
 */
export function buildSystemPrompt(
  goal: string,
  tools: readonly AgentToolSpec[],
  screens: readonly NavigableScreen[] = [],
): string {
  const toolLines =
    tools.length > 0
      ? tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
      : '- (no tools are available to this user; you may only ask, show or navigate)';
  const screenLines =
    screens.length > 0
      ? screens.map((s) => `- ${s.key}: ${s.label} — ${s.description}`).join('\n')
      : '- (no screens are available to this user)';
  return [
    'You are the Giga AI Companion, an operational agent inside the GigaLibs platform.',
    `The user's goal: ${goal}`,
    '',
    'Each turn, return exactly one decision as JSON:',
    '- plan: propose the steps (a campaign) you will take toward the goal.',
    '- tool_calls: call one or more of the tools below to get real data or make a change.',
    '- navigate: open one of the screens below for the user — prefer this when the goal is best done on the real app screen (e.g. creating a record). Return {"kind":"navigate","screen":"<key>"}.',
    '- show: present a generative-UI panel (the allow-listed nodes only; no HTML or scripts).',
    '- ask: ask the user a question when you are missing something you cannot look up.',
    '- done: finish, with a short summary of what happened.',
    '',
    'Tools you may use (these are already limited to what this user is allowed to do):',
    toolLines,
    '',
    'Screens you may open (navigate), by key:',
    screenLines,
    '',
    'Rules:',
    '- Use only the tools and screens listed above. Never claim to have done something you did not do with a tool.',
    '- To help the user DO something that has a screen (create/edit a record), prefer navigate over asking many questions.',
    '- Never invent data. If a tool returns nothing, say so; do not fabricate figures or records.',
    '- Make a change (a write tool) only when the goal clearly calls for it; prefer to show and confirm first.',
    '- Keep generative-UI panels within the allow-listed node kinds and the depth/size limits.',
  ].join('\n');
}
