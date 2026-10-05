// Run with Node's test runner and Playwright installed. On Windows the default
// browser is Edge; BROWSER_CHANNEL=chromium uses Playwright's bundled Chromium.
const assert = require('node:assert/strict');
const path = require('node:path');
const {before, after, test} = require('node:test');
const {chromium} = require('playwright');

const projectRoot = path.join(__dirname, '..');
const courseURL = 'https://classroom.google.com/c/test/sp/all';
let browser;

before(async () => {
    const channel = process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
    browser = await chromium.launch({headless: true, ...(channel === 'chromium' ? {} : {channel})});
});

after(async () => {
    await browser?.close();
});

async function openFixture(t, options = {}) {
    const page = await browser.newPage({viewport: {width: 1100, height: 768}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => {
        await page.close();
        assert.deepEqual(errors, [], 'extension scripts should not throw browser errors');
    });
    await page.route('**/*', async route => {
        if (route.request().resourceType() !== 'document') {
            await route.fulfill({status: 204, body: ''});
            return;
        }
        await route.fulfill({contentType: 'text/html', body: `<!doctype html>
            <html><head><style>
                html, body { margin: 0; font: 16px Arial; }
                header { padding: 20px; }
                .ZnooZb { min-height: 60px; }
                #scroller.nested { height: 420px; overflow-y: auto; }
                .assignment { min-height: 300px; box-sizing: border-box; padding: 20px; }
                #native-progress { min-height: 20px; }
            </style></head><body>
                <header><span jsname="V67aGc">80%</span></header>
                <div class="ZnooZb">Assignment filters</div>
                <main><div id="scroller"></div></main>
            </body></html>`});
    });
    await page.goto(courseURL);
    await page.addStyleTag({path: path.join(projectRoot, 'styles.css')});
    await page.evaluate(config => {
        localStorage.setItem('gclass_weights_test', 'UNWEIGHTED');
        window.__installFixture = function(settings) {
            const scroller = document.querySelector('#scroller');
            scroller.className = settings.nested ? 'nested' : '';
            const list = document.createElement('div');
            list.id = 'assignment-list';
            list.setAttribute('role', 'list');
            const spinner = document.createElement('div');
            spinner.id = 'native-progress';
            spinner.setAttribute('role', 'progressbar');
            spinner.textContent = 'Classroom is loading';
            spinner.style.display = 'none';
            scroller.replaceChildren(list, spinner);
            const target = settings.nested ? scroller : window;
            const batches = settings.batches || [];
            let nextId = 0;
            let batchIndex = 0;
            let pending = false;
            let timer;
            const state = {started: 0, completed: 0, done: batches.length === 0, premature: []};

            function addAssignments(count, graded = true) {
                for (let i = 0; i < count; i++) {
                    const id = ++nextId;
                    const row = document.createElement('div');
                    row.className = 'assignment';
                    row.setAttribute('role', 'listitem');
                    row.innerHTML = `<h2 jsname="rQC7Ie" aria-label="Assignment ${id}">Assignment ${id}</h2>` +
                        (graded ? '<div class="K9DItd"><span class="wyQ9e">80</span> / 100</div>' : '<span>Not graded</span>');
                    list.appendChild(row);
                }
            }

            function setBusy(value) {
                spinner.style.display = value ? 'block' : 'none';
                scroller.setAttribute('aria-busy', String(value));
            }

            function atBottom() {
                const element = settings.nested ? scroller : document.scrollingElement;
                const viewport = settings.nested ? scroller.clientHeight : window.innerHeight;
                const top = settings.nested ? scroller.scrollTop : window.scrollY;
                return top + viewport >= element.scrollHeight - 2;
            }

            function onScroll() {
                if (pending || batchIndex >= batches.length || !atBottom()) return;
                const batch = batches[batchIndex++];
                state.started++;
                pending = true;
                setBusy(true);
                timer = setTimeout(() => {
                    addAssignments(batch.count, batch.graded !== false);
                    state.completed++;
                    state.done = state.completed === batches.length;
                    pending = false;
                    setBusy(false);
                }, batch.delay);
            }

            addAssignments(settings.initialCount ?? 3, settings.initialGraded !== false);
            target.addEventListener('scroll', onScroll);
            const monitor = new MutationObserver(() => {
                if (!state.done && document.querySelector('.what-if-input, #what-if-impact-breakdown')) {
                    state.premature.push('Calculator rendered before the final native batch');
                }
            });
            monitor.observe(document.body, {childList: true, subtree: true});
            window.__fixture = state;
            window.__addAssignments = addAssignments;
            window.__setBusy = setBusy;
            state.cancel = () => {
                clearTimeout(timer);
                target.removeEventListener('scroll', onScroll);
                monitor.disconnect();
            };
        };
        window.__installFixture(config);
    }, options);
    await page.addScriptTag({path: path.join(projectRoot, 'grade-loader.js')});
    await page.evaluate(() => {
        const createLoader = window.createGradeLoader;
        window.__loaderStarts = 0;
        window.__completedLoads = 0;
        window.createGradeLoader = options => {
            window.__loaderStarts++;
            return createLoader({...options, quietMs: 100, maxDurationMs: 4000, onComplete() {
                window.__completedLoads++;
                options.onComplete();
            }});
        };
    });
    await page.addScriptTag({path: path.join(projectRoot, 'content.js')});
    await page.evaluate(() => {
        const inject = window.injectHypotheticalInputs;
        const breakdown = window.updateImpactBreakdown;
        window.__renderCalls = {inputs: 0, breakdown: 0};
        window.injectHypotheticalInputs = (...args) => {
            window.__renderCalls.inputs++;
            return inject(...args);
        };
        window.updateImpactBreakdown = (...args) => {
            window.__renderCalls.breakdown++;
            return breakdown(...args);
        };
    });
    return page;
}

async function waitUntilReady(page, expectedInputs) {
    await page.waitForFunction(count =>
        !document.getElementById('what-if-load-status') &&
        document.querySelectorAll('.what-if-input:not(:disabled)').length === count &&
        document.querySelectorAll('.what-if-bar-segment').length === count,
    expectedInputs, {timeout: 8000});
}

for (const nested of [false, true]) {
    test(`loads delayed native batches in the ${nested ? 'nested container' : 'window'} before calculating`, async t => {
        const page = await openFixture(t, {nested, batches: [
            {delay: 450, count: 2},
            {delay: 250, count: 2, graded: false},
            {delay: 350, count: 1}
        ]});
        await page.waitForFunction(() => window.__fixture.started === 1);
        await page.waitForTimeout(220);
        assert.equal(await page.locator('.what-if-input, #what-if-impact-breakdown').count(), 0);
        await waitUntilReady(page, 6);
        assert.deepEqual(await page.evaluate(() => window.__fixture.premature), []);
        assert.equal(await page.evaluate(() => window.__fixture.completed), 3);
        assert.equal(await page.evaluate(nested => nested ? document.querySelector('#scroller').scrollTop : scrollY, nested), 0);
        await page.locator('.what-if-input').first().fill('100');
        assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '83.33% (Hypothetical)');
        const calls = await page.evaluate(() => ({...window.__renderCalls}));
        await page.waitForTimeout(400);
        assert.deepEqual(await page.evaluate(() => window.__renderCalls), calls, 'rendering its own controls must not create an observer loop');
        assert.equal(await page.evaluate(() => window.__completedLoads), 1);
    });
}

