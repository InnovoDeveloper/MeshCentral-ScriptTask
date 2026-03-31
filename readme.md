# InnovoScriptTask

An enhanced script management plugin for [MeshCentral](https://github.com/Ylianst/MeshCentral). Forked from [ryanblenis/MeshCentral-ScriptTask](https://github.com/ryanblenis/MeshCentral-ScriptTask) with significant UI and functionality improvements.

Supports PowerShell, BAT, and Bash scripts on Windows, macOS, and Linux endpoints.

## Installation

Ensure plugins are enabled in your MeshCentral config:
```json
"plugins": { "enabled": true }
```

Then in MeshCentral: **My Server > Plugins > Download plugin** and paste:
```
https://raw.githubusercontent.com/InnovoDeveloper/MeshCentral-ScriptTask/master/config.json
```

Enable the plugin and restart MeshCentral.

**Note:** This plugin uses `shortName: innovoscripttask` and a separate database collection, so it runs side-by-side with the original ScriptTask without conflicts.

## Features

### Script Organization
- **Descriptions** on scripts (one-line summary shown in tree and info card)
- **Dynamic categories** with custom colors (managed from UI, not hardcoded)
- **Multi-tag support** — each script can have multiple tags
- **Category & tag management UI** — add, rename (cascades to all scripts), delete
- **Search & filter** — filter script tree by name, description, or category
- **SVG icons** for folders and scripts
- **Script info card** — shows metadata when a script is selected

### Advanced Device Selection
- **Status filter pills**: All / Online / Offline / Tagged / Untagged — with live counts
- **Online/offline indicators** (green/red dot per device)
- **Smart tag parsing** — auto-discovers key-value pairs from device ServerTags
- **Dynamic version filter dropdowns** — auto-populated per discovered tag prefix
- **Device type filtering** — auto-populated from device labels
- **Hover tooltips** — rich device detail card on mouse hover
- **Sortable node list** (by name, type, or selection state — preserves checkboxes)
- **Resizable columns**
- **Select/Deselect Visible** for bulk operations on filtered results

### Modern UI
- Toolbar with SVG icon buttons
- Color-coded category badges and tag chips
- Status badges for job history (Completed, Error, Running, Queued)
- Enhanced queued status shows "device offline" when target is disconnected
- Collapsible return value preview
- Full dark mode / night mode support via CSS variables
- System font stack

### Safety
- Run confirmation dialog (shows script name and target device)
- Delete confirmation with folder content warning
- Auto-open history panels after confirming a run

### Inherited Features
- Script scheduling (one-time, minutes, hourly, daily, weekly)
- Variable substitution (`#varName#`) with scope hierarchy (Global > Script > Mesh > Node)
- Script caching on agents with hash verification
- Job history (200 events per node/script, 90-day retention)
- Drag-and-drop file upload and script organization

## Bug Fixes (from original)
- Orphaned job crash fix (null-check for deleted scripts)
- Dark mode / night mode CSS support
- Modern theme (`default3.handlebars`) dialog compatibility

## File Naming

MeshCentral requires the main plugin JS file and the meshcore module to match the `shortName`:
- `innovoscripttask.js` — server-side entry point
- `modules_meshcore/innovoscripttask.js` — agent-side module

## License

Apache-2.0 (inherited from original)
