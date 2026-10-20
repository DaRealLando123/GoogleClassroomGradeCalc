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
        if (config.headerInitiallyMissing) document.querySelector('header').replaceChildren();
        if (config.headerAriaHidden) document.querySelector('header span').setAttribute('aria-hidden', 'true');
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
            if (batches.length && batches.every(batch => batch.silent)) spinner.remove();
            let nextId = 0;
            let batchIndex = 0;
            let pending = false;
            let timer;
            const state = {
                started: 0,
                completed: 0,
                done: batches.length === 0,
                premature: [],
                hydrationExpected: 0,
                hydrated: 0,
                visibleRows: []
            };

            function addAssignments(count, graded = true) {
                for (let i = 0; i < count; i++) {
                    const id = ++nextId;
                    const row = document.createElement('div');
                    row.className = 'assignment';
                    row.setAttribute('role', 'listitem');
                    row.innerHTML = `<h2 jsname="rQC7Ie" aria-label="Assignment ${id}">Assignment ${id}</h2>` +
                        (graded && !(settings.ungradedEvery && id % settings.ungradedEvery === 0)
                            ? '<div class="K9DItd"><span class="wyQ9e">80</span> / 100</div>'
                            : '<span>Not graded</span>');
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
                if (!batch.silent) setBusy(true);
                timer = setTimeout(() => {
                    addAssignments(batch.count, batch.graded !== false);
                    state.completed++;
                    state.done = state.completed === batches.length;
                    pending = false;
                    if (!batch.silent) setBusy(false);
                }, batch.delay);
            }

            addAssignments(settings.initialCount ?? 3, settings.initialGraded !== false);
            let hydrationObserver;
            const intersectionTimers = new Set();
            if (settings.intersectionHydrationPart) {
                const scores = new Map();
                for (const row of list.children) {
                    const grade = row.querySelector('.K9DItd');
                    if (!grade) continue;
                    scores.set(row, grade);
                    if (settings.intersectionHydrationPart === 'container') grade.remove();
                    else grade.querySelector('.wyQ9e').textContent = '';
                }
                state.hydrationExpected = scores.size;
                hydrationObserver = new IntersectionObserver(entries => {
                    for (const entry of entries) {
                        if (!entry.isIntersecting) continue;
                        const row = entry.target;
                        const grade = scores.get(row);
                        if (!grade) continue;
                        hydrationObserver.unobserve(row);
                        state.visibleRows.push(row.querySelector('h2').textContent);
                        const hydrationTimer = setTimeout(() => {
                            grade.innerHTML = '<span class="wyQ9e">80</span> / 100';
                            if (!grade.isConnected) row.appendChild(grade);
                            state.hydrated++;
                            intersectionTimers.delete(hydrationTimer);
                        }, 300);
                        intersectionTimers.add(hydrationTimer);
                    }
                }, {root: settings.nested ? scroller : null, threshold: 0.01});
                for (const row of scores.keys()) hydrationObserver.observe(row);
            }
            let hydrationTimer;
            if (settings.hydrationDelay) {
                const grades = [...list.querySelectorAll('.K9DItd')];
                grades.forEach(grade => {
                    if (settings.hydrationPart === 'container') grade.remove();
                    else if (settings.hydrationPart === 'possible') grade.lastChild.textContent = '';
                    else grade.querySelector('.wyQ9e').textContent = '';
                });
                hydrationTimer = setTimeout(() => {
                    if (settings.hydrationPart === 'container') {
                        list.querySelectorAll('.assignment').forEach((row, index) => row.appendChild(grades[index]));
                    } else {
                        grades.forEach(grade => grade.innerHTML = '<span class="wyQ9e">80</span> / 100');
                    }
                }, settings.hydrationDelay);
            }
            target.addEventListener('scroll', onScroll);
            const monitor = new MutationObserver(() => {
                if (!state.done && document.querySelector('.what-if-input, #what-if-impact-breakdown')) {
                    state.premature.push('Calculator rendered before the final native batch');
                }
                if (state.hydrated < state.hydrationExpected &&
                    document.querySelector('.what-if-input, #what-if-impact-breakdown')) {
                    state.premature.push('Calculator rendered before visible rows hydrated their grades');
                }
            });
            monitor.observe(document.body, {childList: true, subtree: true});
            window.__fixture = state;
            window.__addAssignments = addAssignments;
            window.__setBusy = setBusy;
            state.cancel = () => {
                clearTimeout(timer);
                clearTimeout(hydrationTimer);
                hydrationObserver?.disconnect();
                intersectionTimers.forEach(clearTimeout);
                target.removeEventListener('scroll', onScroll);
                monitor.disconnect();
            };
        };
        window.__installFixture(config);
    }, options);
    await page.addScriptTag({path: path.join(projectRoot, 'grade-loader.js')});
    await page.evaluate(quietMs => {
        const createLoader = window.createGradeLoader;
        window.__loaderStarts = 0;
        window.__completedLoads = 0;
        window.createGradeLoader = options => {
            window.__loaderStarts++;
            return createLoader({...options, quietMs, maxDurationMs: 4000, onComplete() {
                window.__completedLoads++;
                options.onComplete();
            }});
        };
    }, options.quietMs ?? 100);
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

