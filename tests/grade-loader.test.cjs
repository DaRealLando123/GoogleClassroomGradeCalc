const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loaderSource = fs.readFileSync(path.join(__dirname, '..', 'grade-loader.js'), 'utf8');

function createHarness({nested = false, quietMs = 1000, maxDurationMs = 6000} = {}) {
    let now = 0;
    let nextId = 1;
    let progressReads = 0;
    let pendingLoad = false;
    let progress = {gradeCount: 1, assignmentCount: 2};
    const tasks = new Map();
    const observers = [];
    const scrolls = [];
    const updates = [];
    const stopped = [];
    let completions = 0;
    const root = {nodeType: 1, isConnected: true};
    const documentScroller = {scrollHeight: 5000, clientHeight: 800, scrollTop: 240, scrollLeft: 13};
    const innerScroller = {isConnected: true, scrollHeight: 3000, clientHeight: 500, scrollTop: 175, scrollLeft: 7};

    function schedule(callback, delay = 0) {
        const id = nextId++;
        tasks.set(id, {callback, due: now + Math.max(0, Number(delay) || 0)});
        return id;
    }

    const window = {
        innerHeight: 800,
        scrollX: 13,
        scrollY: 240,
        scrollTo({top, left = 0, behavior}) {
            this.scrollY = Math.max(0, Math.min(top, documentScroller.scrollHeight - this.innerHeight));
            this.scrollX = left;
            documentScroller.scrollTop = this.scrollY;
            documentScroller.scrollLeft = left;
            scrolls.push({target: 'window', top: this.scrollY, left, behavior, time: now});
        }
    };
    innerScroller.scrollTo = function({top, left = 0, behavior}) {
        this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight));
        this.scrollLeft = left;
        scrolls.push({target: 'nested', top: this.scrollTop, left, behavior, time: now});
    };
    const document = {
        scrollingElement: documentScroller,
        documentElement: documentScroller,
        body: {scrollHeight: 900},
        visibilityState: 'visible'
    };
    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.connected = false;
            observers.push(this);
        }
        observe(target, options) {
            this.target = target;
            this.options = options;
            this.connected = true;
        }
        disconnect() {
            this.connected = false;
        }
        takeRecords() {
            return [];
        }
    }
    const globals = {
        window,
        document,
        MutationObserver: FakeMutationObserver,
        requestAnimationFrame: callback => schedule(() => callback(now), 16),
        cancelAnimationFrame: id => tasks.delete(id),
        performance: {now: () => now},
        setTimeout: schedule,
        clearTimeout: id => tasks.delete(id),
        console
    };
    Object.assign(window, globals);
    vm.runInNewContext(loaderSource, globals, {filename: 'grade-loader.js'});
    const loader = window.createGradeLoader({
        root,
        getScrollTarget: () => nested ? innerScroller : window,
        getProgress() {
            progressReads++;
            return {...progress};
        },
        hasPendingLoad: () => pendingLoad,
        isRelevantMutation: record => record.relevant !== false,
        onProgress: value => updates.push({...value}),
        onComplete: () => completions++,
        onStop: reason => stopped.push(reason),
        quietMs,
        maxDurationMs
    });

    function advance(milliseconds) {
        const end = now + milliseconds;
        let calls = 0;
        while (true) {
            let nextTask = null;
            let nextTaskId = null;
            for (const [id, task] of tasks) {
                if (task.due <= end && (!nextTask || task.due < nextTask.due)) {
                    nextTask = task;
                    nextTaskId = id;
                }
            }
            if (!nextTask) break;
            assert.ok(++calls < 10000, 'loader must not schedule an unbounded loop');
            now = nextTask.due;
            tasks.delete(nextTaskId);
            nextTask.callback();
        }
        now = end;
    }

    function mutate({relevant = true} = {}) {
        const records = [{type: 'childList', target: root, addedNodes: [], removedNodes: [], relevant}];
        for (const observer of observers) {
            if (observer.connected) observer.callback(records, observer);
        }
    }

    return {
        loader,
        advance,
        mutate,
        window,
        documentScroller,
        innerScroller,
        scrolls,
        updates,
        stopped,
        observers,
        setProgress(value) { progress = {...progress, ...value}; },
        setPendingLoad(value) { pendingLoad = value; },
        get progressReads() { return progressReads; },
        get completions() { return completions; },
        get pendingTasks() { return tasks.size; }
    };
}

