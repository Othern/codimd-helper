# Authentication

Start with one of these approaches, depending on how your CodiMD server is configured:

1. Direct database access through a read-only service account.
2. SSH tunnel to the PostgreSQL container or host.
3. Session cookie authentication.
4. Username/password login flow.

Prefer the least privileged option that supports the requested tools.

For the current CLI-first implementation, set `CODIMD_DB_URL` to a PostgreSQL connection string. If the CLI runs on the same Docker host, connect through the Docker network or expose a local-only PostgreSQL port. If the CLI runs from another machine, prefer an SSH tunnel rather than exposing PostgreSQL publicly.
