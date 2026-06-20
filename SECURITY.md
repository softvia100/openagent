# Security

OpenAgent executes shell commands, reads and writes files, and fetches arbitrary URLs on behalf of an AI model's decisions. That's a meaningfully different risk profile from most CLI tools, and it's treated accordingly throughout the design — see `ARCHITECTURE.md` Section 23 for the full permissions model. This document covers how to report a vulnerability and summarizes the security posture for users evaluating whether to trust this tool on real, sensitive codebases.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a security vulnerability. Instead:

- Email the maintainers at the security contact listed in the repository's GitHub Security Advisories page (use "Report a vulnerability" under the repo's Security tab), or
- Open a private GitHub Security Advisory directly.

Include: what you found, how to reproduce it, and what you believe the impact is (what could an attacker actually do with this). We'll acknowledge receipt and aim to keep you updated on progress toward a fix. Responsible disclosure — giving us a reasonable window to ship a fix before public disclosure — is appreciated and is how we'll treat any report by default unless you indicate otherwise.

## Security posture summary

For full detail, read `ARCHITECTURE.md` Section 23. The short version:

- **Destructive or irreversible tool actions require explicit, per-call user approval by default** (file overwrites, shell commands, git operations). There is no global "trust everything" toggle that silently removes this; autonomy settings are granular and per-phase (Section 14.4), and `bash` specifically has no auto-allow tier at all (Section 23.3) — every shell command, every time, gets a real prompt naming exactly what's about to run and which agent is asking.
- **Filesystem access is sandboxed to the project's working directory.** Path traversal attempts are rejected at the tool-execution layer, before reaching any tool implementation, regardless of what a model requested.
- **API keys/credentials are never written into committed config files.** They live in your OS keychain or a restricted-permission local file, kept separate from the project config that's meant to be shared/committed (`ARCHITECTURE.md` Section 18.2).
- **Skills can carry executable scripts, and that's a real attack surface if you install skills from untrusted sources.** Project-scoped skills are trusted at the same level as the rest of your repo's code; third-party global skills are not auto-trusted to execute anything — running a skill's script goes through the same permission pipeline as a direct shell command (Section 23.5). Review `scripts/` in any skill you install from somewhere other than your own team before running it.
- **`plan.md` and approval gates exist specifically so multi-team, multi-agent work is never executed without the user having seen and approved what's about to happen** (Section 14). This is a usability feature and a security feature at once — the biggest practical risk in an autonomous coding agent isn't usually a single malicious tool call, it's an well-intentioned agent doing something broader than the user expected, silently.

## Threat model notes

OpenAgent's threat model treats the model provider itself as **not fully trusted** — i.e., the system is designed assuming a model could, through error or adversarial prompt injection (e.g., from content fetched via `web_fetch`, or from a malicious file the agent reads), attempt to request a tool call it shouldn't. The permission system and sandbox boundaries (Section 23) are the actual line of defense against this, not the model's own judgment. Do not rely on "the model probably wouldn't do that" as a security boundary; the system is built not to need that assumption.

This does **not** mean OpenAgent is safe to run with all approval gates disabled against an untrusted/adversarial codebase (e.g., cloning a random public repo and immediately running `openagent --approve-all`). Non-interactive/auto-approve modes (`ARCHITECTURE.md` Section 20.3) are intended for trusted CI contexts working on your own codebase, not as a general-purpose "run this against anything" mode.

## Supported versions

Security fixes are released for the most recent minor version line. Given the project's current stage (pre-1.0, see `ROADMAP.md`), there is no long-term-support branch yet; this will be revisited once there's a stable 1.0 release with a real user base depending on specific versions.

## Dependencies

OpenAgent depends on the Anthropic SDK, OpenAI SDK (once that provider lands), Ink, React, and a handful of smaller utilities — kept deliberately minimal given that this tool runs with real filesystem and shell access, where a compromised dependency has unusually high leverage. Dependency updates that touch anything in the security-relevant path (`src/core/tool-executor.ts`, `src/config/credentials.ts`, anything handling subprocess execution) get extra scrutiny in review, not just an automated version bump merge.
