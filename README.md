## For Contributing read contributing.md

### _"Why doesn’t Google add that?"_
#### Google Classroom Grade Calculator | GCGC

GCGC is a grade tool for students, allowing them to view hypothetical grades, sort assignments by worth, and more.

## Ok... But what can it do?

- [x] See hypothetical “maybe” scenarios  by changing your grades.
- [x] Easily sort your most important assignments (grade-weight-wise) and see what the minimum you need to pass.

<<<<<<< Updated upstream
## Note about loading grades

The official Classroom API can fetch grades without the scrolling, but would require OAuth setup, school administrator approval, and [cannot distinguish some grading states such as excused work](https://developers.google.com/workspace/classroom/guides/key-concepts/grades). This extension just uses the page without additional permissions.

## Testing

`node --test tests/grade-loader.test.cjs`.
=======
## Extension menu

Open GCGC from your browser's Extensions menu, or pin it and click its toolbar icon, to see the information, Ko-fi, source code, and website links. The menu uses its own popup styles so Classroom cannot override the button colors. A subtle, semi-transparent logo appears in the bottom-left corner of the grade page. It is a passive image with no background or click behavior and is independent of the loading process.

The toolbar badge shows the number loaded for the current class only, in amber while grades load and green when loading finishes. The count resets when switching classes and excludes hidden pages retained by Classroom. The final count includes ungraded assignments. It shows `!` when loading needs attention. Pin GCGC to keep the count visible; no browser notification permission is required. No active-notification banner or popup status line is shown.

## Loading grades

The calculator waits for assignment grade data before enabling hypothetical grades. While grades are missing, it moves through overlapping sections of the list so rows in the middle can load too. It advances through new batches as they arrive, then jumps straight to the top. Assignment titles alone do not count as loaded grades: empty score placeholders and visible Classroom loading indicators keep it waiting. The calculator processes the full list once loading settles instead of rebuilding the grade bar after every batch.

Loading can be stopped. Slow requests have no fixed timeout: the calculator keeps waiting until Classroom finishes downloading data. Stopping loading or a failed download dismisses the overlay and leaves calculations disabled, with no notification. Refresh Classroom to restart loading. Navigating to another class cancels the old load. New grade data arriving after completion temporarily disables calculations while the list settles again.

The extension observes completion of Classroom's own fetch/XHR requests using Chrome's read-only `webRequest` API. Logging, error-reporting, and notification-channel endpoints are excluded so background traffic cannot keep the grade loader open. It does not change requests, read response bodies, save grades, or send data elsewhere. The permission is limited to Classroom hosts. With request coverage available and existing score data populated, the loader needs only a short rendering settle before returning to the top, instead of a fixed 1.6-second wait. Ungraded assignment titles do not force this extra delay after the list has been swept. Unfinished score placeholders and in-flight downloads still keep calculations disabled. It waits for the full response body, including overlapping and streamed downloads.

Classroom does not expose a documented end-of-list signal in its page. When request coverage is unavailable (for example, the extension started after the page loaded), or some assignment states are ambiguous, the loader retains the conservative 1.6-second check. DOM changes, unfinished scores and visible loading indicators also delay completion. This is still a heuristic for work Classroom has not yet requested or rendered; arbitrary delayed rendering, new request mechanisms, and changes to Classroom's markup require live testing. No finite automated test suite can guarantee every Classroom or connection behavior.

The official Classroom API could fetch grades without scrolling, but would require OAuth setup and consent, may require school administrator approval, and [cannot distinguish some grading states such as excused work](https://developers.google.com/workspace/classroom/guides/key-concepts/grades). This extension uses the page and request-completion metadata without requiring Google API sign-in.

## Testing

Run the dependency-free loader checks with `node --test tests/grade-loader.test.cjs`.

Request accounting, failure handling and monitor lifecycle checks run with `node --test tests/network-monitor.test.cjs`.

Browser integration checks use Playwright and a simulated Classroom page; they do not access a Google account. With Playwright available, run `node --test tests/classroom-loading.browser.cjs` (set `BROWSER_CHANNEL=msedge` to use an installed Edge browser). Also check a real class with many assignments, a slow connection, and category weights before publishing.
>>>>>>> Stashed changes

Run `node --test tests/extension-network.browser.cjs` to load the real unpacked extension and test native fetch/XHR completion against a local HTTPS fixture, including delayed bodies, concurrent requests and HTTP failures. The disposable browser maps Classroom's hostname to the local server; no real Classroom server or account is used. The fixture reports the measured delay between grade data and calculator readiness.

## It should be obvious, but GCGC does not mess with actual grades. It’s purely visual with plenty of disclaimers. This is not a cheating tool in any way.

## GCGC is use at your own risk, I take no responsibility for how you use it!!!
