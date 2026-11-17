@AGENTS.md

## Claude Code only

- Use `gh` (or GitHub MCP tools) for issues, PRs or the board only when the human asks for it in that message.
- Don't add MCP servers, hooks or permissions to `.claude/` settings without asking.
- Run long-lived commands (`npx expo start`, `uvicorn`, `npm run dev`) in the background, not the foreground. If one needs interaction, such as a login, ask the human to run it with `!`.
- For a ticket that touches more than one directory, or touches `CONTRACTS.md` or `shared/types.ts`, write a short plan and get the human's OK before editing.
- Never save keys, `.env` contents or tunnel URLs to memory.
