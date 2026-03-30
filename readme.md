# MeshCentral-ScriptTask

A script running plugin for the [MeshCentral2](https://github.com/Ylianst/MeshCentral) Project. The plugin supports PowerShell, BAT, and Bash scripts. Windows, MacOS, and Linux endpoints are all supported. PowerShell can be run on any OS that has PowerShell installed, not just Windows.

## Important Note
**This plugin now supports NeDB and MongoDB**

## Installation

 Pre-requisite: First, make sure you have plugins enabled for your MeshCentral installation:
>     "plugins": {
>          "enabled": true
>     },
Restart your MeshCentral server after making this change.

 To install, simply add the plugin configuration URL when prompted:
 `https://raw.githubusercontent.com/ryanblenis/MeshCentral-ScriptTask/master/config.json`

## Features
- Add scripts to a central store
- Run scripts on single or multiple endpoints simultaneously
-- Supports PowerShell, BAT, and Bash scripts
- Review the return status / value of completed scripts
-- Returns text or parses returned JSON for easy viewing
- Schedule scripts for future runs on either a one-time or interval basis (minutes, hourly, daily, weekly)
- View schedules and histories based on either node (endpoint) or script
- Dead job detection with script replay

## Usage Notes
- *Run* schedules and runs the job instantly.
- *Schedule* puts the events into a queue.
- Queues are checked / run every minute.
- Scheduled jobs only show the *next* scheduled job at any given time.
- History is limited to 200 events per node/script in the viewport.
- Historical events that have completed will delete after 90 days.
- Jobs only run when the endpoint agent is online. They do *not* queue to the agent when offline, then run at the specified time.
- Scripts are cached on the clients and verified via hash at runtime for the latest version.

## Variables
- Variables can be assigned to the following scopes: Global, Script, Mesh, and Node
- Variables with the same name will override each other in the above order (ex. Global variable testVariable will be overridden by Script variable testVariable will be overridden by Mesh variable Test will be overridden by Node variable testVariable if they exist and apply to the node running the script)
- Variables found in a script which do not correspond with a defined variable will be replaced with VAR_NOT_FOUND
- Variables are assigned during job dispatch (e.g. when the job is sent to the node), so the latest script and variable values will be accounted for, should they have changed since a job or scheduled job were defined.
- Variables in scripts must be defined by hashtags on both sides and not contain spaces. (E.g. #myVar#)

## Getting Started
Drag and drop some of your favorite admin scripts on the file tree. You'll then be able to run them immediately on endpoints (nodes).

## Upcoming Features
- Take action on the results of a script
- Variable replacement

## Other Information
This is fairly new and in beta. Testing was mostly done in the latest Chrome and Firefox. No attempt was made to be compatible with older IE browsers. Endpoint testing was done on Windows 10 (1903) and OS X 10.13.

## Screenshots
![Device Page](https://user-images.githubusercontent.com/1929277/71248033-f4519b00-22e7-11ea-9aa6-ef22e0b9fdb2.png)
![Script Editor](https://user-images.githubusercontent.com/1929277/71248034-f4519b00-22e7-11ea-8ab4-ccad3e959a1a.png)
![Schedule Screen](https://user-images.githubusercontent.com/1929277/71248469-e7817700-22e8-11ea-9121-a215de160e0e.png)


---

## Innovo Fork Changes

This fork ([InnovoDeveloper/MeshCentral-ScriptTask](https://github.com/InnovoDeveloper/MeshCentral-ScriptTask)) adds the following fixes:

### 1. Orphaned Job Crash Fix
Scripts deleted while scheduled jobs still reference them caused a crash:
`TypeError: Cannot read properties of undefined (reading 'content')`

Now skips orphaned jobs with a log message instead of crashing.

### 2. Dark Mode / Night Mode Support
The plugin iframe now respects MeshCentral's night mode and OS-level dark mode. Previously, dark mode reversed the background but left text colors unchanged, making content invisible.

### 3. MeshCentral Modern Theme (siteStyle: 2) Compatibility

The modern theme (`default3.handlebars`) uses Bootstrap modals instead of the plain dialog div. The `setDialogMode()` function populates the modal content but never calls `showModal()` to display it, causing New, Rename, Delete, and New Folder buttons to silently fail.

**To fix this**, apply the following one-line patch to your MeshCentral installation's `default3.handlebars`:

Find this line in `node_modules/meshcentral/views/default3.handlebars`:
```javascript
if (x == 0) { if (xxModal) xxModal.hide(); }
```

Replace with:
```javascript
if (x == 0) { if (xxModal) xxModal.hide(); } else if (x > 0) { showModal('xxAddAgentModal', 'idx_dlgOkButton', function() { dialogclose(1); }); }
```

**Note:** This patch is in the MeshCentral core, not the plugin, so it will be overwritten by MeshCentral updates. Re-apply after upgrading MeshCentral until the fix is merged upstream.
