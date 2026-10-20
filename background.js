// Observe completion metadata only. Requests and their contents are never changed.
const classroomTabs = new Map();
const classroomPorts = new Map();
const requestFilter = {
    urls: ['*://*.classroom.google.com/*'],
    types: ['main_frame', 'xmlhttprequest']
};

function isBackgroundClassroomRequest(details) {
    if (details.type !== 'xmlhttprequest' || !details.url) return false;
    try {
        // Telemetry and long-lived notification channels are not grade downloads.
        return /\/(?:log|gen_204|collect|jserror|webchannel|channel)(?:\/|$)/i.test(new URL(details.url).pathname);
    } catch (error) { return false; }
}

function setClassroomActivity(tabId, phase, assignmentCount = 0) {
    const count = Number.isSafeInteger(assignmentCount) && assignmentCount >= 0 ? assignmentCount : 0;
    const loadedText = `${count} assignment${count === 1 ? '' : 's'} loaded`;
    const states = {
        idle: {text: '', color: '#5f6368', title: 'Google Classroom Grade Calculator | GCGC'},
        loading: {text: String(count), color: '#b06000', title: `GCGC: ${loadedText} (loading)`},
        ready: {text: String(count), color: '#137333', title: `GCGC: ${loadedText}`},
        paused: {text: '!', color: '#b3261e', title: 'GCGC: Loading needs attention'}
    };
    if (!Object.hasOwn(states, phase) || !chrome.action) return;
    const state = states[phase];
    Promise.all([
        chrome.action.setBadgeText({tabId, text: state.text}),
        chrome.action.setBadgeBackgroundColor({tabId, color: state.color}),
        chrome.action.setTitle({tabId, title: state.title})
    ]).catch(() => {});
}

function getClassroomTab(tabId) {
    if (!classroomTabs.has(tabId)) {
        classroomTabs.set(tabId, { requests: new Map(), covered: false, failed: false, revision: 0, generation: 0 });
    }
    return classroomTabs.get(tabId);
}

function sendNetworkState(tabId) {
    const state = getClassroomTab(tabId);
    const message = {
        type: 'network',
        available: state.covered,
        pending: state.requests.size,
        failed: state.failed,
        revision: ++state.revision
    };
    for (const port of classroomPorts.get(tabId) || []) {
        try { port.postMessage(message); } catch (error) {}
    }
}

chrome.webRequest.onBeforeRequest.addListener(details => {
    if (details.tabId < 0 || details.frameId !== 0) return;
    if (isBackgroundClassroomRequest(details)) return;
    const state = getClassroomTab(details.tabId);
    if (details.type === 'main_frame') {
        state.requests.clear();
        state.covered = true;
        state.failed = false;
        state.generation++;
    } else {
        state.requests.set(details.requestId, state.generation);
    }
    sendNetworkState(details.tabId);
}, requestFilter);

function finishClassroomRequest(details, failed) {
    const state = classroomTabs.get(details.tabId);
    if (!state || !state.requests.has(details.requestId)) return;
    const generation = state.requests.get(details.requestId);
    state.requests.delete(details.requestId);
    if (failed && generation === state.generation) state.failed = true;
    sendNetworkState(details.tabId);
}

chrome.webRequest.onCompleted.addListener(details => {
    finishClassroomRequest(details, details.statusCode >= 400);
}, requestFilter);

chrome.webRequest.onErrorOccurred.addListener(details => {
    finishClassroomRequest(details, true);
}, requestFilter);

chrome.runtime.onConnect.addListener(port => {
    const tabId = port.sender?.tab?.id;
    if (port.name !== 'gcgc-network' || tabId === undefined || port.sender.frameId !== 0) return;
    if (!classroomPorts.has(tabId)) classroomPorts.set(tabId, new Set());
    classroomPorts.get(tabId).add(port);
    port.onMessage.addListener(message => {
        if (message.type === 'activity') {
            setClassroomActivity(tabId, message.phase, message.assignmentCount);
            return;
        }
        if (message.type === 'route') {
            const state = getClassroomTab(tabId);
            state.failed = false;
            state.generation++;
        }
        sendNetworkState(tabId);
    });
    port.onDisconnect.addListener(() => {
        const ports = classroomPorts.get(tabId);
        ports?.delete(port);
        if (!ports?.size) classroomPorts.delete(tabId);
    });
    sendNetworkState(tabId);
});

chrome.tabs.onRemoved.addListener(tabId => {
    classroomTabs.delete(tabId);
    classroomPorts.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changes) => {
    if (changes.status === 'loading' || changes.url) setClassroomActivity(tabId, 'idle');
});
