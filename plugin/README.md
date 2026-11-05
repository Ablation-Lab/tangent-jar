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

1. **Start a session.** Tell Claude what you're working on. It notes the main task and gives you three fresh tangent tokens. Each new focus session starts with three, even in the same conversation.
2. **Park tangents.** Say "park this" or "that's a tangent", and Claude adds it to the list and spends a token. If you raise something clearly unrelated to the main task, Claude says so in one line and asks whether to park it ("Sounds like a tangent. Park it? (token 2 of 3)"). Say it's related and it carries on without asking again about that topic; turn down two offers, or say "stop asking", and it stops offering for that session.
3. **Get nudged back.** After each park you get one short line and a pointer back to where you were.
4. **Run out of tokens.** The fourth tangent goes "on the tab": parked anyway, with a playful line ("The jar is empty, so this one goes on the tab"). If you want to chase it now, Claude helps. If the tangent has become the real work, it offers to switch the session's main task (keeping the tokens you've spent).
5. **End the session.** Claude lists what's waiting in the jar and suggests which one to pick up next. Later, even in another conversation, say "tick off the one about X" and it's marked done.

Outside a focus session it doesn't look for tangents at all; it only parks when you ask it to put something in the Tangent Jar or your parking list.

## Example prompts

```
Start a focus session: drafting the related-work section
Park this in the tangent jar: does the 2019 benchmark have a newer release?
How many tangent tokens do I have left?
Show my parking list
End the focus session
```

## Try it with the sample (for reviewers)