test('starts from ungraded rows and finds later graded assignments', async t => {
    const page = await openFixture(t, {nested: true, initialGraded: false, batches: [{delay: 450, count: 2}]});
    await page.waitForFunction(() => window.__fixture.started === 1);
    assert.equal(await page.locator('.K9DItd').count(), 0);
    await waitUntilReady(page, 2);
    assert.deepEqual(await page.evaluate(() => window.__fixture.premature), []);
    await page.locator('.what-if-input').first().fill('100');
    assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '90.00% (Hypothetical)');
});

test('late grade rows suspend the existing calculator until the new total settles', async t => {
    const page = await openFixture(t, {nested: true});
    await waitUntilReady(page, 3);
    await page.locator('.what-if-input').first().fill('100');
    assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '86.67% (Hypothetical)');
    const immediately = await page.evaluate(async () => {
        window.__setBusy(true);
        window.__addAssignments(1);
        await Promise.resolve();
        setTimeout(() => window.__setBusy(false), 350);
        return {
            disabled: [...document.querySelectorAll('.what-if-input')].every(input => input.disabled),
            barPresent: !!document.getElementById('what-if-impact-breakdown'),
            header: document.querySelector('[jsname="V67aGc"]').textContent
        };
    });
    assert.deepEqual(immediately, {disabled: true, barPresent: false, header: '80%'});
    await waitUntilReady(page, 4);
    assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '85.00% (Hypothetical)');
    assert.equal(await page.evaluate(() => window.__completedLoads), 2);
});

