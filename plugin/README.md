# Tangent Jar

Tangent Jar helps you stay on your main task during a focus session you start. When a side question comes up, Claude parks it in a parking list in your project instead of chasing it, counts it against your three tangent tokens for the session, and nudges you back to what you were doing. Spend all three and it still parks the next one, and still helps if you insist, with some playful pushback. It never refuses.

It was made for focused research sessions, where interesting side questions are exactly what derails an afternoon. It adds one skill, `tangent-jar` (in Claude Code: `/tangent-jar:tangent-jar`). It's an independent project, not made or endorsed by Anthropic.

## Install

In Claude Code 2.1.275 or later:

```
/plugin install tangent-jar --marketplace Ablation-Lab/tangent-jar
```

On older versions, add the marketplace first with `/plugin marketplace add Ablation-Lab/tangent-jar`, then `/plugin install tangent-jar@tangent-jar`. To use the skill without the plugin, copy the `skills/tangent-jar` folder into `~/.claude/skills/`. It needs Node.js 18 or later.

## How it works

1. **Start a session.** Tell Claude what you're working on. It notes the main task and gives you three tangent tokens.
2. **Park tangents.** Say "park this" or "that's a tangent", and Claude adds it to the list and spends a token. If Claude thinks something you raise has nothing to do with the main task, it says so in one line and asks whether to park it ("Sounds like a tangent. Park it? (token 2 of 3)"). Say it's related and it carries on without asking again about that topic.
3. **Get nudged back.** After each park you get one short line and a pointer back to where you were.
4. **Run out of tokens.** The fourth tangent goes "on the tab": parked anyway, with a playful line ("The jar is empty, so this one goes on the tab"). If you want to chase it now, Claude helps. If the tangent has become the real work, it offers to switch the session's focus.
5. **End the session.** Claude lists what's waiting in the jar and suggests which one to pick up next.

Outside a focus session it doesn't look for tangents at all; it only parks when you ask.

## Example prompts

```
Start a focus session: drafting the related-work section
Park this for later: does the 2019 benchmark have a newer release?
How many tangent tokens do I have left?
Show my parking list
End the focus session
```

## Try it with the sample (for reviewers)

There's no account to set up: Tangent Jar runs locally and keeps its list in a Markdown file. `samples/tangents.md` in the repository is a parking list from two made-up sessions, one within budget and one two tangents over. To try it:

1. Open any folder in Claude Code (an empty one is fine) and copy `samples/tangents.md` into it if you want to see an existing list.
2. Say: `Start a focus session: write the methods section`.
3. Say: `Park this: look up who first used the phrase "rabbit hole" for research`, three more times with different tangents.
4. Ask: `Show my parking list`, then `End the focus session`.

You should see the token count go 2, 1, 0, then "on the tab" for the fourth, and `tangents.md` should hold the session with four unticked tangents.

**Developer note.** Tangent Jar has not been checked with Seaready yet. (This note is updated once it has.)

## What it runs, reads and writes

