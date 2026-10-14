#!/usr/bin/env bash
# Git Bash cannot see the winget Node install; this resolves it. Usage: source scripts/node.sh
NODE_DIR="$(dirname "$(ls -d /c/Users/Isaac/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_*/node-v*/node.exe | head -1)")"
export PATH="$NODE_DIR:$PATH"
jest() { node "$(pwd)/node_modules/jest/bin/jest.js" "$@"; }