test('Stop offers Retry without activating a partial calculator, and Retry completes', async t => {
    const page = await openFixture(t, {nested: true, batches: [{delay: 1000, count: 2}]});
    await page.waitForFunction(() => window.__fixture.started === 1);
    await page.getByRole('button', {name: 'Stop loading', exact: true}).click();
    assert.equal(await page.getByRole('button', {name: 'Retry loading', exact: true}).count(), 1);
    assert.equal(await page.locator('.what-if-input, #what-if-impact-breakdown').count(), 0);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.what-if-input').count(), 0);
    await page.getByRole('button', {name: 'Retry loading', exact: true}).click();
    await waitUntilReady(page, 5);
    assert.deepEqual(await page.evaluate(() => window.__fixture.premature), []);
    assert.equal(await page.evaluate(() => window.__loaderStarts), 2);
});

test('unrelated row menu content does not reload a completed assignment list', async t => {
    const page = await openFixture(t, {nested: true});
    await waitUntilReady(page, 3);
    const starts = await page.evaluate(() => window.__loaderStarts);
    await page.evaluate(() => {
        const menu = document.createElement('span');
        menu.className = 'native-assignment-menu';
        menu.textContent = 'Assignment options';
        document.querySelector('[role="listitem"]').appendChild(menu);
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__loaderStarts), starts);
    assert.equal(await page.locator('.what-if-input:disabled').count(), 0);
    assert.equal(await page.locator('#what-if-load-status').count(), 0);
});

test('navigation cancels loading and returning to a replaced same-course list reloads it', async t => {
    const page = await openFixture(t, {batches: [{delay: 1400, count: 2}]});
    await page.waitForFunction(() => window.__fixture.started === 1);
    await page.evaluate(() => {
        window.__fixture.cancel();
        history.pushState({}, '', '/h');
        document.querySelector('#scroller').remove();
        const home = document.createElement('div');
        home.id = 'home';
        home.style.height = '3500px';
        document.body.appendChild(home);
        scrollTo(0, 120);
    });
    await page.waitForFunction(() => !document.getElementById('what-if-load-status'));
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => scrollY), 120, 'old loader must not restore scroll onto the new route');
    assert.equal(await page.locator('.what-if-input, #what-if-impact-breakdown').count(), 0);
    await page.evaluate(() => {
        history.pushState({}, '', '/c/test/sp/all');
        document.querySelector('#home').remove();
        const scroller = document.createElement('div');
        scroller.id = 'scroller';
        document.querySelector('main').appendChild(scroller);
        window.__installFixture({nested: true, initialCount: 3, batches: [{delay: 350, count: 2}]});
    });
    await waitUntilReady(page, 5);
    assert.deepEqual(await page.evaluate(() => window.__fixture.premature), []);
    assert.equal(await page.evaluate(() => window.__loaderStarts), 2);
    assert.equal(await page.evaluate(() => window.__completedLoads), 1);
});
