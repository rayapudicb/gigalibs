#!/usr/bin/env node
/**
 * @gigalibs/workflow-mcp
 *
 * MCP server (Model Context Protocol) that bridges Claude / any MCP-capable AI
 * with GigaLibs Workflow Studio. Each workflow on the platform is exposed as a
 * named tool that the AI can call directly.
 *
 * Usage:
 *   npx @gigalibs/workflow-mcp
 *
 * Environment variables:
 *   GIGALIBS_API_KEY      — API key for the workflow platform (optional for local dev)
 *   GIGALIBS_WORKFLOW_URL — Base URL (default: http://localhost:5180)
 *
 * MCP client config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "gigalibs-workflows": {
 *         "command": "npx",
 *         "args": ["-y", "@gigalibs/workflow-mcp"],
 *         "env": {
 *           "GIGALIBS_WORKFLOW_URL": "https://your-platform-url"
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { GigaWorkflowClient, WorkflowRun } from '@gigalibs/workflow-sdk';

const client = new GigaWorkflowClient();

// ─────────────────────────────────────────────────────────
// Helper: workflow code → MCP tool name
// ─────────────────────────────────────────────────────────
function wfCodeToToolName(code: string): string {
  return 'run_' + code.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}
function toolNameToWfCode(name: string): string {
  return name.replace(/^run_/, '').replace(/_/g, '-');
}

// ─────────────────────────────────────────────────────────
// Server setup
// ─────────────────────────────────────────────────────────
const server = new Server(
  { name: 'gigalibs-workflow', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// ── List tools ───────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [
    // Meta tool: discover workflows
    {
      name: 'gigalibs_list_workflows',
      description:
        'List all workflows available on the connected GigaLibs Workflow Platform, ' +
        'including their codes, names, and descriptions.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];

  // Dynamically expose each workflow as its own tool
  try {
    const workflows = await client.listWorkflows();
    for (const wf of workflows) {
      tools.push({
        name: wfCodeToToolName(wf.code),
        description:
          (wf.description ? wf.description + ' ' : '') +
          `Execute the GigaLibs workflow ${wf.name} (code: ${wf.code}).`,
        inputSchema: {
          type: 'object',
          properties: {
            inputs: {
              type: 'object',
              description: 'Key-value inputs passed to the first node(s) of the workflow.',
              additionalProperties: true,
            },
            timeout_seconds: {
              type: 'number',
              description: 'Max seconds to wait for completion (default 60).',
            },
          },
          required: ['inputs'],
        },
      });
    }
  } catch (err) {
    // If platform is unreachable, still expose the meta tool
    console.error('[gigalibs-mcp] Could not fetch workflows:', err);
  }

  return { tools };
});

// ── Call tool ────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const typedArgs = args as Record<string, unknown>;

  // ── meta: list ──────────────────────────────────────
  if (name === 'gigalibs_list_workflows') {
    try {
      const workflows = await client.listWorkflows();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(workflows, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error fetching workflows: ${err}` }],
        isError: true,
      };
    }
  }

  // ── dynamic workflow runner ─────────────────────────
  if (name.startsWith('run_')) {
    const code = toolNameToWfCode(name);
    const inputs = (typedArgs.inputs as Record<string, unknown>) ?? {};
    const timeoutMs = ((typedArgs.timeout_seconds as number) ?? 60) * 1000;

    try {
      const run: WorkflowRun = await client.executeAndWait(code, inputs, timeoutMs);

      const summary = {
        runId: run.runId,
        workflowCode: run.workflowCode,
        status: run.status,
        duration_ms: run.duration_ms,
        output: run.output ?? null,
        error: run.error ?? null,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        isError: run.status === 'error',
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Workflow ${code} failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// ─────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP servers communicate over stdio; log to stderr so it doesn't pollute the protocol
  console.error('[gigalibs-mcp] GigaLibs Workflow MCP server ready (stdio)');
  console.error(`[gigalibs-mcp] Platform: ${process.env.GIGALIBS_WORKFLOW_URL ?? '(not configured)'}`);
}

main().catch((err) => {
  console.error('[gigalibs-mcp] Fatal:', err);
  process.exit(1);
});
