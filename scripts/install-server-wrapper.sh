#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BIN_PATH="${BIN_PATH:-/usr/local/bin/codimd-helper}"
REMOTE_USER_HOME="${REMOTE_USER_HOME:-$HOME}"
NVM_DIR="${NVM_DIR:-$REMOTE_USER_HOME/.nvm}"

cd "$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not available. Install Node.js 20+ first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required. Current: $(node -v)" >&2
  echo "If using nvm, run: nvm install 20 && nvm use 20" >&2
  exit 1
fi

npm install
npm run build

TMP_WRAPPER="$(mktemp)"
cat > "$TMP_WRAPPER" <<EOF
#!/usr/bin/env bash
export NVM_DIR="$NVM_DIR"

if [ -s "\$NVM_DIR/nvm.sh" ]; then
  . "\$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

cd "$PROJECT_DIR"
exec node dist/index.js "\$@"
EOF

chmod +x "$TMP_WRAPPER"

if [ -w "$(dirname "$BIN_PATH")" ]; then
  mv "$TMP_WRAPPER" "$BIN_PATH"
else
  sudo mv "$TMP_WRAPPER" "$BIN_PATH"
fi

if command -v sudo >/dev/null 2>&1; then
  sudo chmod +x "$BIN_PATH"
else
  chmod +x "$BIN_PATH"
fi

echo "Installed $BIN_PATH"
"$BIN_PATH" --help >/dev/null
echo "Wrapper check passed."