- **What it runs:** `node <skill folder>/scripts/tangent.mjs <command>`, with the tangent or main task passed on standard input. Nothing is pre-approved, so Claude Code asks before each run. It starts no other programs.
- **What it reads:** the parking list file, `tangents.md` in your project folder (or another `.md` file you name).
- **What it writes:** only that file. It changes only its own lines (a session's heading, its token line and its checklist items) and keeps anything else you write in the file. Each save goes through a temporary file next to it, so the list is never left half-written. Each entry is your tangent shortened to one line, the time, and which token it used.
- **Network:** none.
- **Session ID:** it uses Claude Code's session ID (`${CLAUDE_SESSION_ID}`) to keep each conversation's tokens separate. Where that isn't available, it uses one session per day.

## Where it works

- **Claude Code**, on Windows, macOS or Linux, with Node.js 18 or later.
- **Cowork:** works when the Cowork session runs on your computer.
- **Claude chat (claude.ai):** the skill loads, but it can't run its helper or keep a file, so it can only remind you of the idea.

## Privacy

Tangent Jar has no server, account or telemetry and collects nothing. The only thing it stores is what you agree to park, in a Markdown file in your own project that you can read, edit or delete. It doesn't keep a record of your conversation and doesn't build a profile; tokens reset with each session. What you say reaches Anthropic the way anything in your conversation does.

## How it's built

- **Markdown with YAML front matter.** The skill is `SKILL.md`: instructions for Claude in Markdown, with a short YAML block at the top (name, description, licence). The instructions say when a tangent is a tangent, how to offer parking without nagging, and how to push back playfully.
- **JavaScript (Node.js ES module).** `scripts/tangent.mjs` is a plain JavaScript file Node runs directly, with no packages. It reads and writes the parking list and prints one line of JSON (a small text format of names and values) for Claude to read.
- **Markdown as the data file.** The parking list is ordinary Markdown: a heading per session, a line with the token count, and a checklist item (`- [ ]`) per tangent. People can read and tick it off by hand, and the helper parses the same lines back.
- **Standard input.** Text goes to the helper through standard input (a quoted heredoc in the shell), not as a command-line argument, so quotes, `$` signs and backticks in a tangent can't change the command.

## Design decisions

- **You opt in.** It only watches for tangents during a session you started, so it never interrupts ordinary work. Policy 2D asks skills not to put themselves forward when nobody asked.
- **Offer, don't grab.** When Claude suspects a tangent it asks once, with the token count, rather than parking it silently, because only you know what serves the main task. "Park it" or "that's a tangent" skips the question.
- **Three tokens is a budget, not a limit.** Going over is allowed and recorded ("2 over"), and the pushback is playful, never a refusal or a guilt trip.
- **A plain file you own.** The list is Markdown in your project, so it lives with your work, shows up in your editor and in git, and needs no app.
- **Store only what you parked.** No transcript, no counts across sessions, no profile.

## How it compares

- **okrdev** (in the directory) is an OKR coach that, among other things, parks distractions against your key results. Tangent Jar does one thing: parking tangents during a focus session, with a token budget, and no OKRs.
- **rescuetime** (in the directory) tracks time and focus sessions in RescueTime. Tangent Jar doesn't track time; it keeps the side questions.
- **Focus and anchor skills** in community directories (Focus Session Manager, dtc-compass, focus-guard, project-refocus, context-anchor) keep a current focus and steer back to it. Tangent Jar adds the parking list you keep in your project, and a budget of three tangent tokens per session with playful pushback after it.
- **Code-Warden** (community skill) locks a coding task's scope and parks tangents. Tangent Jar isn't tied to code or files; it's for any focused work, research especially.
- **The "I have ADHD" skill** holds back a second issue while Claude fixes the first. Tangent Jar parks your own side questions, not Claude's.
- **Claude Tangents** is a browser extension for claude.ai that forks a side conversation so you can explore a tangent now. Tangent Jar does the opposite: it saves the tangent for later and brings you back. The names are similar; they aren't related.

This list came from Seaready's name and overlap search on 2026-11-05.

## Limits

- Whether something is a tangent is Claude's judgement, and sometimes it will be wrong in both directions; say "it's related" or "park it".
- One parking list file per project folder. Use `--file` (ask Claude) for a different one.

## Troubleshooting

- **Claude doesn't offer to park anything:** start a focus session first ("Start a focus session: …"); outside one it only parks when asked.
- **Tokens carried over from another conversation:** the session ID wasn't available, so it used one session per day. Start a new focus session with a different main task, or edit the token line in `tangents.md`.
- **"node" isn't found:** install Node.js 18 or later.
- **The list looks wrong after a hand edit:** keep each session's `## …` heading, its `Session: …` line and its `- [ ]` items in the same shape. Anything else you add (notes, links) is left alone.

## Support

Report problems at https://github.com/Ablation-Lab/tangent-jar/issues.

## Licence

MIT. See the LICENSE file in the repository.

Research by Ablation Lab.