test('coalesces rapid grade mutations into one scan and scroll for the new batch', () => {
    const h = createHarness();
    h.loader.start();
    h.advance(16);
    const readsBefore = h.progressReads;
    const scrollsBefore = h.scrolls.length;
    h.setProgress({gradeCount: 20, assignmentCount: 25});
    h.documentScroller.scrollHeight = 8000;
    for (let i = 0; i < 50; i++) h.mutate();
    assert.equal(h.progressReads, readsBefore, 'mutations should queue a scan rather than scan synchronously');
    h.advance(16);
    assert.equal(h.progressReads, readsBefore + 1);
    assert.equal(h.scrolls.length, scrollsBefore + 1);
    assert.equal(h.window.scrollY, 7200);
    assert.ok(h.updates.some(value => value.gradeCount === 20 && value.assignmentCount === 25));
    h.loader.cancel();
});

test('waits for graded and ungraded assignment batches before completing', () => {
    const h = createHarness();
    h.loader.start();
    h.advance(450);
    h.setProgress({gradeCount: 10, assignmentCount: 12});
    h.documentScroller.scrollHeight += 2000;
    h.mutate();
    h.advance(650);
    assert.equal(h.completions, 0);
    h.setProgress({assignmentCount: 24});
    h.documentScroller.scrollHeight += 2000;
    h.mutate();
    h.advance(800);
    assert.equal(h.completions, 0, 'ungraded assignments must restart the quiet period');
    h.advance(600);
    assert.equal(h.completions, 1);
    assert.deepEqual(h.stopped, []);
    assert.equal(h.pendingTasks, 0);
    assert.ok(h.observers.every(observer => !observer.connected));
});

test('visible loading state prevents premature completion on a slow connection', () => {
    const h = createHarness();
    h.setPendingLoad(true);
    h.loader.start();
    h.advance(3000);
    assert.equal(h.completions, 0);
    assert.deepEqual(h.stopped, []);
    assert.equal(h.progressReads, 1, 'fallback checks must not rescan the full assignment list');
    h.setPendingLoad(false);
    h.advance(1500);
    assert.equal(h.completions, 1);
});

test('times out without declaring a partial assignment list complete', () => {
    const h = createHarness({maxDurationMs: 2500});
    h.setPendingLoad(true);
    h.loader.start();
    h.advance(2800);
    assert.equal(h.completions, 0);
    assert.deepEqual(h.stopped, ['timeout']);
    assert.equal(h.window.scrollY, 240);
    assert.equal(h.window.scrollX, 13);
    assert.equal(h.pendingTasks, 0);
    assert.ok(h.observers.every(observer => !observer.connected));
});

test('cancelling on navigation clears all work without scrolling the new route', () => {
    const h = createHarness();
    h.loader.start();
    h.advance(16);
    h.mutate();
    h.window.scrollTo({top: 85, left: 4});
    const scrollsBefore = h.scrolls.length;
    h.loader.cancel();
    assert.equal(h.pendingTasks, 0);
    assert.ok(h.observers.every(observer => !observer.connected));
    h.advance(10000);
    h.mutate();
    assert.equal(h.scrolls.length, scrollsBefore);
    assert.equal(h.window.scrollY, 85);
    assert.equal(h.completions, 0);
});

test('finishing uses the document scrolling element and restores both axes', () => {
    const h = createHarness();
    h.loader.start();
    h.advance(16);
    assert.equal(h.window.scrollY, 4200, 'document extent must not come from the shorter body');
    h.advance(1500);
    assert.equal(h.completions, 1);
    assert.equal(h.window.scrollY, 240);
    assert.equal(h.window.scrollX, 13);
});

test('finishing restores a nested scrolling container without moving the window', () => {
    const h = createHarness({nested: true});
    h.loader.start();
    h.advance(16);
    assert.equal(h.innerScroller.scrollTop, 2500);
    h.advance(1500);
    assert.equal(h.completions, 1);
    assert.equal(h.innerScroller.scrollTop, 175);
    assert.equal(h.innerScroller.scrollLeft, 7);
    assert.equal(h.window.scrollY, 240);
    assert.ok(h.scrolls.every(scroll => scroll.target === 'nested'));
});

test('explicit stop restores scroll and reports its reason once', () => {
    const h = createHarness({nested: true});
    h.loader.start();
    h.advance(16);
    h.loader.stop('user');
    h.loader.stop('user');
    h.advance(10000);
    assert.equal(h.completions, 0);
    assert.deepEqual(h.stopped, ['user']);
    assert.equal(h.innerScroller.scrollTop, 175);
    assert.equal(h.innerScroller.scrollLeft, 7);
    assert.equal(h.pendingTasks, 0);
});

test('irrelevant page mutations neither rescan assignments nor postpone completion', () => {
    const h = createHarness();
    h.loader.start();
    h.advance(16);
    const initialReads = h.progressReads;
    for (let i = 0; i < 6; i++) {
        h.advance(200);
        h.mutate({relevant: false});
    }
    h.advance(300);
    assert.equal(h.completions, 1);
    assert.equal(h.progressReads, initialReads);
});
