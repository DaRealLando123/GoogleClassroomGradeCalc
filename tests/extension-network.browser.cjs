// Runs the unpacked extension against a local server mapped to Classroom's host.
// No Google account, remote Classroom server, or real grade data is used.
const assert = require('node:assert/strict');
const https = require('node:https');
const crypto = require('node:crypto');
const path = require('node:path');
const {before, after, test} = require('node:test');
const {chromium} = require('playwright');

let context;
let server;
let baseURL;
let sequence = 0;

function testCertificate() {
    // Generate a disposable certificate in memory; Classroom's HSTS requires HTTPS.
    function der(tag, ...parts) {
        const body = Buffer.concat(parts.map(part => Buffer.isBuffer(part) ? part : Buffer.from(part)));
        const length = body.length < 128 ? Buffer.from([body.length]) : (() => {
            const bytes = [];
            for (let size = body.length; size; size >>>= 8) bytes.unshift(size & 255);
            return Buffer.from([128 | bytes.length, ...bytes]);
        })();
        return Buffer.concat([Buffer.from([tag]), length, body]);
    }
    const sequence = (...parts) => der(0x30, ...parts);
    const {privateKey, publicKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
    const algorithm = sequence(der(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 1, 1, 11]), der(0x05));
    const name = sequence(der(0x31, sequence(der(0x06, [0x55, 4, 3]), der(0x0c, 'classroom.google.com'))));
    const body = sequence(der(0xa0, der(0x02, [2])), der(0x02, [1]), algorithm, name,
        sequence(der(0x17, '200101000000Z'), der(0x17, '400101000000Z')), name,
        publicKey.export({type: 'spki', format: 'der'}));
    const certificate = sequence(body, algorithm, der(0x03, [0], crypto.sign('sha256', body, privateKey)));
    return {
        key: privateKey.export({type: 'pkcs8', format: 'pem'}),
        cert: '-----BEGIN CERTIFICATE-----\n' + certificate.toString('base64').match(/.{1,64}/g).join('\n') +
            '\n-----END CERTIFICATE-----\n'
    };
}

function fixtureHTML(id, config) {
    return `<!doctype html><html><head><style>
        body { margin: 0; font: 16px Arial; }
        .assignment { height: 300px; padding: 12px; box-sizing: border-box; }
        .ZnooZb { height: 50px; }
    </style></head><body>
        <header><span jsname="V67aGc">80%</span></header><div class="ZnooZb"></div>
        <main role="main"><div id="assignments"></div></main>
        <script>
            localStorage.setItem('gclass_weights_${id}', 'UNWEIGHTED');
            window.__fixture = {ready: false, premature: false, dataAt: null, readyAt: null};
            const rows = document.getElementById('assignments');
            const settings = ${JSON.stringify(config)};
            function appendRows(count) {
                for (let i = 0; i < count; i++) {
                    const id = rows.children.length + 1;
                    const ungraded = settings.ungradedEvery && id % settings.ungradedEvery === 0;
                    const row = document.createElement('div');
                    row.className = 'assignment';
                    row.setAttribute('role', 'listitem');
                    row.innerHTML = '<h2 jsname="rQC7Ie" aria-label="Assignment '+id+'">Assignment '+id+'</h2>' +
                        (ungraded ? '<span>Not graded</span>' : '<div class="K9DItd"><span class="wyQ9e">80</span> / 100</div>');
                    rows.appendChild(row);
                }
            }
            appendRows(settings.initialCount || 3);
            new MutationObserver(() => {
                if (document.querySelector('.what-if-input:not(:disabled)')) {
                    if (!window.__fixture.ready) window.__fixture.premature = true;
                    window.__fixture.readyAt ??= performance.now();
                }
            }).observe(document.body, {childList: true, subtree: true});
            async function request(delay) {
                const url = '/test-data?delay=' + delay + '&status=' + (settings.status || 200) +
                    '&stream=' + (settings.stream ? 1 : 0);
                if (settings.xhr) return new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', url);
                    xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error('HTTP error'));
                    xhr.onerror = () => reject(new Error('Download failed'));
                    xhr.send();
                });
                const response = await fetch(url);
                if (!response.ok) throw new Error('HTTP error');
                await response.json();
            }
            if (settings.background) {
                fetch('/log?stream=1').then(response => response.text()).catch(() => {});
            }
            if (settings.delays?.length) {
                Promise.all(settings.delays.map(request)).then(() => {
                    appendRows(2);
                    window.__fixture.dataAt = performance.now();
                    window.__fixture.ready = true;
                }).catch(() => { window.__fixture.failed = true; });
            } else {
                window.__fixture.dataAt = performance.now();
                window.__fixture.ready = true;
            }
        </script>
    </body></html>`;
}

