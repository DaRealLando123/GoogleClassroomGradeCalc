## For Contributing read contributing.md

### _"Why doesn’t Google add that?"_
#### Google Classroom Grade Calculator | GCGC

GCGC is a grade tool for students, allowing them to view hypothetical grades, sort assignments by worth, and more.

## Ok... But what can it do?

- [x] See hypothetical “maybe” scenarios  by changing your grades.
- [x] Easily sort your most important assignments (grade-weight-wise) and see what the minimum you need to pass.

## Note about loading grades

The official Classroom API can fetch grades without the scrolling, but would require OAuth setup, school administrator approval, and [cannot distinguish some grading states such as excused work](https://developers.google.com/workspace/classroom/guides/key-concepts/grades). This extension just uses the page without additional permissions.

## Testing

`node --test tests/grade-loader.test.cjs`.

## It should be obvious, but GCGC does not mess with actual grades. It’s purely visual with plenty of disclaimers. This is not a cheating tool in any way.

## GCGC is use at your own risk, I take no responsibility for how you use it!!!
