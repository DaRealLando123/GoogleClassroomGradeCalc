## For Contributing read contributing.md

### _"Why doesn’t Google add that?"_
#### Google Classroom Grade Calculator | GCGC

GCGC is a grade tool for students, allowing them to view hypothetical grades, sort assignments by worth, and more.

## Ok... But what can it do?

- [x] See hypothetical “maybe” scenarios  by changing your grades.
- [x] Easily sort your most important assignments (grade-weight-wise) and see what the minimum you need to pass.

## Loading grades

The calculator waits for assignment grade data before enabling hypothetical grades. It advances through lazy-loaded batches as they arrive, then jumps straight to the top. Assignment titles alone do not count as loaded grades: empty score placeholders and visible Classroom loading indicators keep it waiting. The calculator processes the full list once loading settles instead of rebuilding the grade bar after every batch.

Loading can be stopped and retried. A 45-second timeout leaves calculations disabled; navigating to another class cancels the old load. New grade data arriving after completion temporarily disables calculations while the list settles again.

Classroom does not expose a documented end-of-list signal in its page. Completion uses a short quiet period at the bottom with no detected unfinished scores or loading indicators; this is a heuristic, and Classroom markup changes or requests without visible loading state still need live testing.

The official Classroom API could fetch grades without scrolling, but would require OAuth setup and consent, may require school administrator approval, and [cannot distinguish some grading states such as excused work](https://developers.google.com/workspace/classroom/guides/key-concepts/grades). This extension keeps using the page without additional permissions.

## Testing

Run the dependency-free loader checks with `node --test tests/grade-loader.test.cjs`.

Browser integration checks use Playwright and a simulated Classroom page; they do not access a Google account. With Playwright available, run `node --test tests/classroom-loading.browser.cjs` (set `BROWSER_CHANNEL=msedge` to use an installed Edge browser). Also check a real class with many assignments, a slow connection, and category weights before publishing.

## It should be obvious, but GCGC does not mess with actual grades. It’s purely visual with plenty of disclaimers. This is not a cheating tool in any way.

## GCGC is a use at your own risk extension, I take no responsibility for how you use it!!!
