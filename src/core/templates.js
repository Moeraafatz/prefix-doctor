/**
 * Static Source-Code Auditor for LLM Prompt Builders (JS/TS/Python).
 * Catches KV cache-busting anti-patterns in your agent codebase BEFORE production.
 */

function lineAt(text, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

const CODE_RULES = [
  {
    id: 'SRC_TIMESTAMP_IN_SYSTEM',
    severity: 'critical',
    title: 'Dynamic timestamp interpolated inside system prompt template',
    regex: /\b(?:system(?:_prompt|Prompt|Message)?)\b[^\n;]{0,160}(?:new\s+Date\s*\(|Date\.now\s*\(|datetime\.now\s*\(|datetime\.utcnow\s*\(|time\.time\s*\(|toISOString\s*\()/gi,
    fix: 'Remove live clocks from system prompts; pass timestamps in the latest user turn or quantize to YYYY-MM-DD.'
  },
  {
    id: 'SRC_UUID_IN_SYSTEM',
    severity: 'critical',
    title: 'Random UUID / request_id interpolated inside system prompt template',
    regex: /\b(?:system(?:_prompt|Prompt|Message)?)\b[^\n;]{0,160}(?:randomUUID\s*\(|uuid4\s*\(|Math\.random\s*\(|request[_-]?id|trace[_-]?id)/gi,
    fix: 'Relocate per-request IDs to HTTP headers or tail user metadata so the system prefix stays cacheable.'
  },
  {
    id: 'SRC_UNSORTED_TOOLS_ENUM',
    severity: 'high',
    title: 'Potentially non-deterministic tool list passed without sorting',
    regex: /\btools\s*[:=]\s*(?:Object\.values\s*\(|Array\.from\s*\([^)]*\.values\s*\(|list\s*\([^)]*\.values\s*\(|set\s*\()/gi,
    fix: 'Sort tools[] lexicographically by tool name before API dispatch to prevent token-0 cache invalidation.'
  },
  {
    id: 'SRC_HISTORY_MUTATION_UNSHIFT',
    severity: 'high',
    title: 'Prepending or splicing earlier conversation messages (Context Has a Price)',
    regex: /\b(?:messages|history|conversation)\.(?:unshift|splice)\s*\(/gi,
    fix: 'Treat history as append-only; append retrieved RAG/context blocks at the tail instead of mutating early turns.'
  },
  {
    id: 'SRC_ANTHROPIC_NO_CACHE_CONTROL',
    severity: 'medium',
    title: 'Anthropic messages.create call without cache_control breakpoints',
    regex: /\banthropic\.messages\.create\s*\(\s*\{(?![\s\S]{0,600}cache_control)/gi,
    fix: 'Add cache_control: { type: "ephemeral" } to tools, static system prompt, and rolling history boundary.'
  }
];

export function auditPromptSourceCode(code, filePath = 'agent.ts') {
  const findings = [];
  const src = String(code || '');
  for (const rule of CODE_RULES) {
    rule.regex.lastIndex = 0;
    let m;
    while ((m = rule.regex.exec(src)) !== null) {
      findings.push({
        id: rule.id,
        severity: rule.severity,
        file: filePath,
        line: lineAt(src, m.index),
        title: rule.title,
        evidence: m[0].replace(/\s+/g, ' ').slice(0, 120),
        fix: rule.fix
      });
    }
  }
  const hasCritical = findings.some((f) => f.severity === 'critical');
  const hasHigh = findings.some((f) => f.severity === 'high');
  const color = hasCritical ? 'red' : hasHigh || findings.length > 0 ? 'yellow' : 'green';
  return {
    file: filePath,
    color,
    verdict: color === 'red' ? 'CACHE_BROKEN' : color === 'yellow' ? 'DEGRADED' : 'CLEAN',
    findings
  };
}
