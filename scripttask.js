/**
* @description MeshCentral InnovoScriptTask
* @author Innovo (forked from Ryan Blenis)
* @copyright
* @license Apache-2.0
*/

"use strict";

module.exports.innovoscripttask = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.db = null;
    obj.intervalTimer = null;
    obj.debug = obj.meshServer.debug;
    obj.VIEWS = __dirname + '/views/';
    obj.exports = [
        'onDeviceRefreshEnd',
        'resizeContent',
        'historyData',
        'variableData',
        'metaData',
        'batchProgress',
        'batchRunList',
        'malix_triggerOption'
    ];
    
    obj.malix_triggerOption = function(selectElem) {
        selectElem.options.add(new Option("InnovoScriptTask - Run Script", "innovoscripttask_runscript"));
    }
    obj.malix_triggerFields_innovoscripttask_runscript = function() {
        
    }
    obj.resetQueueTimer = function() {
        clearTimeout(obj.intervalTimer);
        obj.intervalTimer = setInterval(obj.queueRun, 1 * 60 * 1000); // every minute
    };
    
    obj.server_startup = function() {
        obj.meshServer.pluginHandler.innovoscripttask_db = require (__dirname + '/db.js').CreateDB(obj.meshServer);
        obj.db = obj.meshServer.pluginHandler.innovoscripttask_db;
        obj.resetQueueTimer();
        // Delay batch manager init to let DB connect first
        setTimeout(function() { obj.initBatchManager(); }, 5000);
    };
    
    obj.onDeviceRefreshEnd = function() {
        pluginHandler.registerPluginTab({
            tabTitle: 'InnovoScriptTask',
            tabId: 'pluginInnovoScriptTask'
        });
        QA('pluginInnovoScriptTask', '<iframe id="pluginIframeInnovoScriptTask" style="width: 100%; height: 700px; overflow: auto" scrolling="yes" frameBorder=0 src="/pluginadmin.ashx?pin=innovoscripttask&user=1" />');
    };
    // may not be needed, saving for later. Can be called to resize iFrame
    obj.resizeContent = function() {
        var iFrame = document.getElementById('pluginIframeInnovoScriptTask');
        var newHeight = 700;
        //var sHeight = iFrame.contentWindow.document.body.scrollHeight;
        //if (sHeight > newHeight) newHeight = sHeight;
        //if (newHeight > 1600) newHeight = 1600;
        iFrame.style.height = newHeight + 'px';
    };
    
    obj.queueRun = async function() {
        var onlineAgents = Object.keys(obj.meshServer.webserver.wsagents);
        //obj.debug('ScriptTask', 'Queue Running', Date().toLocaleString(), 'Online agents: ', onlineAgents);

        obj.db.getPendingJobs(onlineAgents)
        .then((jobs) => {
            if (jobs.length == 0) return;
            //@TODO check for a large number and use taskLimiter to queue the jobs
            jobs.forEach(job => {
                obj.db.get(job.scriptId)
                .then(async (script) => {
                    script = script[0];
                    if (!script || !script.content) { console.log("PLUGIN: InnovoScriptTask: Skipping job " + job._id + " — script not found (scriptId: " + job.scriptId + ")"); return; }
                    var foundVars = script.content.match(/#(.*?)#/g);
                    var replaceVars = {};
                    if (foundVars != null && foundVars.length > 0) {
                        var foundVarNames = [];
                        foundVars.forEach(fv => {
                            foundVarNames.push(fv.replace(/^#+|#+$/g, ''));
                        });
                        
                        var limiters = { 
                            scriptId: job.scriptId,
                            nodeId: job.node,
                            meshId: obj.meshServer.webserver.wsagents[job.node]['dbMeshKey'],
                            names: foundVarNames
                        };
                        var finvals = await obj.db.getVariables(limiters);
                        var ordering = { 'global': 0, 'script': 1, 'mesh': 2, 'node': 3 }
                        finvals.sort((a, b) => {
                            return (ordering[a.scope] - ordering[b.scope])
                              || a.name.localeCompare(b.name);
                        });
                        finvals.forEach(fv => {
                            replaceVars[fv.name] = fv.value;
                        });
                        replaceVars['GBL:meshId'] = obj.meshServer.webserver.wsagents[job.node]['dbMeshKey'];
                        replaceVars['GBL:nodeId'] = job.node;
                        //console.log('FV IS', finvals);
                        //console.log('RV IS', replaceVars);
                    }
                    var dispatchTime = Math.floor(new Date() / 1000);
                    var jObj = { 
                        action: 'plugin', 
                        plugin: 'innovoscripttask', 
                        pluginaction: 'triggerJob',
                        jobId: job._id,
                        scriptId: job.scriptId,
                        replaceVars: replaceVars,
                        scriptHash: script.contentHash,
                        dispatchTime: dispatchTime
                    };
                    //obj.debug('ScriptTask', 'Sending job to agent');
                    try { 
                        obj.meshServer.webserver.wsagents[job.node].send(JSON.stringify(jObj));
                        obj.db.update(job._id, { dispatchTime: dispatchTime });
                    } catch (e) { }
                })
                .catch(e => console.log('PLUGIN: InnovoScriptTask: Could not dispatch job.', e));
            });
        })
        .then(() => {
            obj.makeJobsFromSchedules();
            obj.cleanHistory();
        })
        .catch(e => { console.log('PLUGIN: InnovoScriptTask: Queue Run Error: ', e); });
    };
    
    obj.cleanHistory = function() {
        if (Math.round(Math.random() * 100) == 99) {
            obj.db.deleteOldHistory();
        }
    };

    // ========================================================================
    // BATCH DEPLOYMENT MANAGER
    // ========================================================================
    obj.batchTimer = null;

    obj.initBatchManager = function() {
        // Tick every 10 seconds to check active batch runs
        obj.batchTimer = setInterval(obj.batchTick, 10 * 1000);
        // Recover active batches after server restart
        obj.db.getActiveBatchRuns()
        .then(function(runs) {
            if (runs.length > 0) {
                console.log('PLUGIN: InnovoScriptTask: Recovering ' + runs.length + ' active batch run(s)');
                var now = Math.floor(Date.now() / 1000);
                runs.forEach(function(run) {
                    // If nextBatchAt is past due, schedule it for 10s from now
                    if (run.nextBatchAt && run.nextBatchAt < now) {
                        obj.db.updateBatchRun(run._id, { nextBatchAt: now + 10 });
                    }
                });
            }
        })
        .catch(function(e) { console.log('PLUGIN: InnovoScriptTask: Batch recovery error:', e); });
    };

    obj.batchTick = function() {
        var now = Math.floor(Date.now() / 1000);
        obj.db.getActiveBatchRuns()
        .then(function(runs) {
            runs.forEach(function(run) {
                // Check if it's time for the next batch
                if (run.nextBatchAt && run.nextBatchAt <= now) {
                    if (run.currentBatchIndex >= run.totalBatches) {
                        // All batches dispatched — check if all nodes are done
                        var stillRunning = run.nodes.filter(function(n) { return n.status === 'dispatched' || n.status === 'queued'; });
                        if (stillRunning.length === 0) {
                            obj.completeBatchRun(run);
                        }
                        return;
                    }
                    obj.dispatchBatch(run);
                }
                // Check for stale dispatched nodes (dispatched > 10 min ago, no completion)
                var staleThreshold = now - 600;
                var staleFound = false;
                run.nodes.forEach(function(n) {
                    if (n.status === 'dispatched' && n.dispatchTime && n.dispatchTime < staleThreshold) {
                        n.status = 'error';
                        n.errorVal = 'Timeout: no response from agent';
                        staleFound = true;
                    }
                });
                if (staleFound) {
                    obj.recalcBatchCounts(run);
                    obj.db.updateBatchRun(run._id, { nodes: run.nodes, counts: run.counts });
                    obj.sendBatchProgress(run);
                }
            });
        })
        .catch(function(e) { console.log('PLUGIN: InnovoScriptTask: Batch tick error:', e); });
    };

    obj.dispatchBatch = function(run) {
        var batchIndex = run.currentBatchIndex;
        var nodesInBatch = run.nodes.filter(function(n) { return n.batchIndex === batchIndex; });
        var onlineAgents = Object.keys(obj.meshServer.webserver.wsagents);
        var now = Math.floor(Date.now() / 1000);
        var delay = 0;
        var staggerMs = (run.staggerSec || 2) * 1000;

        console.log('PLUGIN: InnovoScriptTask: Batch ' + (batchIndex + 1) + '/' + run.totalBatches + ' — dispatching ' + nodesInBatch.length + ' nodes (stagger: ' + run.staggerSec + 's)');

        // Get the script first
        obj.db.get(run.scriptId)
        .then(function(scripts) {
            var script = scripts[0];
            if (!script || !script.content) {
                console.log('PLUGIN: InnovoScriptTask: Batch run script not found: ' + run.scriptId);
                obj.db.updateBatchRun(run._id, { status: 'error' });
                return;
            }

            nodesInBatch.forEach(function(nodeEntry) {
                // Check if device is online
                if (onlineAgents.indexOf(nodeEntry.nodeId) === -1) {
                    // Offline handling
                    if (run.offlinePolicy === 'defer' && batchIndex < run.totalBatches - 1) {
                        nodeEntry.batchIndex = batchIndex + 1; // Move to next batch
                        nodeEntry.deferCount = (nodeEntry.deferCount || 0) + 1;
                        if (nodeEntry.deferCount >= 3) {
                            nodeEntry.status = 'skipped';
                            nodeEntry.errorVal = 'Offline after 3 defer attempts';
                        }
                    } else {
                        nodeEntry.status = 'skipped';
                        nodeEntry.errorVal = 'Device offline at dispatch time';
                    }
                    return;
                }

                // Schedule staggered dispatch
                (function(ne, delayMs) {
                    setTimeout(function() {
                        var dispatchTime = Math.floor(Date.now() / 1000);
                        // Create the job
                        obj.db.addJob({
                            scriptId: run.scriptId,
                            scriptName: run.scriptName,
                            node: ne.nodeId,
                            runBy: run.createdBy,
                            batchRunId: run._id,
                            dispatchTime: dispatchTime // Set immediately so queueRun skips it
                        })
                        .then(function(result) {
                            var jobId = result.insertedId || (result.ops && result.ops[0] && result.ops[0]._id);
                            ne.jobId = jobId;
                            ne.status = 'dispatched';
                            ne.dispatchTime = dispatchTime;

                            // Dispatch to agent
                            try {
                                var jObj = {
                                    action: 'plugin',
                                    plugin: 'innovoscripttask',
                                    pluginaction: 'triggerJob',
                                    jobId: jobId,
                                    scriptId: run.scriptId,
                                    replaceVars: {},
                                    scriptHash: script.contentHash,
                                    dispatchTime: dispatchTime
                                };
                                obj.meshServer.webserver.wsagents[ne.nodeId].send(JSON.stringify(jObj));
                            } catch (e) {
                                ne.status = 'error';
                                ne.errorVal = 'Dispatch failed: ' + e.message;
                            }

                            // Update batch run in DB
                            obj.recalcBatchCounts(run);
                            obj.db.updateBatchRun(run._id, { nodes: run.nodes, counts: run.counts });
                        })
                        .catch(function(e) {
                            ne.status = 'error';
                            ne.errorVal = 'Job creation failed: ' + e.message;
                        });
                    }, delayMs);
                })(nodeEntry, delay);

                delay += staggerMs;
            });

            // Update batch run state
            var nextBatchAt = now + run.batchIntervalSec;
            obj.db.updateBatchRun(run._id, {
                currentBatchIndex: batchIndex + 1,
                lastBatchStartedAt: now,
                nextBatchAt: nextBatchAt,
                nodes: run.nodes
            });

            // Send progress after stagger completes
            setTimeout(function() {
                obj.recalcBatchCounts(run);
                obj.db.updateBatchRun(run._id, { counts: run.counts, nodes: run.nodes });
                obj.sendBatchProgress(run);
            }, delay + 1000);
        })
        .catch(function(e) { console.log('PLUGIN: InnovoScriptTask: Batch dispatch error:', e); });
    };

    obj.onBatchJobComplete = function(jobId, batchRunId, retVal, errVal) {
        obj.db.getBatchRun(batchRunId)
        .then(function(runs) {
            if (runs.length === 0) return;
            var run = runs[0];
            var now = Math.floor(Date.now() / 1000);
            // Find the node entry and update it
            for (var i = 0; i < run.nodes.length; i++) {
                var jobIdStr = (run.nodes[i].jobId || '').toString();
                var matchId = (jobId || '').toString();
                if (jobIdStr === matchId) {
                    run.nodes[i].status = errVal ? 'error' : 'completed';
                    run.nodes[i].completeTime = now;
                    run.nodes[i].returnVal = retVal ? (retVal.length > 500 ? retVal.substring(0, 497) + '...' : retVal) : null;
                    run.nodes[i].errorVal = errVal || null;
                    break;
                }
            }
            obj.recalcBatchCounts(run);
            obj.db.updateBatchRun(run._id, { nodes: run.nodes, counts: run.counts });
            obj.sendBatchProgress(run);

            // Check if all batches dispatched and all nodes done
            if (run.currentBatchIndex >= run.totalBatches) {
                var stillRunning = run.nodes.filter(function(n) { return n.status === 'dispatched' || n.status === 'queued'; });
                if (stillRunning.length === 0) {
                    obj.completeBatchRun(run);
                }
            }
        })
        .catch(function(e) { console.log('PLUGIN: InnovoScriptTask: Batch job complete error:', e); });
    };

    obj.completeBatchRun = function(run) {
        var now = Math.floor(Date.now() / 1000);
        obj.recalcBatchCounts(run);
        run.status = 'completed';
        run.completedAt = now;
        obj.db.updateBatchRun(run._id, { status: 'completed', completedAt: now, counts: run.counts, nodes: run.nodes });
        obj.sendBatchProgress(run);
        console.log('PLUGIN: InnovoScriptTask: Batch run completed — ' + run.counts.completed + ' ok, ' + run.counts.errored + ' failed, ' + run.counts.skipped + ' skipped');
    };

    obj.recalcBatchCounts = function(run) {
        var c = { total: run.nodes.length, pending: 0, queued: 0, dispatched: 0, completed: 0, errored: 0, skipped: 0 };
        run.nodes.forEach(function(n) {
            if (n.status === 'pending') c.pending++;
            else if (n.status === 'queued') c.queued++;
            else if (n.status === 'dispatched') c.dispatched++;
            else if (n.status === 'completed') c.completed++;
            else if (n.status === 'error') c.errored++;
            else if (n.status === 'skipped') c.skipped++;
        });
        run.counts = c;
    };

    obj.sendBatchProgress = function(run) {
        var targets = ['*', 'server-users'];
        obj.meshServer.DispatchEvent(targets, obj, {
            nolog: true, action: 'plugin', plugin: 'innovoscripttask',
            pluginaction: 'batchProgress', batchRun: run
        });
    };

    obj.startBatchRun = function(command, user) {
        var nodeIds = command.nodes;
        var batchSize = Math.max(1, parseInt(command.batchSize) || 25);
        var batchIntervalSec = Math.max(30, parseInt(command.batchIntervalSec) || 300);
        var staggerSec = Math.max(1, parseInt(command.staggerSec) || 2);
        var offlinePolicy = command.offlinePolicy || 'skip';
        var now = Math.floor(Date.now() / 1000);

        // Check max concurrent batch runs
        obj.db.getActiveBatchRuns()
        .then(function(active) {
            if (active.length >= 2) {
                console.log('PLUGIN: InnovoScriptTask: Cannot start batch — 2 already active');
                return;
            }

            // Build node entries and assign batch indices
            var nodes = [];
            for (var i = 0; i < nodeIds.length; i++) {
                var batchIdx = Math.floor(i / batchSize);
                // Resolve device name from live data
                var nodeName = nodeIds[i];
                try {
                    var agent = obj.meshServer.webserver.wsagents[nodeIds[i]];
                    if (agent && agent.dbNodeKey) {
                        // Try to get name from meshserver nodes
                    }
                } catch(e) {}
                nodes.push({
                    nodeId: nodeIds[i],
                    nodeName: command.nodeNames ? (command.nodeNames[i] || nodeIds[i]) : nodeIds[i],
                    status: 'pending',
                    batchIndex: batchIdx,
                    jobId: null,
                    errorVal: null,
                    returnVal: null,
                    dispatchTime: null,
                    completeTime: null,
                    deferCount: 0
                });
            }

            var totalBatches = Math.ceil(nodeIds.length / batchSize);

            var batchRun = {
                scriptId: command.scriptId,
                scriptName: command.scriptName || '',
                createdBy: user,
                createdAt: now,
                batchSize: batchSize,
                batchIntervalSec: batchIntervalSec,
                staggerSec: staggerSec,
                offlinePolicy: offlinePolicy,
                status: 'active',
                currentBatchIndex: 0,
                totalBatches: totalBatches,
                nodes: nodes,
                counts: { total: nodes.length, pending: nodes.length, queued: 0, dispatched: 0, completed: 0, errored: 0, skipped: 0 },
                lastBatchStartedAt: null,
                nextBatchAt: now, // Start first batch immediately
                completedAt: null
            };

            return obj.db.addBatchRun(batchRun)
            .then(function() {
                console.log('PLUGIN: InnovoScriptTask: Batch run started — ' + nodes.length + ' nodes, ' + totalBatches + ' batches of ' + batchSize + ', interval ' + batchIntervalSec + 's, stagger ' + staggerSec + 's');
                obj.sendBatchProgress(batchRun);
            });
        })
        .catch(function(e) { console.log('PLUGIN: InnovoScriptTask: Start batch error:', e); });
    };
    // ========================================================================

    obj.downloadFile = function(req, res, user) {
        var id = req.query.dl;
        obj.db.get(id)
        .then(found => {
          if (found.length != 1) { res.sendStatus(401); return; }
          var file = found[0];
          res.setHeader('Content-disposition', 'attachment; filename=' + file.name);
          res.setHeader('Content-type', 'text/plain');
          //var fs = require('fs');
          res.send(file.content);
        });
    };
    
    obj.updateFrontEnd = async function(ids){
        if (ids.scriptId != null) {
            var scriptHistory = null;
            obj.db.getJobScriptHistory(ids.scriptId)
            .then((sh) => {
                scriptHistory = sh;
                return obj.db.getJobSchedulesForScript(ids.scriptId);
            })
            .then((scriptSchedule) => {
                var targets = ['*', 'server-users'];
                obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'innovoscripttask', pluginaction: 'historyData', scriptId: ids.scriptId, nodeId: null, scriptHistory: scriptHistory, nodeHistory: null, scriptSchedule: scriptSchedule });
            });
        }
        if (ids.nodeId != null) {
            var nodeHistory = null;
            obj.db.getJobNodeHistory(ids.nodeId)
            .then((nh) => {
                nodeHistory = nh;
                return obj.db.getJobSchedulesForNode(ids.nodeId);
            })
            .then((nodeSchedule) => {
                var targets = ['*', 'server-users'];
                obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'innovoscripttask', pluginaction: 'historyData', scriptId: null, nodeId: ids.nodeId, scriptHistory: null, nodeHistory: nodeHistory, nodeSchedule: nodeSchedule });
            });
        }
        if (ids.tree === true) {
            obj.db.getScriptTree()
            .then((tree) => {
                var targets = ['*', 'server-users'];
                obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'innovoscripttask', pluginaction: 'newScriptTree', tree: tree });
            });
        }
        if (ids.variables === true) {
            obj.db.getVariables()
            .then((vars) => {
                var targets = ['*', 'server-users'];
                obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'innovoscripttask', pluginaction: 'variableData', vars: vars });
            });
        }
        if (ids.meta === true) {
            Promise.all([obj.db.getMetaList('category'), obj.db.getMetaList('tag')])
            .then(([categories, tags]) => {
                var targets = ['*', 'server-users'];
                obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'innovoscripttask', pluginaction: 'metaData', categories: categories, tags: tags });
            });
        }
    };
    
    obj.handleAdminReq = function(req, res, user) {
        if ((user.siteadmin & 0xFFFFFFFF) == 1 && req.query.admin == 1) 
        {
            // admin wants admin, grant
            var vars = {};
            res.render(obj.VIEWS + 'admin', vars);
            return;
        } else if (req.query.admin == 1 && (user.siteadmin & 0xFFFFFFFF) == 0) {
            // regular user wants admin
            res.sendStatus(401); 
            return;
        } else if (req.query.user == 1) { 
            // regular user wants regular access, grant
            if (req.query.dl != null) return obj.downloadFile(req, res, user);
            var vars = {};
            
            if (req.query.edit == 1) { // edit script
                if (req.query.id == null) return res.sendStatus(401); 
                obj.db.get(req.query.id)
                .then((scripts) => {
                    if (scripts[0].filetype == 'proc') {
                        vars.procData = JSON.stringify(scripts[0]);
                        res.render(obj.VIEWS + 'procedit', vars);
                    } else {
                        vars.scriptData = JSON.stringify(scripts[0]);
                        res.render(obj.VIEWS + 'scriptedit', vars);
                    }
                });
                return;
            } else if (req.query.schedule == 1) {
                var vars = {};
                res.render(obj.VIEWS + 'schedule', vars);
                return;
            }
            // default user view (tree)
            vars.scriptTree = 'null';
            obj.db.getScriptTree()
            .then(tree => {
              vars.scriptTree = JSON.stringify(tree);
              res.render(obj.VIEWS + 'user', vars);
            });
            return;
        } else if (req.query.include == 1) {
            switch (req.query.path.split('/').pop().split('.').pop()) {
                case 'css':     res.contentType('text/css'); break;
                case 'js':      res.contentType('text/javascript'); break;
            }
            res.sendFile(__dirname + '/includes/' + req.query.path); // don't freak out. Express covers any path issues.
            return;
        }
        res.sendStatus(401); 
        return;
    };
    
    obj.historyData = function (message) {
        if (typeof pluginHandler.innovoscripttask.loadHistory == 'function') pluginHandler.innovoscripttask.loadHistory(message);
        if (typeof pluginHandler.innovoscripttask.loadSchedule == 'function') pluginHandler.innovoscripttask.loadSchedule(message);
    };
    
    obj.variableData = function (message) {
        if (typeof pluginHandler.innovoscripttask.loadVariables == 'function') pluginHandler.innovoscripttask.loadVariables(message);
    };

    obj.metaData = function (message) {
        if (typeof pluginHandler.innovoscripttask.loadMeta == 'function') pluginHandler.innovoscripttask.loadMeta(message);
    };

    obj.batchProgress = function (message) {
        if (typeof pluginHandler.innovoscripttask.batchProgress == 'function') pluginHandler.innovoscripttask.batchProgress(message);
    };

    obj.batchRunList = function (message) {
        if (typeof pluginHandler.innovoscripttask.batchRunList == 'function') pluginHandler.innovoscripttask.batchRunList(message);
    };

    obj.determineNextJobTime = function(s) {
        var nextTime = null;
        var nowTime = Math.floor(new Date() / 1000);
        
        // special case: we've reached the end of our run
        if (s.endAt !== null && s.endAt <= nowTime) {
            return nextTime;
        }

        switch (s.recur) {
            case 'once':
                if (s.nextRun == null) nextTime = s.startAt;
                else nextTime = null;
            break;
            case 'minutes':
                /*var lRun = s.nextRun || nowTime;
                if (lRun == null) lRun = nowTime;
                nextTime = lRun + (s.interval * 60);
                if (s.startAt > nextTime) nextTime = s.startAt;*/
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60);
                // this prevents "catch-up" tasks being scheduled if an endpoint is offline for a long period of time
                // e.g. always make sure the next scheduled time is relevant to the scheduled interval, but in the future
                if (nextTime < nowTime) {
                    // initially I was worried about this causing event loop lockups
                    // if there was a long enough time gap. Testing over 50 years of backlog for a 3 min interval
                    // still ran under a fraction of a second. Safe to say this approach is safe! (~8.5 million times)
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
            break;
            case 'hourly':
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60 * 60);
                if (nextTime < nowTime) {
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60 * 60);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
            break;
            case 'daily':
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60 * 60 * 24);
                if (nextTime < nowTime) {
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60 * 60 * 24);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
            break;
            case 'weekly':
                var tempDate = new Date();
                var nowDate = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate());
                
                if (s.daysOfWeek.length == 0) {
                    nextTime = null;
                    break;
                }
                s.daysOfWeek = s.daysOfWeek.map(el => Number(el));
                var baseTime = s.startAt;
                //console.log('dow is ', s.daysOfWeek);
                var lastDayOfWeek = Math.max(...s.daysOfWeek);
                var startX = 0;
                //console.log('ldow is ', lastDayOfWeek);
                if (s.nextRun != null) {
                    baseTime = s.nextRun;
                    //console.log('basetime 2: ', baseTime);
                    if (nowDate.getDay() == lastDayOfWeek) {
                        baseTime = baseTime + ( s.interval * 604800 ) - (lastDayOfWeek * 86400);
                        //console.log('basetime 3: ', baseTime);
                    }
                    startX = 0;
                } else if (s.startAt < nowTime) {
                    baseTime = Math.floor(nowDate.getTime() / 1000);
                    //console.log('basetime 4: ', baseTime);
                }
                //console.log('startX is: ', startX);
                //var secondsFromMidnight = nowTimeDate.getSeconds() + (nowTimeDate.getMinutes() * 60) + (nowTimeDate.getHours() * 60 * 60);
                //console.log('seconds from midnight: ', secondsFromMidnight);
                //var dBaseTime = new Date(0); dBaseTime.setUTCSeconds(baseTime);
                //var dMidnight = new Date(dBaseTime.getFullYear(), dBaseTime.getMonth(), dBaseTime.getDate());
                //baseTime = Math.floor(dMidnight.getTime() / 1000);
                for (var x = startX; x <= 7; x++){
                    var checkDate = baseTime + (86400 * x);
                    var d = new Date(0); d.setUTCSeconds(checkDate);
                    var dm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                    
                    console.log('testing date: ', dm.toLocaleString()); // dMidnight.toLocaleString());
                    //console.log('if break check :', (s.daysOfWeek.indexOf(d.getDay()) !== -1 && checkDate >= nowTime));
                    //console.log('checkDate vs nowTime: ', (checkDate - nowTime), ' if positive, nowTime is less than checkDate');
                    if (s.nextRun == null && s.daysOfWeek.indexOf(dm.getDay()) !== -1 && dm.getTime() >= nowDate.getTime()) break;
                    if (s.daysOfWeek.indexOf(dm.getDay()) !== -1 && dm.getTime() > nowDate.getTime()) break;
                    //if (s.daysOfWeek.indexOf(d.getDay()) !== -1 && Math.floor(d.getTime() / 1000) >= nowTime) break;
                }
                var sa = new Date(0); sa.setUTCSeconds(s.startAt);
                var sad = new Date(sa.getFullYear(), sa.getMonth(), sa.getDate());
                var diff = (sa.getTime() - sad.getTime()) / 1000;
                nextTime = Math.floor(dm.getTime() / 1000) + diff;
                //console.log('next schedule is ' + d.toLocaleString());
            break;
            default:
                nextTime = null;
            break;
        }
        
        if (s.endAt != null && nextTime > s.endAt) nextTime = null; // if the next time reaches the bound of the endAt time, nullify
        
        return nextTime;
    };

    obj.makeJobsFromSchedules = function(scheduleId) {
        //obj.debug('ScriptTask', 'makeJobsFromSchedules starting');
        return obj.db.getSchedulesDueForJob(scheduleId)
        .then(schedules => {
            //obj.debug('ScriptTask', 'Found ' + schedules.length + ' schedules to process. Current time is: ' + Math.floor(new Date() / 1000));
            if (schedules.length) {
                schedules.forEach(s => {
                    var nextJobTime = obj.determineNextJobTime(s);
                    var nextJobScheduled = false;
                    if (nextJobTime === null) {
                        //obj.debug('ScriptTask', 'Removing Job Schedule for', JSON.stringify(s));
                        obj.db.removeJobSchedule(s._id);
                    } else {
                        //obj.debug('ScriptTask', 'Scheduling Job for', JSON.stringify(s));
                        obj.db.get(s.scriptId)
                        .then(scripts => {
                            // if a script is scheduled to run, but a previous run hasn't completed, 
                            // don't schedule another job for the same (device probably offline).
                            // results in the minimum jobs running once an agent comes back online.
                            return obj.db.getIncompleteJobsForSchedule(s._id)
                            .then((jobs) => {
                                if (jobs.length > 0) { /* obj.debug('Plugin', 'ScriptTask', 'Skipping job creation'); */ return Promise.resolve(); }
                                else { /* obj.debug('Plugin', 'ScriptTask', 'Creating new job'); */ nextJobScheduled = true; return obj.db.addJob( { scriptId: s.scriptId, scriptName: scripts[0].name, node: s.node, runBy: s.scheduledBy, dontQueueUntil: nextJobTime, jobSchedule: s._id } ); }
                            });
                        })
                        .then(() => {
                            
                            if (nextJobScheduled) { /* obj.debug('Plugin', 'ScriptTask', 'Updating nextRun time'); */ return obj.db.update(s._id, { nextRun: nextJobTime }); }
                            else { /* obj.debug('Plugin', 'ScriptTask', 'NOT updating nextRun time'); */ return Promise.resolve(); }
                        })
                        .then(() => {
                            obj.updateFrontEnd( { scriptId: s.scriptId, nodeId: s.node } );
                        })
                        .catch((e) => { console.log('PLUGIN: InnovoScriptTask: Error managing job schedules: ', e); });
                    }
                });
            }
        });
    };
    
    obj.deleteElement = function (command) {
        var delObj = null;
        obj.db.get(command.id)
        .then((found) => {
          var file = found[0];
          delObj = {...{}, ...found[0]};
          return file;
        })
        .then((file) => {
          if (file.type == 'folder') return obj.db.deleteByPath(file.path); //@TODO delete schedules for scripts within folders
          if (file.type == 'script') return obj.db.deleteSchedulesForScript(file._id);
          if (file.type == 'jobSchedule') return obj.db.deletePendingJobsForSchedule(file._id);
        })
        .then(() => {
          return obj.db.delete(command.id)
        })
        .then(() => {
          var updateObj = { tree: true };
          if (delObj.type == 'jobSchedule') {
              updateObj.scriptId = delObj.scriptId;
              updateObj.nodeId = delObj.node;
          }
          return obj.updateFrontEnd( updateObj );
        })
        .catch(e => { console.log('PLUGIN: InnovoScriptTask: Error deleting ', e.stack); });
    };
    
    obj.serveraction = function(command, myparent, grandparent) {
        switch (command.pluginaction) {
            case 'addScript':
                obj.db.addScript(command.name, command.content, command.path, command.filetype, command.description, command.category, command.tags)
                .then(() => {
                    obj.updateFrontEnd( { tree: true } );
                });            
            break;
            case 'new':
                var parent_path = '';
                var new_path = '';
                obj.db.get(command.parent_id)
                .then(found => {
                  if (found.length > 0) {
                      var file = found[0];
                      parent_path = file.path;
                  } else {
                      parent_path = 'Shared';
                  }
                })
                .then(() => {
                    obj.db.addScript(command.name, '', parent_path, command.filetype)
                })
                .then(() => {
                    obj.updateFrontEnd( { tree: true } );
                });
            break;
            case 'rename':
              obj.db.get(command.id)
              .then((docs) => {
                  var doc = docs[0];
                  if (doc.type == 'folder') {
                      console.log('old', doc.path, 'new', doc.path.replace(doc.path, command.name));
                      return obj.db.update(command.id, { path: doc.path.replace(doc.name, command.name) })
                      .then(() => { // update sub-items
                          return obj.db.getByPath(doc.path)
                      })
                      .then((found) => {
                          if (found.length > 0) {
                            var proms = [];
                            found.forEach(f => {
                              proms.push(obj.db.update(f._id, { path: doc.path.replace(doc.name, command.name) } ));
                            })
                            return Promise.all(proms);
                          }
                      })
                  } else {
                      return Promise.resolve();
                  }
              })
              .then(() => {
                  obj.db.update(command.id, { name: command.name })
              })
              .then(() => {
                  return obj.db.updateScriptJobName(command.id, command.name);
              })
              .then(() => {
                  obj.updateFrontEnd( { scriptId: command.id, nodeId: command.currentNodeId, tree: true } );
              });
            break;
            case 'move':
              var toPath = null, fromPath = null, parentType = null;
              obj.db.get(command.to)
              .then(found => { // get target data
                  if (found.length > 0) {
                    var file = found[0];
                    toPath = file.path;
                  } else throw Error('Target destination not found');
              })
              .then(() => { // get item to be moved
                return obj.db.get(command.id);
              })
              .then((found) => { // set item to new location
                  var file = found[0];
                  if (file.type == 'folder') {
                    fromPath = file.path;
                    toPath += '/' + file.name;
                    parentType = 'folder';
                    if (file.name == 'Shared' && file.path == 'Shared') throw Error('Cannot move top level directory: Shared');
                  }
                  return obj.db.update(command.id, { path: toPath } );
              })
              .then(() => { // update sub-items
                  return obj.db.getByPath(fromPath)
              })
              .then((found) => {
                  if (found.length > 0) {
                    var proms = [];
                    found.forEach(f => {
                      proms.push(obj.db.update(f._id, { path: toPath } ));
                    })
                    return Promise.all(proms);
                  }
              })
              .then(() => {
                return obj.updateFrontEnd( { tree: true } );
              })
              .catch(e => { console.log('PLUGIN: InnovoScriptTask: Error moving ', e.stack); });
            break;
            case 'newFolder':
              var parent_path = '';
              var new_path = '';
              
              obj.db.get(command.parent_id)
              .then(found => {
                if (found.length > 0) {
                    var file = found[0];
                    parent_path = file.path;
                } else {
                    parent_path = 'Shared';
                }
              })
              .then(() => {
                new_path = parent_path + '/' + command.name;
              })
              .then(() => {
                  return obj.db.addFolder(command.name, new_path);
              })
              .then(() => {
                return obj.updateFrontEnd( { tree: true } );
              })
              .catch(e => { console.log('PLUGIN: InnovoScriptTask: Error creating new folder ', e.stack); });
            break;
            case 'delete':
              obj.deleteElement(command);
            break;
            case 'addScheduledJob':
                /* { 
                    scriptId: scriptId, 
                    node: s, 
                    scheduledBy: myparent.user.name,
                    recur: command.recur, // [once, minutes, hourly, daily, weekly, monthly]
                    interval: x,
                    daysOfWeek: x, // only used for weekly recur val
                    // onTheXDay: x, // only used for monthly
                    startAt: x,
                    endAt: x,
                    runCountLimit: x,
                    lastRun: x,
                    nextRun: x,
                    type: "scheduledJob"
                } */
                var sj = command.schedule;
                
                var sched = {
                    scriptId: command.scriptId, 
                    node: null, 
                    scheduledBy: myparent.user.name,
                    recur: sj.recur,
                    interval: sj.interval,
                    daysOfWeek: sj.dayVals,
                    startAt: sj.startAt,
                    endAt: sj.endAt,
                    lastRun: null,
                    nextRun: null,
                    type: "jobSchedule"
                };
                var sel = command.nodes;
                var proms = [];
                if (Array.isArray(sel)) {
                  sel.forEach((s) => {
                    var sObj = {...sched, ...{
                        node: s
                    }};
                    proms.push(obj.db.addJobSchedule( sObj ));
                  });
              } else { test.push(sObj);
                  proms.push(obj.db.addJobSchedule( sObj ));
                }
                Promise.all(proms)
                .then(() => {
                    obj.makeJobsFromSchedules();
                    return Promise.resolve();
                })
                .catch(e => { console.log('PLUGIN: InnovoScriptTask: Error adding schedules. The error was: ', e); });
            break;
            case 'runScript':
              var scriptId = command.scriptId;
              var sel = command.nodes;
              var proms = [];
              if (Array.isArray(sel)) {
                sel.forEach((s) => {
                  proms.push(obj.db.addJob( { scriptId: scriptId, node: s, runBy: myparent.user.name } ));
                });
              } else {
                proms.push(obj.db.addJob( { scriptId: scriptId, node: sel, runBy: myparent.user.name } ));
              }
              Promise.all(proms)
              .then(() => {
                  return obj.db.get(scriptId);
              })
              .then(scripts => {
                  return obj.db.updateScriptJobName(scriptId, scripts[0].name);
              })
              .then(() => {
                  obj.resetQueueTimer();
                  obj.queueRun();
                  obj.updateFrontEnd( { scriptId: scriptId, nodeId: command.currentNodeId } );
              });
            break;
            case 'getScript':
                //obj.debug('ScriptTask', 'getScript Triggered', JSON.stringify(command));
                obj.db.get(command.scriptId)
                .then(script => {
                    myparent.send(JSON.stringify({ 
                        action: 'plugin',
                        plugin: 'innovoscripttask',
                        pluginaction: 'cacheScript',
                        nodeid: myparent.dbNodeKey,
                        rights: true,
                        sessionid: true,
                        script: script[0]
                    }));
                });
            break;
            case 'jobComplete':
                //obj.debug('ScriptTask', 'jobComplete Triggered', JSON.stringify(command));
                var jobNodeHistory = null, scriptHistory = null;
                var jobId = command.jobId, retVal = command.retVal, errVal = command.errVal, dispatchTime = command.dispatchTime;
                var completeTime = Math.floor(new Date() / 1000);
                obj.db.update(jobId, {
                    completeTime: completeTime,
                    returnVal: retVal,
                    errorVal: errVal,
                    dispatchTime: dispatchTime
                })
                .then(() => {
                    return obj.db.get(jobId)
                    .then(jobs => {
                        return Promise.resolve(jobs[0].jobSchedule);
                    })
                    .then(sId => {
                        if (sId == null) return Promise.resolve();
                        return obj.db.update(sId, { lastRun: completeTime } )
                        .then(() => {
                            obj.makeJobsFromSchedules(sId);
                        });
                    });
                })
                .then(() => {
                    obj.updateFrontEnd( { scriptId: command.scriptId, nodeId: myparent.dbNodeKey } );
                    // Check if this job belongs to a batch run
                    return obj.db.get(jobId);
                })
                .then((jobs) => {
                    if (jobs && jobs.length > 0 && jobs[0].batchRunId) {
                        obj.onBatchJobComplete(jobId, jobs[0].batchRunId, retVal, errVal);
                    }
                })
                .catch(e => { console.log('PLUGIN: InnovoScriptTask: Failed to complete job. ', e); });
            break;
            case 'loadNodeHistory':
                obj.updateFrontEnd( { nodeId: command.nodeId } );
            break;
            case 'loadScriptHistory':
                obj.updateFrontEnd( { scriptId: command.scriptId } );
            break;
            case 'editScript':
                var updateFields = { type: command.scriptType, name: command.scriptName, content: command.scriptContent };
                if (command.scriptDescription !== undefined) updateFields.description = command.scriptDescription;
                if (command.scriptCategory !== undefined) updateFields.category = command.scriptCategory;
                if (command.scriptTags !== undefined) updateFields.tags = Array.isArray(command.scriptTags) ? command.scriptTags : [];
                obj.db.update(command.scriptId, updateFields)
                .then(() => {
                    obj.updateFrontEnd( { scriptId: command.scriptId, tree: true } );
                });
            break;
            case 'clearAllPendingJobs':
                obj.db.deletePendingJobsForNode(myparent.dbNodeKey);
            break;
            case 'loadVariables':
                obj.updateFrontEnd( { variables: true } );
            break;
            case 'newVar':
                obj.db.addVariable(command.name, command.scope, command.scopeTarget, command.value)
                .then(() => {
                    obj.updateFrontEnd( { variables: true } );
                })
            break;
            case 'editVar':
                obj.db.update(command.id, { 
                    name: command.name, 
                    scope: command.scope, 
                    scopeTarget: command.scopeTarget,
                    value: command.value
                })
                .then(() => {
                    obj.updateFrontEnd( { variables: true } );
                })
            break;
            case 'deleteVar':
                obj.db.delete(command.id)
                .then(() => {
                    obj.updateFrontEnd( { variables: true } );
                })
            break;
            case 'loadMeta':
                obj.updateFrontEnd( { meta: true } );
            break;
            case 'addMeta':
                obj.db.addMeta(command.metaType, command.name, command.color)
                .then(() => { obj.updateFrontEnd( { meta: true, tree: true } ); });
            break;
            case 'renameMeta':
                obj.db.renameMeta(command.id, command.metaType, command.name, command.color)
                .then(() => { obj.updateFrontEnd( { meta: true, tree: true } ); });
            break;
            case 'deleteMeta':
                obj.db.deleteMeta(command.id)
                .then(() => { obj.updateFrontEnd( { meta: true, tree: true } ); });
            break;
            // ── Batch Deployment actions ──────────────────────
            case 'startBatchRun':
                obj.startBatchRun(command, myparent.user.name);
            break;
            case 'cancelBatchRun':
                obj.db.getBatchRun(command.id)
                .then(function(runs) {
                    if (runs.length === 0) return;
                    var run = runs[0];
                    run.status = 'cancelled';
                    obj.db.updateBatchRun(run._id, { status: 'cancelled' });
                    obj.db.deletePendingBatchJobs(run._id);
                    obj.sendBatchProgress(run);
                });
            break;
            case 'pauseBatchRun':
                obj.db.updateBatchRun(command.id, { status: 'paused' });
                obj.db.getBatchRun(command.id).then(function(runs) { if (runs.length) obj.sendBatchProgress(runs[0]); });
            break;
            case 'resumeBatchRun':
                var now = Math.floor(Date.now() / 1000);
                obj.db.updateBatchRun(command.id, { status: 'active', nextBatchAt: now + 10 });
                obj.db.getBatchRun(command.id).then(function(runs) { if (runs.length) obj.sendBatchProgress(runs[0]); });
            break;
            case 'loadBatchRuns':
                obj.db.getRecentBatchRuns(10)
                .then(function(runs) {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'innovoscripttask', pluginaction: 'batchRunList', batchRuns: runs });
                });
            break;
            case 'retryFailedBatch':
                obj.db.getBatchRun(command.id)
                .then(function(runs) {
                    if (runs.length === 0) return;
                    var run = runs[0];
                    var failedNodes = run.nodes.filter(function(n) { return n.status === 'error' || n.status === 'skipped'; });
                    if (failedNodes.length === 0) return;
                    // Create new batch run with only failed nodes
                    var retryCmd = {
                        scriptId: run.scriptId,
                        scriptName: run.scriptName,
                        nodes: failedNodes.map(function(n) { return n.nodeId; }),
                        nodeNames: failedNodes.map(function(n) { return n.nodeName; }),
                        batchSize: run.batchSize,
                        batchIntervalSec: run.batchIntervalSec,
                        staggerSec: run.staggerSec,
                        offlinePolicy: run.offlinePolicy
                    };
                    obj.startBatchRun(retryCmd, myparent.user.name);
                });
            break;
            default:
                console.log('PLUGIN: InnovoScriptTask: unknown action');
            break;
        }
    };
    
    return obj;
}
