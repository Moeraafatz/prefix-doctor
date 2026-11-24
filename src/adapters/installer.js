import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const SKILL_SRC = path.join(PACKAGE_ROOT, 'skills/prefix-doctor/SKILL.md');

function writeSafe(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
  return targetPath;
}

function mergeMcpJson(targetPath, entry) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  let existing = {};
  if (fs.existsSync(targetPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    } catch {
      existing = {};
    }
  }
  existing.mcpServers = existing.mcpServers || {};
  existing.mcpServers['prefix-doctor'] = entry;
  fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  return targetPath;
}

function toCursorRule(body) {
  const stripped = body.replace(/^---[\s\S]*?---\s*/, '');
  return `---
description: KV Prompt-Cache Hygiene rules and prefix-doctor MCP diagnostics to prevent 5-10x LLM API overbilling.
alwaysApply: false
---

${stripped}`;
}

export function installAgentAdapters({ targetDir = process.cwd(), targets = ['all'], useLocalBin = true } = {}) {
  const skillBody = fs.readFileSync(SKILL_SRC, 'utf8');
  const binPath = path.join(PACKAGE_ROOT, 'bin/prefix-doctor.js');
  const entry = useLocalBin
    ? { command: 'node', args: [binPath, 'mcp'] }
    : { command: 'npx', args: ['-y', 'prefix-doctor@1.0.0', 'mcp'] };

  const selected = new Set(targets.includes('all') ? ['claude', 'codex', 'cursor', 'windsurf', 'antigravity'] : targets);
  const files = [];

  if (selected.has('claude')) {
    files.push(writeSafe(path.join(targetDir, '.claude/skills/prefix-doctor/SKILL.md'), skillBody));
    files.push(mergeMcpJson(path.join(targetDir, '.mcp.json'), entry));
  }
  if (selected.has('codex')) {
    files.push(writeSafe(path.join(targetDir, '.codex/skills/prefix-doctor/SKILL.md'), skillBody));
    const toml = `# Append to ~/.codex/config.toml or project .codex/config.toml
[mcp_servers.prefix-doctor]
command = "${entry.command}"
args = ${JSON.stringify(entry.args)}
`;
    files.push(writeSafe(path.join(targetDir, '.codex/prefix-doctor.config.toml'), toml));
  }
  if (selected.has('cursor')) {
    files.push(writeSafe(path.join(targetDir, '.cursor/rules/prefix-doctor.mdc'), toCursorRule(skillBody)));
    files.push(mergeMcpJson(path.join(targetDir, '.cursor/mcp.json'), entry));
  }
  if (selected.has('windsurf')) {
    files.push(writeSafe(path.join(targetDir, '.windsurf/rules/prefix-doctor.md'), skillBody));
  }
  if (selected.has('antigravity')) {
    files.push(writeSafe(path.join(targetDir, '.agent/skills/prefix-doctor/SKILL.md'), skillBody));
  }

  return { targets: [...selected], files, mcpEntry: entry };
}
