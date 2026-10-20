const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function event() {
    const listeners = new Set();
    return {addListener: listener => listeners.add(listener), emit: (...args) => listeners.forEach(listener => listener(...args))};
}

function workerHarness() {
    const badges = new Map();
    const titles = new Map();
    const chrome = {
        webRequest: {onBeforeRequest: event(), onCompleted: event(), onErrorOccurred: event()},
        runtime: {onConnect: event()},
        tabs: {onRemoved: event(), onUpdated: event()},
        action: {
            setBadgeText: ({tabId, text}) => {badges.set(tabId, text); return Promise.resolve();},
            setBadgeBackgroundColor: () => Promise.resolve(),
            setTitle: ({tabId, title}) => {titles.set(tabId, title); return Promise.resolve();}
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), {chrome, URL});
    const messages = [];
    const port = {name: 'gcgc-network', sender: {tab: {id: 1}, frameId: 0},
        onMessage: event(), onDisconnect: event(), postMessage: message => messages.push(message)};
    chrome.runtime.onConnect.emit(port);
    const request = (requestId, other = {}) => ({tabId: 1, frameId: 0, type: 'xmlhttprequest', requestId, ...other});
    return {chrome, port, messages, request, badges, titles, state: () => messages.at(-1)};
}

test('the toolbar reports loading, active and paused states only on the relevant tab', () => {
    const h = workerHarness();
    for (const [phase, badge, assignmentCount] of [['loading', '12', 12], ['ready', '18', 18], ['paused', '!', 18]]) {
        h.port.onMessage.emit({type: 'activity', phase, assignmentCount});
        assert.equal(h.badges.get(1), badge);
        assert.equal(h.badges.has(2), false);
    }
    h.port.onMessage.emit({type: 'activity', phase: 'ready', assignmentCount: 18});
    assert.equal(h.titles.get(1), 'GCGC: 18 assignments loaded');
    h.chrome.tabs.onUpdated.emit(1, {status: 'loading'});
    assert.equal(h.badges.get(1), '');
    h.port.onMessage.emit({type: 'activity', phase: '__proto__'});
    assert.equal(h.badges.get(1), '');
});

test('only a monitored navigation establishes full request coverage', () => {
    const h = workerHarness();
    assert.equal(h.state().available, false);
    h.chrome.webRequest.onBeforeRequest.emit(h.request('page', {type: 'main_frame'}));
    assert.equal(h.state().available, true);
    assert.equal(h.state().pending, 0);
});

test('counts concurrent downloads until full completion, not receipt of headers', () => {
    const h = workerHarness();
    h.chrome.webRequest.onBeforeRequest.emit(h.request('a'));
    h.chrome.webRequest.onBeforeRequest.emit(h.request('b'));
    assert.equal(h.state().pending, 2);
    h.chrome.webRequest.onCompleted.emit(h.request('a', {statusCode: 200}));
    assert.equal(h.state().pending, 1);
    h.chrome.webRequest.onCompleted.emit(h.request('b', {statusCode: 200}));
    assert.equal(h.state().pending, 0);
    assert.equal(h.state().failed, false);
    assert.deepEqual(Object.keys(h.state()).sort(), ['available', 'failed', 'pending', 'revision', 'type']);
});

test('telemetry and long-lived notification channels cannot block grades or report grade failures', () => {
    const h = workerHarness();
    h.chrome.webRequest.onBeforeRequest.emit(h.request('page', {type: 'main_frame'}));
    for (const pathname of ['/log', '/u/0/_/ClassroomUi/jserror', '/gen_204', '/collect', '/channel/bind', '/webchannel']) {
        const details = h.request(pathname, {url: 'https://classroom.google.com' + pathname});
        h.chrome.webRequest.onBeforeRequest.emit(details);
        assert.equal(h.state().pending, 0);
        h.chrome.webRequest.onErrorOccurred.emit(details);
        assert.equal(h.state().failed, false);
    }
    h.chrome.webRequest.onBeforeRequest.emit(h.request('grades', {
        url: 'https://classroom.google.com/u/0/_/ClassroomUi/data/batchexecute?rpcids=grades'
    }));
    assert.equal(h.state().pending, 1);
});

test('handles redirects without double counting and ignores unrelated tabs and frames', () => {
    const h = workerHarness();
    h.chrome.webRequest.onBeforeRequest.emit(h.request('a'));
    h.chrome.webRequest.onBeforeRequest.emit(h.request('a'));
    h.chrome.webRequest.onBeforeRequest.emit(h.request('other', {tabId: 2}));
    h.chrome.webRequest.onBeforeRequest.emit(h.request('frame', {frameId: 1}));
    assert.equal(h.state().pending, 1);
});

test('HTTP and connection failures keep a partial list from being declared complete', () => {
    for (const http of [true, false]) {
        const h = workerHarness();
        h.chrome.webRequest.onBeforeRequest.emit(h.request('a'));
        if (http) h.chrome.webRequest.onCompleted.emit(h.request('a', {statusCode: 503}));
        else h.chrome.webRequest.onErrorOccurred.emit(h.request('a', {error: 'net::ERR_CONNECTION_RESET'}));
        assert.equal(h.state().pending, 0);
        assert.equal(h.state().failed, true);
    }
});

test('a new page clears old requests and old failures do not poison a new route', () => {
    const h = workerHarness();
    h.chrome.webRequest.onBeforeRequest.emit(h.request('old'));
    h.port.onMessage.emit({type: 'route'});
    h.chrome.webRequest.onErrorOccurred.emit(h.request('old'));
    assert.equal(h.state().failed, false);
    h.chrome.webRequest.onBeforeRequest.emit(h.request('active'));
    h.chrome.webRequest.onBeforeRequest.emit(h.request('page', {type: 'main_frame'}));
    assert.equal(h.state().pending, 0);
    h.chrome.webRequest.onErrorOccurred.emit(h.request('active'));
    assert.equal(h.state().failed, false);
});

test('client keeps the worker alive while loading and detects lost in-flight requests', () => {
    const port = {onMessage: event(), onDisconnect: event(), postMessage: () => {}};
    const timers = new Set();
    const window = {};
    const chrome = {runtime: {connect: () => port}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'network-monitor.js'), 'utf8'), {
        window, chrome, setInterval: callback => {timers.add(callback); return callback;},
        clearInterval: callback => timers.delete(callback)
    });
    const monitor = window.createClassroomNetworkMonitor();
    const unwatch = monitor.watch(() => {});
    assert.equal(timers.size, 1);
    port.onMessage.emit({type: 'network', available: true, pending: 1, failed: false, revision: 1});
    port.onDisconnect.emit();
    assert.equal(monitor.getState().available, false);
    assert.equal(monitor.getState().failed, true);
    unwatch();
    assert.equal(timers.size, 0);
});