There's no account to set up: Tangent Jar runs locally and keeps its list in a Markdown file. The repository's [samples/tangents.md](https://github.com/Ablation-Lab/tangent-jar/blob/main/samples/tangents.md) is a parking list from two made-up sessions, one within budget and one two tangents over. To try it:

1. Copy `samples/tangents.md` into an empty folder and open that folder in Claude Code.
2. Say: `Show every session in my parking list`. You should see both sample sessions, with six open tangents.
3. Say: `Tick off the one about the talk comparing review councils to code review`. It's ticked in the first sample session.
4. Say: `Start a focus session: write the methods section`.
5. Say: `Park this: look up who first used the phrase "rabbit hole" for research`, then three more times with different tangents.
6. Say: `End the focus session`.

You should see the token count go 2, 1, 0, then "on the tab" for the fourth. `tangents.md` should then hold the two sample sessions and a new one with four unticked tangents.

**Developer note.** Tangent Jar has not been checked with Seaready yet. (This note is updated once it has.)

## What it runs, reads and writes

- **What it runs:** `node <skill folder>/scripts/tangent.mjs <command>`, with the tangent or main task passed on standard input. Claude Code asks before each run unless your permission settings already allow it. It starts no other programs.
- **What it reads:** the parking list file, `tangents.md` in your project folder (or another `.md` or `.txt` file you name; it refuses `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, anything in `.claude/`, links, and network paths).
- **What it writes:** only that file. It changes only its own lines (a session's heading, its token line and its checklist items) and keeps anything else you write in the file, including its line endings (a file with mixed line endings is saved with Windows ones throughout). Each save goes through a temporary file next to it, so the list is never left half-written; the temporary file is removed straight after, unless the run is killed mid-save, which can leave a `tangents.md.tmp-…` file to delete.
- **Network:** none.
- **Session ID:** it uses Claude Code's session ID (`${CLAUDE_SESSION_ID}`) to tell one conversation's sessions from another's. Where that isn't available, it treats each day as one conversation.

## Where it works

- **Claude Code**, with Node.js 18 or later. Tested on Windows 11; the helper uses only Node's standard library, so macOS and Linux should work but weren't tested.
- **Cowork and Claude chat (claude.ai):** not tested. On claude.ai the skill can't run its helper or keep a file, so it won't work there.

## Privacy

Tangent Jar has no server, account or telemetry and sends nothing anywhere. It stores, in a Markdown file in your own project: the main task you name for each session, the tangents you agree to park (each shortened to one line), the times, the token counts and Claude Code's session ID. You can read, edit or delete it. It keeps every session until you delete it, and when you ask to see every session, or tick off a tangent from an earlier conversation, Claude reads them all. It doesn't keep a record of your conversation and doesn't build a profile. If your project is in a public git repository, add `tangents.md` to `.gitignore` unless you want your tangents published. What you say reaches Anthropic the way anything in your conversation does.

## How it's built

- **Markdown with YAML front matter.** The skill is `SKILL.md`: instructions for Claude in Markdown, with a short YAML block at the top (name, description, licence). The instructions say when a tangent is a tangent, how to offer parking without nagging, and how to push back playfully.
- **JavaScript (Node.js ES module).** `scripts/tangent.mjs` is a plain JavaScript file Node runs directly, with no packages. It reads and writes the parking list and prints one line of JSON (a small text format of names and values) for Claude to read.
- **Markdown as the data file.** The parking list is ordinary Markdown: a heading per session, a line with the token count, and a checklist item (`- [ ]`) per tangent. People can read and tick it off by hand, and the helper parses the same lines back.
- **Standard input.** Text goes to the helper on standard input, not as a command-line argument. SKILL.md tells Claude to make the text a single line and to use a new random end marker for each run, so a tangent's text can't end the input early and become part of the command.

## Design decisions

- **You opt in.** It only watches for tangents during a session you started, so it never interrupts ordinary work.
- **Offer, don't grab.** When Claude suspects a tangent it asks once, with the token count, rather than parking it silently, because only you know what serves the main task. "Park it" or "that's a tangent" skips the question, and "stop asking" ends the offers.
- **Three tokens is a budget, not a limit.** Going over is allowed and recorded ("2 over"), and the pushback is playful, never a refusal or a guilt trip.
- **A plain file you own.** The list is Markdown in your project, so it lives with your work and shows up in your editor, and it needs no app.
- **Store only what you parked.** No transcript, no profile; each session's tokens are its own.

## How it compares

- **okrdev** (in the directory) is an OKR coach that, among other things, parks distractions against your key results. Tangent Jar does one thing: parking tangents during a focus session, with a token budget, and no OKRs.
- **rescuetime** (in the directory) tracks time and focus sessions in RescueTime. Tangent Jar doesn't track time; it keeps the side questions.
- **stay-on-target** and **park** in technicalpickles/pickled-claude-plugins: stay-on-target is a focused development mode that detects drift from a plan; park saves the whole current work session to resume later. Tangent Jar keeps your main task going and saves only the side questions.
- **The `session` skill on claudskills.com** keeps a session parking lot of diverging ideas and open questions. Tangent Jar adds the token budget with playful pushback, and keeps the list as a checklist across sessions that you tick off later.
- **Focus and anchor skills** in community directories (Focus Session Manager, dtc-compass, focus-guard, project-refocus, context-anchor) keep a current focus and steer back to it. Tangent Jar adds the parking list you keep in your project, and a budget of three tangent tokens per session.
- **Code-Warden** (community skill) locks a coding task's scope and parks tangents. Tangent Jar isn't tied to code or files; it's for any focused work, research especially.
- **The "I have ADHD" skill** holds back a second issue while Claude fixes the first. Tangent Jar parks your own side questions, not Claude's.
- **sidequest-claude-skill** (samanpwbb) sends an agent off on a side quest now. **Claude Tangents**, a browser extension for claude.ai, forks a side conversation so you can explore a tangent now. Tangent Jar does the opposite: it saves the tangent for later and brings you back. Claude Tangents' name is similar; the two aren't related.

## Limits

- Whether something is a tangent is Claude's judgement, and sometimes it will be wrong in both directions; say "it's related" or "park it".
- One parking list file per project folder. Ask Claude to use a different file if you want one.
- Two Claude conversations parking into the same file at the same instant can lose one of the two tangents (each save replaces the file). This needs two parks within milliseconds of each other.
- Files saved as UTF-16 (which Windows PowerShell's `>` produces) and files that are links are refused rather than rewritten; save the file as UTF-8, or use a plain file.
- Markdown in a tangent is stored as you typed it, so a Markdown viewer shows links and formatting in it.
- If Claude Code doesn't fill in the project folder and Claude passes a path starting with `/` from Git Bash on Windows, Git Bash maps it into its own install folder (for example `C:\Program Files\Git\tangents.md`). SKILL.md tells Claude to pass the full project path instead.

## Troubleshooting

- **Claude doesn't offer to park anything:** start a focus session first ("Start a focus session: …"); outside one it only parks when asked.
- **Tokens didn't reset:** you changed the main task (which keeps the tokens) rather than starting a new session. Say "start a new focus session: …".
- **"node" isn't found:** install Node.js 18 or later.
- **"isn't UTF-8 text":** save `tangents.md` as UTF-8 in your editor.
- **"couldn't save … is it open somewhere that locks it?":** another program has the file locked (an editor, a sync tool); close it or try again.
- **The list looks wrong after a hand edit:** keep each session's `## …` heading, its `Session: …` line and its `- [ ]` items in the same shape. Anything else you add (notes, links) is left alone.

## Support

Report problems at https://github.com/Ablation-Lab/tangent-jar/issues.

## Licence

MIT. See the LICENSE file in the repository.

Research by Ablation Lab.
