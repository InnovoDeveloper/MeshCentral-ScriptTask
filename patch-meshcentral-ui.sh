#!/bin/bash
# patch-meshcentral-ui.sh
# Re-applies UI customizations to MeshCentral after an upgrade.
# Run after: npm install meshcentral / MeshCentral auto-update
#
# Changes:
#   1. default3.handlebars — Tags column: width:120px → min-width:200px
#   2. default3.handlebars — table-layout: fixed → auto (fluid columns)
#   3. style-bootstrap.css — tagSpan: better padding, inline-block, font-size
#
# Safe to run multiple times (idempotent).
# Usage: MC_DIR=/path/to/meshcentral bash patch-meshcentral-ui.sh

set -euo pipefail

# Auto-detect MeshCentral install directory
if [ -z "${MC_DIR:-}" ]; then
    # Try common locations
    for dir in \
        "$(dirname "$(which meshcentral 2>/dev/null || true)")/node_modules/meshcentral" \
        "$HOME/node_modules/meshcentral" \
        "/opt/meshcentral/node_modules/meshcentral" \
        "/usr/local/lib/node_modules/meshcentral"; do
        if [ -d "$dir/views" ]; then MC_DIR="$dir"; break; fi
    done
fi

if [ -z "${MC_DIR:-}" ] || [ ! -d "$MC_DIR/views" ]; then
    echo "ERROR: MeshCentral directory not found. Set MC_DIR=/path/to/meshcentral"
    exit 1
fi

D3="$MC_DIR/views/default3.handlebars"
CSS="$MC_DIR/public/styles/style-bootstrap.css"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [patch-ui] $1"; }

log "MeshCentral directory: $MC_DIR"

# ── Patch 1: Tags column width (120px → min-width:200px) ──
if grep -q "width:120px.*Tags" "$D3" 2>/dev/null; then
    sed -i "s|<th style=width:120px>' + \"Tags\"|<th style=min-width:200px>' + \"Tags\"|" "$D3"
    log "Patched: Tags column width -> min-width:200px"
else
    log "Skip: Tags column already patched or not found"
fi

# ── Patch 2: table-layout fixed → auto ──
if grep -q "table-layout:fixed" "$D3" 2>/dev/null; then
    sed -i "s|table-layout:fixed|table-layout:auto|" "$D3"
    log "Patched: table-layout -> auto"
else
    log "Skip: table-layout already auto or not found"
fi

# ── Patch 3: tagSpan CSS ──
if grep -q "^\.tagSpan {" "$CSS" 2>/dev/null && ! grep -A1 "\.tagSpan {" "$CSS" | grep -q "inline-block"; then
    python3 -c "
import sys
css_path = '$CSS'
with open(css_path, 'r') as f: css = f.read()
old = '.tagSpan {\n    background-color: lightgray;\n    padding: 3px;\n    border-radius: 5px;\n}'
new = '.tagSpan {\n    display: inline-block;\n    background-color: lightgray;\n    padding: 2px 6px;\n    border-radius: 5px;\n    margin: 1px 2px;\n    font-size: 11px;\n    line-height: 18px;\n    white-space: nowrap;\n}'
if old in css:
    css = css.replace(old, new)
    with open(css_path, 'w') as f: f.write(css)
    print('Patched: tagSpan CSS')
else:
    print('Skip: tagSpan CSS pattern not found (may have changed)')
"
else
    log "Skip: tagSpan CSS already patched or not found"
fi

log "MeshCentral UI patch complete"
echo "Done. Restart MeshCentral to apply changes."
