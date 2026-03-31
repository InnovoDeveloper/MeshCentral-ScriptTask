# InnovoScriptTask — Developer Guide

## Overview

InnovoScriptTask is a forked and enhanced MeshCentral plugin for running scripts (Bash, PowerShell, BAT) on managed devices. Forked from [ryanblenis/MeshCentral-ScriptTask](https://github.com/ryanblenis/MeshCentral-ScriptTask) with significant UI and functionality improvements.

**Repo**: `InnovoDeveloper/MeshCentral-ScriptTask`
**Plugin shortName**: `innovoscripttask`
**MongoDB collection**: `plugin_innovoscripttask` (separate from original `plugin_scripttask`)

## Architecture

```
MeshCentral Server (Node.js)
├── meshcentral-data/plugins/innovoscripttask/
│   ├── config.json              ← Plugin metadata (name, version, URLs)
│   ├── innovoscripttask.js      ← Server-side plugin logic (entry point, must match shortName)
│   ├── scripttask.js            ← Copy of innovoscripttask.js (legacy compat)
│   ├── db.js                    ← Database abstraction (MongoDB / NeDB)
│   ├── nemongo.js               ← NeDB-to-MongoDB adapter
│   ├── modules_meshcore/
│   │   └── innovoscripttask.js  ← Agent-side module (runs on managed devices)
│   ├── views/
│   │   ├── user.handlebars      ← Main plugin UI (script tree, filters, history)
│   │   ├── scriptedit.handlebars← Script editor popup
│   │   ├── schedule.handlebars  ← Job scheduling popup
│   │   └── admin.handlebars     ← Admin panel (unused)
│   └── includes/
│       └── tail.DateTime/       ← Date/time picker library
│
MongoDB Atlas (meshcentral DB)
└── plugin_innovoscripttask collection
    ├── type: "script"     ← Script documents (name, content, category, tags[], description)
    ├── type: "folder"     ← Folder structure
    ├── type: "job"        ← Execution records
    ├── type: "jobSchedule"← Scheduled recurring jobs
    ├── type: "variable"   ← Script variables (#name# substitution)
    ├── type: "meta"       ← Dynamic categories and tags (metaType: "category"|"tag")
    └── type: "db_version" ← Schema version tracking
```

## Key File Naming Convention

**CRITICAL**: MeshCentral requires the main JS file and the meshcore module to match the `shortName` in config.json:
- `config.json` → `"shortName": "innovoscripttask"`
- Main file → `innovoscripttask.js` (not `scripttask.js`)
- Meshcore → `modules_meshcore/innovoscripttask.js`

## What Changed from Original ScriptTask

### Rename (all files)
- `shortName` changed from `scripttask` to `innovoscripttask`
- Separate MongoDB collection `plugin_innovoscripttask`
- Separate NeDB file `plugin-innovoscripttask.db`
- All WebSocket `plugin:` messages use `innovoscripttask`
- All `pluginHandler.` references updated
- Tab shows as "InnovoScriptTask" in MeshCentral UI
- Can run side-by-side with original ScriptTask without conflicts

### Phase 1: Script Organization
- **Description field** on scripts (one-line summary, shown in tree + info card)
- **Category field** on scripts (single primary classifier with color)
- **Tags field** on scripts (array, multiple tags per script)
- **Dynamic categories & tags** stored as `type: "meta"` documents in DB
- **Management UI** accordion to add/delete categories and tags with color picker
- **Search bar** in script tree — filters by name or description
- **Category filter dropdown** — auto-populated from DB
- **Script info card** — shows name, type badge, category, tags, description when selected
- **SVG icons** for folders and scripts (replacing broken emoji rendering)

### Phase 2: Device Selection (Advanced Run)
- **Smart tag parsing** — extracts structured data from MeshCentral ServerTags:
  - `MagicCube*`, `MagicPro`, `MC-*` → Device Type
  - `dp- X.X.X` → DietPi version
  - `ha- X.X.X` → Home Assistant version
  - `p- X` → Patch level
  - `py- X.X.X` → Python version
  - `s- X` → Schema version
  - IP addresses and MAC addresses
- **7 filter dropdowns**: Search, Device Type, DietPi, HA, Patch, Python, Schema
- **4-column layout**: Nodes (with version badges) | Meshes | Device Types | Versions
- **Version checkboxes** — select/deselect all nodes at a specific version
- **Select Visible / Deselect Visible** buttons for bulk operations
- **Live selected count** indicator

### UI Modernization
- **Modern toolbar** with SVG icon buttons (New, Rename, Edit, Delete, Folder, Download, Run)
- **Color-coded category badges** using DB-stored colors
- **Tag chips** displayed inline in script tree
- **Status badges** for job history (Completed=green, Error=red, Running=yellow, Queued=gray)
- **Return value preview** — collapsible with click-to-expand and gradient fade
- **Accordion chevrons** with rotation animation
- **CSS variables** for full dark/night mode theming
- **System font stack** replacing Trebuchet MS

### Safety
- **Run confirmation** — "Run scriptName on deviceName?" dialog before execution
- **Delete confirmation** — shows item name, warns about folder contents
- **Auto-open history** — Node History and Script History panels expand after confirming Run

### Bug Fixes (inherited from earlier patches)
- Orphaned job null-check (scripttask.js line 72)
- Dark mode CSS + parent night mode detection
- Modern theme setDialogMode → showModal compatibility

## Database Schema

### Script Document
```json
{
  "_id": "ObjectId",
  "type": "script",
  "name": "fix_aura_v2_token",
  "path": "Shared/Aura_V2",
  "content": "#!/bin/bash\n...",
  "contentHash": "sha384hex",
  "filetype": "bash",
  "description": "Repair missing or invalid apiToken in registration.json",
  "category": "V2",
  "tags": ["home-assistant", "mesh-agent", "token", "ssl", "api"]
}
```

### Meta Document (Category)
```json
{
  "_id": "ObjectId",
  "type": "meta",
  "metaType": "category",
  "name": "V2",
  "color": "#10b981"
}
```

### Meta Document (Tag)
```json
{
  "_id": "ObjectId",
  "type": "meta",
  "metaType": "tag",
  "name": "home-assistant",
  "color": ""
}
```

## Server Deployment

### Location
- **Server**: AWS EC2 at `54.190.77.20` (magicube.cloud)
- **SSH**: `ssh -i "C:\Users\Dev\Documents\MeshCentral.pem" ubuntu@54.190.77.20`
- **Plugin path**: `/home/ubuntu/meshcentral-data/plugins/innovoscripttask/`
- **MeshCentral version**: 1.1.58

### Installation (via MeshCentral Plugin Manager)
1. Go to **My Server → Plugins**
2. Click **Download plugin**
3. Paste: `https://raw.githubusercontent.com/InnovoDeveloper/MeshCentral-ScriptTask/master/config.json`
4. Enable the plugin
5. Restart MeshCentral

### Manual Update (deploy from local)
```bash
# Upload changed files
scp -i MeshCentral.pem views/user.handlebars ubuntu@54.190.77.20:/home/ubuntu/meshcentral-data/plugins/innovoscripttask/views/
scp -i MeshCentral.pem innovoscripttask.js ubuntu@54.190.77.20:/home/ubuntu/meshcentral-data/plugins/innovoscripttask/
scp -i MeshCentral.pem db.js ubuntu@54.190.77.20:/home/ubuntu/meshcentral-data/plugins/innovoscripttask/

# Restart (required for JS/template changes)
ssh -i MeshCentral.pem ubuntu@54.190.77.20 "sudo systemctl restart meshcentral"
```

### Data Privacy
- **Public**: Plugin source code (GitHub repo) — generic framework, no secrets
- **Private**: Script content, job history, device data — all in MongoDB Atlas, never in repo
- **Private**: Migration/seeding scripts — ran ad-hoc on server in `/tmp/`, not committed
- **Private**: MeshCentral config (MongoDB URI, SMTP creds) — on server only

## Development Workflow

1. Edit files locally in `v:\VS\MC-Workspaces\InnovoScriptTask\`
2. Test changes: commit → push → scp to server → restart MeshCentral → hard refresh browser
3. **Important**: After editing `innovoscripttask.js`, also copy to `scripttask.js` (legacy compat)
4. MongoDB queries for debugging:
   ```bash
   ssh ubuntu@54.190.77.20 'cd /home/ubuntu && NODE_PATH=node_modules node -e "..."'
   ```

## Default Categories (seeded on first run)
| Category | Color | Use for |
|----------|-------|---------|
| V1 | #3b82f6 (blue) | MagicCube V4/V5 scripts |
| V2 | #10b981 (green) | Aura V2 / Ethereon scripts |
| Aura | #8b5cf6 (purple) | Aura-specific (non-V2) |
| KNX | #f59e0b (amber) | KNX server scripts |
| Maintenance | #6b7280 (gray) | Fixes, cleanup, restarts |
| Diagnostics | #06b6d4 (cyan) | Debug, check, test scripts |
| Patching | #ef4444 (red) | OS updates, installs, patches |

## Default Tags (19 seeded)
home-assistant, mesh-agent, networking, bluetooth, dietpi, pm2, disk-cleanup, reboot, knx-server, token, ssl, vnc, zwave, hacs, locale, oem, api, nginx, crontab

## Planned Improvements

### Phase 3: Job Visibility (not yet implemented)
- Batch job results view (one table for all devices)
- Success/fail summary count
- Output preview in results table

### Other Ideas
- Save device groups for reuse (named selections)
- Script archiving (hide without delete)
- Script version history
- Bulk tag editing
