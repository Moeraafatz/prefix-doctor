/**
 * Realistic multi-turn broken-cache presets for `prefix-doctor ui --demo`
 * and instant reproduction of the 4 most common real-world KV cache killers.
 */

const STATIC_TOOL_DEFS = [
  {
    name: 'read_file',
    description: 'Read UTF-8 text contents of a workspace file by absolute or relative path with optional start/end lines.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace file path' },
        start_line: { type: 'integer', description: '1-based start line' },
        end_line: { type: 'integer', description: '1-based end line' }
      },
      required: ['path']
    }
  },
  {
    name: 'run_shell',
    description: 'Execute a workspace shell command inside the sandbox and return stdout, stderr, and exit status code.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        timeout_ms: { type: 'integer', description: 'Timeout in milliseconds' }
      },
      required: ['command']
    }
  },
  {
    name: 'edit_patch',
    description: 'Apply an exact search-and-replace edit block inside a target workspace file with atomic backup.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Target file path' },
        target: { type: 'string', description: 'Exact existing text block' },
        replacement: { type: 'string', description: 'Replacement text block' }
      },
      required: ['path', 'target', 'replacement']
    }
  },
  {
    name: 'grep_codebase',
    description: 'Search across workspace source files using fast regex matching and return matching file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression search pattern' },
        glob: { type: 'string', description: 'Optional file glob filter' }
      },
      required: ['pattern']
    }
  }
];

const STATIC_SYSTEM_CORE = `You are a senior software engineering coding agent working inside a TypeScript monorepo.
Follow repository architecture conventions strictly:
- Backend uses Hono + Drizzle ORM + PostgreSQL via pgbouncer (prepareThreshold=0).
- Frontend uses React 19 + Vite with strict TypeScript compiler checks enabled.
- Unit tests run via pnpm vitest run; formatting and linting run via pnpm biome check --write.
- Never commit secrets, never edit historical SQL migrations, and always validate external webhook HMAC signatures before parsing JSON bodies.
- When editing files, make minimal targeted diffs, preserve existing public interfaces, verify types cleanly, and report concise verification results.`;

const USER_TURNS = [
  'Inspect src/auth/jwtVerifier.ts and explain how refresh token rotation is enforced.',
  'Check why unit tests fail when aud claim is missing in test/auth.test.ts.',
  'Patch src/auth/jwtVerifier.ts to reject alg=none and validate both aud and iss.',
  'Run pnpm vitest run test/auth.test.ts and inspect the assertion failure.',
  'Fix the mock fixture in test/auth.test.ts to include valid EdDSA test claims.',
  'Now check src/webhooks/stripe.ts for raw body signature verification.',
  'Add idempotency key persistence into billing_idempotency table on retries.',
  'Run full pnpm vitest run and summarize all modified files cleanly.'
];

export function buildDemoTrace(scenario = 'timestamp_buster', turnCount = 8) {
  const turns = [];
  const history = [];
  const baseTs = 1_764_000_000_000;

  for (let i = 0; i < turnCount; i++) {
    const userPrompt = USER_TURNS[i % USER_TURNS.length];
    history.push({ role: 'user', content: userPrompt });

    let tools = JSON.parse(JSON.stringify(STATIC_TOOL_DEFS));
    let system = STATIC_SYSTEM_CORE;
    let model = 'claude-sonnet-4';
    const tsMs = baseTs + i * 20_000;
    const iso = new Date(tsMs).toISOString();

    if (scenario === 'timestamp_buster') {
      // Classic killer #1: live clock + trace UUID injected at top of system prompt!
      system = `Current time: ${iso}\nRequest ID: 550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}\n${STATIC_SYSTEM_CORE}`;
    } else if (scenario === 'shuffled_mcp_tools') {
      // Classic killer #2: MCP server tool list rotated every turn!
      const rot = i % tools.length;
      tools = [...tools.slice(rot), ...tools.slice(0, rot)];
    } else if (scenario === 'model_ping_pong') {
      // Classic killer #3: naive per-turn model router switches models mid-session!
      model = i % 2 === 0 ? 'claude-sonnet-4' : 'claude-opus-4';
    } else if (scenario === 'rag_system_mutation') {
      // Classic killer #4: dynamic RAG chunks prepended into system prompt every turn!
      system = `${STATIC_SYSTEM_CORE}\nDynamic retrieved context: file=src/mod_${i}.ts lines=${i * 10}..${i * 10 + 40} relevance=0.9${i % 9}`;
    }

    turns.push({
      model,
      timestamp_ms: tsMs,
      tools,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: JSON.parse(JSON.stringify(history))
    });

    history.push({
      role: 'assistant',
      content: `Completed step ${i + 1}: verified module constraints, inspected relevant files, and updated assertions cleanly with zero regressions across auth and billing suites.`
    });
  }

  return turns;
}

export const DEMO_SCENARIOS = [
  { id: 'timestamp_buster', label: 'Timestamp + UUID in System Prompt' },
  { id: 'shuffled_mcp_tools', label: 'Shuffled MCP Tool Order' },
  { id: 'model_ping_pong', label: 'Mid-Session Model Switch (Cold Prefill)' },
  { id: 'rag_system_mutation', label: 'Dynamic RAG Mutating System Prompt' }
];
