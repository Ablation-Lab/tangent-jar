# Tangent Jar

Tangent Jar is a Claude Code plugin that helps you stay on your main task during a focus session: Claude parks side questions in a parking list in your project, counts them against three tangent tokens per session, and nudges you back, with playful pushback (never a refusal) after the third. The plugin lives in [plugin/](plugin/); its README, [plugin/README.md](plugin/README.md), describes what it does, what it reads and writes, and how to try it.

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
