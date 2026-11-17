# Linear+ (bb plugin)

An add-on for the [Taskboard](https://github.com/MateoCerquetella/bb-plugins)
bb plugin that ties threads to tracker tickets.

- **Ticket button in the thread header**: `KEY · Status`, opens the ticket.
- **Start a thread from a ticket**: a search bar above the new-thread composer
  finds tickets of the selected project by key or title. Picking one appends
  the ticket as context to your prompt. On send, the thread is titled
  `KEY <ticket title>`, so bb names the worktree branch after the ticket, and
  the thread is linked to the ticket.

Linear+ stores no tracker credentials. It reads everything through Taskboard,
so tickets show up only for projects you have set up in Taskboard (Linear,
GitHub, GitLab, Jira or Gitea).

## Install

Taskboard first, then Linear+:

```sh
bb plugin install taskboard@bb-community --yes
bb plugin install git:github.com/vicegold/bb-plugin-linear-plus@^0.1.0 --yes
```

## Develop

```sh
npm install --include=dev
bb plugin install .          # register this checkout in place
bb plugin dev                # rebuild and reload on every save
```

- `npm test`, `npm run typecheck`, `npm run build`

Release: bump `version` in `package.json`, commit, `git tag vX.Y.Z && git push --tags`.

## License

MIT. `components/source-glyph.tsx` comes from Taskboard (MIT), see `NOTICE.md`.