test('updates the visible grade and scrolling banner when the native grade is aria-hidden', async t => {
    const page = await openFixture(t, {nested: true, headerAriaHidden: true});
    await waitUntilReady(page, 3);
    await page.locator('.what-if-input').first().fill('100');
    assert.equal(await page.locator('header span').innerText(), '86.67% (Hypothetical)');
    await page.evaluate(() => document.querySelector('#scroller').scrollTo(0, 200));
    await page.waitForFunction(() => document.querySelector('#what-if-sticky-grade-banner').classList.contains('visible'));
    assert.equal(await page.locator('#what-if-banner-grade-text').innerText(), '86.67% (Hypothetical)');
    await page.locator('.what-if-reset-btn').first().evaluate(button => button.click());
    assert.equal(await page.locator('header span').innerText(), '80%');
    assert.equal(await page.locator('#what-if-banner-grade-text').innerText(), '80%');
});

test('existing controls update a late or replaced native grade and the scrolling banner', async t => {
    const page = await openFixture(t, {nested: true, headerInitiallyMissing: true});
    await waitUntilReady(page, 3);
    await page.evaluate(() => {
        document.querySelector('header').innerHTML = '<span jsname="V67aGc">80%</span>';
    });
    await page.waitForFunction(() => document.querySelector('header span').dataset.originalText === '80%');
    await page.locator('.what-if-input').first().fill('100');
    assert.equal(await page.locator('header span').innerText(), '86.67% (Hypothetical)');
    await page.evaluate(() => {
        document.querySelector('header').innerHTML = '<span jsname="V67aGc">80%</span>';
    });
    await page.waitForFunction(() => document.querySelector('header span').dataset.originalText === '80%');
    await page.locator('.what-if-input').first().fill('90');
    assert.equal(await page.locator('header span').innerText(), '83.33% (Hypothetical)');
    await page.evaluate(() => document.querySelector('#scroller').scrollTo(0, 200));
    await page.waitForFunction(() => document.querySelector('#what-if-sticky-grade-banner').classList.contains('visible'));
    assert.equal(await page.locator('#what-if-banner-grade-text').innerText(), '83.33% (Hypothetical)');
    assert.equal(await page.evaluate(() => window.__loaderStarts), 1, 'header changes must not restart loading');
});

for (const hydrationPart of ['earned', 'possible', 'container']) {
    test(`waits for delayed ${hydrationPart} grade data even when titles are already present`, async t => {
        const page = await openFixture(t, {
            nested: true, hydrationDelay: 900, hydrationPart, quietMs: 1600
        });
        await page.waitForTimeout(550);
        assert.equal(await page.locator('.what-if-input, #what-if-impact-breakdown').count(), 0);
        await waitUntilReady(page, 3);
        assert.equal(await page.evaluate(() => document.querySelector('#scroller').scrollTop), 0);
        await page.locator('.what-if-input').first().fill('100');
        assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '86.67% (Hypothetical)');
    });
}

