# CLI Contracts

The first implementation milestone should expose read-only commands:

- `codimd-helper search`
- `codimd-helper read`
- `codimd-helper sync`

After those are stable, add write commands:

- `codimd-helper create`
- `codimd-helper update`

All commands should support `--json` so agents can parse output reliably.

Write commands should be conservative and should avoid full-note replacement unless the caller explicitly passes `--replace` and `--yes`.

## Database Mode

Set `CODIMD_DB_URL` for read-only search and read commands:

```env
CODIMD_DB_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
```

Recommended deployment:

- Run the CLI on the same host as Docker.
- Use an SSH tunnel when running the CLI from a workstation.
- Use a read-only PostgreSQL user for agent access.