before(async () => {
    server = https.createServer(testCertificate(), (request, response) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/log') {
            response.writeHead(200, {'Content-Type': 'text/plain'});
            response.write('Background connection remains open');
            return;
        }
        if (url.pathname === '/test-data') {
            const delay = Number(url.searchParams.get('delay'));
            response.writeHead(Number(url.searchParams.get('status')), {'Content-Type': 'application/json'});
            if (url.searchParams.get('stream') === '1') response.write('{"complete":');
            const timer = setTimeout(() => {
                response.end(url.searchParams.get('stream') === '1' ? 'true}' : '{"complete":true}');
            }, delay);
            response.on('close', () => clearTimeout(timer));
            return;
        }
        if (url.pathname.includes('/sp/')) {
            const id = url.pathname.split('/')[2];
            const config = JSON.parse(url.searchParams.get('config') || '{}');
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.end(fixtureHTML(id, config));
            return;
        }
        response.writeHead(204);
        response.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseURL = `https://classroom.google.com:${server.address().port}`;
    const root = path.join(__dirname, '..');
    const channel = process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
    context = await chromium.launchPersistentContext('', {
        headless: true,
        ignoreHTTPSErrors: true,
        ...(channel === 'chromium' ? {} : {channel}),
        args: ['--disable-extensions-except=' + root, '--load-extension=' + root,
            '--host-resolver-rules=MAP classroom.google.com 127.0.0.1', '--no-proxy-server']
    });
    if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
});

after(async () => {
    await context?.close();
    if (server) await new Promise(resolve => server.close(resolve));
});

async function openFixture(t, config) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => {
        await page.close();
        assert.deepEqual(errors, []);
    });
    const id = 'network' + (++sequence);
    await page.goto(`${baseURL}/c/${id}/sp/all?config=${encodeURIComponent(JSON.stringify(config))}`);
    return page;
}

async function waitReady(page, count) {
    await page.waitForFunction(expected => !document.getElementById('what-if-load-status') &&
        document.querySelectorAll('.what-if-input:not(:disabled)').length === expected, count, {timeout: 15000});
}

async function readBadge(page) {
    return context.serviceWorkers()[0].evaluate(async url => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(candidate => candidate.url === url);
        return chrome.action.getBadgeText({tabId: tab.id});
    }, page.url());
}

test('the actual extension finishes an already-loaded class without the 1.6-second delay', async t => {
    const page = await openFixture(t, {});
    // A worker may start after the very first navigation. Verify the fast path
    // on a navigation it can observe from the beginning, as required in production.
    await page.reload();
    await waitReady(page, 3);
    const result = await page.evaluate(() => ({...window.__fixture, top: scrollY}));
    assert.equal(result.premature, false);
    assert.equal(result.top, 0);
    assert.equal(await readBadge(page), '3');
    assert.equal(await page.locator('#what-if-active-notice').count(), 0);
    const logo = page.getByRole('img', {name: 'GCGC', exact: true});
    assert.equal(await logo.count(), 1);
    const appearance = await logo.evaluate(image => ({
        background: getComputedStyle(image).backgroundColor,
        opacity: getComputedStyle(image).opacity,
        left: getComputedStyle(image).left,
        bottom: getComputedStyle(image).bottom
    }));
    assert.deepEqual(appearance, {background: 'rgba(0, 0, 0, 0)', opacity: '0.55', left: '12px', bottom: '12px'});
    const overhead = result.readyAt - result.dataAt;
    t.diagnostic(`Already-loaded class: ${overhead.toFixed(0)} ms until calculator ready`);
    assert.ok(overhead < 1200, `expected removal of fixed 1600ms delay, measured ${overhead}ms`);
});

test('ungraded assignments do not add a final 1.6-second stall', async t => {
    const page = await openFixture(t, {initialCount: 6, ungradedEvery: 3});
    await page.reload();
    await waitReady(page, 4);
    const result = await page.evaluate(() => ({...window.__fixture, top: scrollY}));
    assert.equal(result.premature, false);
    assert.equal(result.top, 0);
    assert.equal(await readBadge(page), '6');
    const overhead = result.readyAt - result.dataAt;
    t.diagnostic(`Class with ungraded assignments: ${overhead.toFixed(0)} ms until calculator ready`);
    assert.ok(overhead < 1200, `ungraded assignments triggered a final stall of ${overhead}ms`);
    await page.locator('.what-if-input').first().fill('100');
    assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '85.00% (Hypothetical)');
});