for (const nested of [false, true]) {
    for (const intersectionHydrationPart of ['container', 'earned']) {
        test(`visits every ${nested ? 'nested' : 'window'} viewport to hydrate ${intersectionHydrationPart} scores among ungraded rows`, async t => {
            const page = await openFixture(t, {
                nested,
                initialCount: 12,
                ungradedEvery: 4,
                intersectionHydrationPart,
                quietMs: 1600
            });
            assert.equal(await page.locator('[jsname="rQC7Ie"]').count(), 12, 'all titles are present before scrolling');
            assert.equal(await page.locator('.what-if-input, #what-if-impact-breakdown').count(), 0);
            await waitUntilReady(page, 9);
            const result = await page.evaluate(nested => ({
                hydrated: window.__fixture.hydrated,
                expected: window.__fixture.hydrationExpected,
                visibleRows: window.__fixture.visibleRows,
                premature: window.__fixture.premature,
                gradeCount: [...document.querySelectorAll('.wyQ9e')].filter(score => score.textContent === '80').length,
                top: nested ? document.querySelector('#scroller').scrollTop : scrollY,
                completedLoads: window.__completedLoads
            }), nested);
            assert.equal(result.expected, 9, 'three ungraded assignments should remain ungraded');
            assert.equal(result.hydrated, result.expected, 'each graded row must enter the viewport before calculation');
            assert.equal(new Set(result.visibleRows).size, result.expected);
            assert.equal(result.gradeCount, result.expected);
            assert.deepEqual(result.premature, []);
            assert.equal(result.top, 0, 'completion must jump immediately to the top');
            assert.equal(result.completedLoads, 1);
            await page.locator('.what-if-input').first().fill('100');
            assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '82.22% (Hypothetical)');
        });
    }
}

test('waits for a silent delayed native batch even when the first grades are complete', async t => {
    const page = await openFixture(t, {
        nested: true,
        quietMs: 1600,
        batches: [{delay: 500, count: 2, silent: true}]
    });
    await page.waitForFunction(() => window.__fixture.started === 1);
    assert.equal(await page.locator('[aria-busy="true"]').count(), 0);
    assert.equal(await page.locator('[role="progressbar"]').count(), 0);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__fixture.completed), 0);
    assert.equal(await page.locator('.what-if-input, #what-if-impact-breakdown').count(), 0,
        '150ms of quiet cannot establish that all native batches have arrived');
    await waitUntilReady(page, 5);
    assert.deepEqual(await page.evaluate(() => window.__fixture.premature), []);
    assert.equal(await page.evaluate(() => window.__completedLoads), 1);
    assert.equal(await page.evaluate(() => document.querySelector('#scroller').scrollTop), 0);
    await page.locator('.what-if-input').first().fill('100');
    assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '84.00% (Hypothetical)');
});

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

test('switching classes rebuilds the bar in the visible class when Classroom retains the old page', async t => {
    const page = await openFixture(t, {nested: true, initialCount: 3});
    await waitUntilReady(page, 3);
    await page.locator('.what-if-input').first().fill('100');
    await page.evaluate(() => {
        window.__fixture.cancel();
        const previous = document.createElement('section');
        previous.id = 'previous-class';
        document.querySelector('#scroller').id = 'previous-scroller';
        for (const element of [...document.querySelectorAll('body > header, body > .ZnooZb, body > main')]) {
            previous.appendChild(element);
        }
        previous.hidden = true;
        document.body.prepend(previous);
        localStorage.setItem('gclass_weights_second', 'UNWEIGHTED');
        history.pushState({}, '', '/c/second/sp/all');
        const current = document.createElement('section');
        current.id = 'current-class';
        current.hidden = true;
        current.innerHTML = '<header><span jsname="V67aGc">80%</span></header>' +
            '<div class="ZnooZb" id="current-filters">Assignment filters</div><main><div id="scroller"></div></main>';
        document.body.appendChild(current);
        window.__installFixture({nested: true, initialCount: 4, batches: [{delay: 250, count: 1}]});
        setTimeout(() => { current.hidden = false; }, 150);
    });
    await waitUntilReady(page, 5);
    assert.equal(await page.locator('#current-filters #what-if-impact-breakdown').count(), 1);
    assert.equal(await page.locator('#what-if-impact-breakdown').isVisible(), true);
    assert.equal(await page.locator('#previous-class .what-if-input').count(), 0);
    assert.equal(await page.locator('#current-class .what-if-input').first().inputValue(), '80');
    await page.locator('#current-class .what-if-input').first().fill('100');
    assert.equal(await page.locator('#current-class [jsname="V67aGc"]').innerText(), '84.00% (Hypothetical)');
});
