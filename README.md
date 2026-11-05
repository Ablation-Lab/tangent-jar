# Tangent Jar

Tangent Jar is a Claude Code plugin that helps you stay on your main task in a focus session you start. Tell Claude your main task, and when a side question comes up it parks it in a list in your project for later (asking first unless you said "park this") and nudges you back. You get three tangent tokens per session; after that Claude still parks each tangent, with some playful pushback. The plugin lives in [plugin/](plugin/); its README, [plugin/README.md](plugin/README.md), describes what it does, what it reads and writes, and how to try it.

## Install

```
/plugin install tangent-jar --marketplace Ablation-Lab/tangent-jar
```

Or copy `plugin/skills/tangent-jar` into `~/.claude/skills/` to use it as a personal skill.

## Repository layout

| Path | What it is |
|---|---|
| `plugin/` | the plugin folder (Plugin path `plugin` in the directory portal) |
| `plugin/skills/tangent-jar/` | the skill: `SKILL.md` and `scripts/tangent.mjs` |
| `samples/tangents.md` | a sample parking list for reviewers |
| `.claude-plugin/marketplace.json` | lets Claude Code install the plugin from this repo |
| `test/` | tests, run with `node --test` (not part of the plugin) |
| `scripts/privacy-check.sh`, `.githooks/` | the maintainer's pre-commit privacy check; the plugin never runs it |

Keep `plugin/README.md` and `SKILL.md` in step, and the versions in `plugin.json` and `marketplace.json` equal.

MIT licence. An independent project, not made or endorsed by Anthropic.
