# CodiMD Helper

Agent-friendly CLI for searching and reading notes from the CodiMD instance at:

```text
http://140.115.52.84:3000
```

The recommended deployment is:

1. Install and configure `codimd-helper` on the CodiMD server.
2. Keep PostgreSQL credentials only on the CodiMD server.
3. Let other agent machines call the server-side CLI through SSH.

This avoids exposing PostgreSQL to every agent machine and keeps configuration centralized.

## Architecture

```text
Agent machine
  |
  | ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "3GPP" --json
  v
CodiMD server
  |
  | local .env contains CODIMD_DB_URL
  v
PostgreSQL container/database
```

## Server Setup

Run these steps on the CodiMD server.

### 1. Install Node.js 20+

Check the current version:

```bash
node -v
npm -v
```

Node.js 20 or newer is required. If the system Node is old, using `nvm` is usually the safest option:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v
```

### 2. Configure `.env`

In the project directory:

```bash
cd /home/hscc/codiMD/codimd-helper
cp .env.example .env
nano .env
```

Example:

```env
CODIMD_BASE_URL=http://140.115.52.84:3000
CODIMD_DB_URL=postgres://USER:PASSWORD@127.0.0.1:5432/DATABASE
INDEX_PATH=./data/index
CACHE_PATH=./data/cache
```

Do not put real credentials in `.env.example`.

### 3. Ensure PostgreSQL Is Reachable From The Server

If the CLI runs on the Docker host, expose PostgreSQL to localhost only:

```yaml
database:
  ports:
    - "127.0.0.1:5432:5432"
```

Apply the compose change:

```bash
docker compose up -d
```

Then use `127.0.0.1:5432` in `CODIMD_DB_URL`.

### 4. Build And Install Server Wrapper

You can use the helper script:

```bash
cd /home/hscc/codiMD/codimd-helper
bash scripts/install-server-wrapper.sh
```

The script runs:

- `npm install`
- `npm run build`
- creates `/usr/local/bin/codimd-helper`

Manual equivalent:

```bash
cd /home/hscc/codiMD/codimd-helper
npm install
npm run build
sudo nano /usr/local/bin/codimd-helper
sudo chmod +x /usr/local/bin/codimd-helper
```

Wrapper content:

```bash
#!/usr/bin/env bash
export NVM_DIR="/home/hscc/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

cd /home/hscc/codiMD/codimd-helper
exec node dist/index.js "$@"
```

### 5. Test On The Server

```bash
/usr/local/bin/codimd-helper search "3GPP" --json
/usr/local/bin/codimd-helper read "<note-id-or-url>" --json
```

## Agent Machine Setup

Run these steps on each non-server machine that should call the CodiMD knowledge CLI.

### 1. Test SSH

```bash
ssh hscc@140.115.52.84 'echo ok'
```

If this asks for a password every time, configure SSH key authentication.

### 2. Configure SSH Key Authentication

On Windows PowerShell:

```powershell
ssh-keygen -t ed25519 -C "codimd-helper-agent"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Copy the public key line. It starts with `ssh-ed25519`.

On the CodiMD server:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Paste the public key into `authorized_keys`.

Test from the agent machine:

```powershell
ssh hscc@140.115.52.84 "echo ok"
```

### 3. Call The Remote CLI Directly

```powershell
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "3GPP" --json
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper read "<note-id-or-url>" --json
```

### 4. Optional Windows Wrapper

Create a local `codimd-helper.cmd` wrapper so agents can call `codimd-helper` directly.

From this repository on the agent machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-agent-wrapper.ps1
```

The wrapper calls:

```powershell
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper %*
```

After installation:

```powershell
codimd-helper search "3GPP" --json
```

## Agent Instructions

Give the agent [SKILL.md](SKILL.md), or include this rule in its instructions:

```text
When working with CodiMD notes, call the remote CodiMD helper over SSH.
Use JSON output.
Search: ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "<query>" --json
Read: ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper read "<note-id-or-url>" --json
Do not connect to PostgreSQL directly from the agent machine.
```

## Common Commands

```bash
codimd-helper search "retrieval augmented generation" --json
codimd-helper search "3GPP" --limit 20 --json
codimd-helper read "http://140.115.52.84:3000/example-note" --json
codimd-helper sync --json
```

## Answer Cache

The answer cache uses PostgreSQL with the `pgvector` extension internally. Agents should not call low-level RAG commands directly. Use the cache-aware `answer` command for normal questions:

```bash
codimd-helper answer "SIB19 是什麼" --json
```

This command scores cached answers first. If the best cached answer score is at or above `RAG_ANSWER_CACHE_HIT_SCORE_THRESHOLD`, it returns the cached answer directly. Otherwise it falls back to database search, synthesizes an answer from matching note summaries, and writes that answer back to `rag_answers`.

Configure the cache scoring behavior:

```env
RAG_EMBEDDING_DIMENSIONS=1536
RAG_ANSWER_SIMILARITY_THRESHOLD=0.9
RAG_ANSWER_CACHE_HIT_SCORE_THRESHOLD=0.85
RAG_CHUNK_MAX_CHARS=1800
RAG_CHUNK_OVERLAP_CHARS=200
```

## Troubleshooting

`Unexpected token '?'`

- The wrapper is using an old Node.js runtime.
- Update `/usr/local/bin/codimd-helper` to load Node.js 20 through `nvm`.

`CODIMD_DB_URL is not configured`

- The server-side `.env` is missing or the wrapper is not running from the project directory.

`could not open extension control file ... vector.control`

- PostgreSQL does not have the `pgvector` extension installed.
- Install pgvector in the same PostgreSQL environment that `CODIMD_DB_URL` points to, then rerun:

- If PostgreSQL runs in Docker, install pgvector inside the database image/container or switch to an image that includes pgvector.
- If PostgreSQL runs on the host, install the package matching the server version, for example `postgresql-16-pgvector` on Debian/Ubuntu systems when PostgreSQL 16 is used.

`getaddrinfo EAI_AGAIN HOST`

- `.env` still contains placeholder values from `.env.example`.
- Replace `HOST`, `USER`, `PASSWORD`, and `DATABASE`.

`Permission denied (publickey,password)`

- SSH login failed before the CLI ran.
- Verify the account, password, SSH key, and `~/.ssh/authorized_keys`.

Repeated password prompts

- Configure SSH key authentication or load the key into `ssh-agent`.