test('an open background logging connection does not hold ready grades behind the loading screen', async t => {
    const page = await openFixture(t, {background: true});
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('what-if-load-status') &&
        document.querySelectorAll('.what-if-input:not(:disabled)').length === 3, null, {timeout: 2200});
    assert.equal(await page.evaluate(() => window.__fixture.premature), false);
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.locator('#what-if-donate-anchor').count(), 0);
});

test('class switching shows only the current class count and restores its visible bar', async t => {
    const page = await openFixture(t, {});
    await waitReady(page, 3);
    assert.equal(await readBadge(page), '3');
    const originalPath = new URL(page.url()).pathname;
    await page.locator('.what-if-input').first().fill('100');
    await page.evaluate(() => {
        const previous = document.createElement('section');
        previous.id = 'previous-class';
        for (const element of [...document.querySelectorAll('body > header, body > .ZnooZb, body > main')]) {
            previous.appendChild(element);
        }
        previous.hidden = true;
        document.body.prepend(previous);
        localStorage.setItem('gclass_weights_second', 'UNWEIGHTED');
        history.pushState({}, '', '/c/second/sp/all');
        const current = document.createElement('section');
        current.id = 'current-class';
        current.innerHTML = '<header><span jsname="V67aGc">80%</span></header>' +
            '<div class="ZnooZb" id="current-filters"></div><main role="main">' +
            [1, 2, 3, 4, 5].map(id => '<div class="assignment" role="listitem">' +
                '<h2 jsname="rQC7Ie" aria-label="Assignment ' + id + '">Assignment ' + id + '</h2>' +
                '<div class="K9DItd"><span class="wyQ9e">80</span> / 100</div></div>').join('') + '</main>';
        document.body.appendChild(current);
    });
    await waitReady(page, 5);
    assert.equal(await readBadge(page), '5');
    assert.equal(await page.locator('#current-filters #what-if-impact-breakdown').isVisible(), true);
    assert.equal(await page.locator('#current-class .what-if-input').first().inputValue(), '80');
    await page.evaluate(originalPath => {
        history.pushState({}, '', originalPath);
        document.querySelector('#current-class').hidden = true;
        document.querySelector('#previous-class').hidden = false;
    }, originalPath);
    await waitReady(page, 3);
    assert.equal(await readBadge(page), '3');
    assert.equal(await page.locator('#previous-class #what-if-impact-breakdown').isVisible(), true);
    assert.equal(await page.locator('#previous-class .what-if-input').first().inputValue(), '100');
});

for (const config of [
    {delays: [2400]},
    {delays: [2400], xhr: true},
    {delays: [200, 2400]},
    {delays: [2400], stream: true}
]) {
    test(`waits for full native ${config.xhr ? 'XHR' : config.stream ? 'streamed fetch' : config.delays.length > 1 ? 'overlapping fetches' : 'fetch'} downloads on a slow connection`, async t => {
        const page = await openFixture(t, config);
        await page.waitForTimeout(1750);
        assert.equal(await readBadge(page), '3');
        assert.equal(await page.locator('.what-if-input:not(:disabled)').count(), 0);
        assert.equal(await page.evaluate(() => window.__fixture.ready), false);
        await waitReady(page, 5);
        const result = await page.evaluate(() => ({...window.__fixture, top: scrollY}));
        assert.equal(result.premature, false);
        assert.equal(result.top, 0);
        const overhead = result.readyAt - result.dataAt;
        t.diagnostic(`After final grade data: ${overhead.toFixed(0)} ms until calculator ready`);
        assert.ok(overhead < 1000, `slow transfer must not add a second long wait: ${overhead}ms`);
        await page.locator('.what-if-input').first().fill('100');
        assert.equal(await page.locator('[jsname="V67aGc"]').innerText(), '84.00% (Hypothetical)');
    });
}

test('a failed native request dismisses loading without notifications or incomplete grades', async t => {
    const page = await openFixture(t, {delays: [300], status: 503});
    await page.waitForFunction(() => window.__fixture.failed && !document.getElementById('what-if-load-status'));
    assert.equal(await readBadge(page), '!');
    assert.equal(await page.locator('.what-if-input, #what-if-impact-breakdown').count(), 0);
    assert.equal(await page.locator('.what-if-load-notice').count(), 0);
    assert.equal(await page.evaluate(() => window.__fixture.premature), false);
});
