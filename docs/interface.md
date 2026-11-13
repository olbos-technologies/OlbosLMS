# Application interface

The application uses a neutral **Learning portal** identity. The sidebar, top
bar and sign-in screen do not display the sample tenant name or the Olbos logo.
The favicon is a generic book symbol. Stored organization names, certificates
and historical training records are not renamed or rewritten by this change.

## Shared presentation

`apps/web/src/app/portal.css` styles the authenticated workspace and sign-in page
with the existing design tokens. Shared cards, tables, summary metrics, forms,
alerts and empty states have consistent spacing and readable density. Page
headers supply a consistent title, description and actions. Wide tables retain
their own horizontal scroll containers. Narrow layouts stack sections and keep
the page itself within the viewport. Certificate verification has a neutral
heading and preserves the verification result and issuing organization.

This presentation applies to Overview, Course Catalog, My Learning, Required
Training, Training Matrix, Safety Command Center, Compliance Dashboard, Employees
and the Certification Academy. The sign-in page uses the same typography,
controls and colors. Academy-specific course and assessment layouts are retained.

## Navigation and interaction

The API's permission-derived navigation remains authoritative. The renderer
removes duplicate destinations and lets users find an available page by name;
search never exposes additional destinations. Overview replaces the menu label
Command Center. Top-bar context follows the active destination.

On mobile, navigation is a labelled modal with a visible close button, Escape
dismissal, contained keyboard focus, an inert background, scroll locking and
focus return to the menu trigger. Resizing to desktop closes the drawer.

Catalog, employee and matrix search wait 250ms after typing settles. Catalog
filters can be cleared together, results announce their count, and academy
courses link to the working enrollment flow. Empty assignment states describe
the absence of assignments rather than claiming a learner completed training.

## Scope

Authentication, tenant isolation, authorization, grading, certificate integrity
and publication requirements are unchanged. This is a presentation and
interaction refinement; it does not add unsupported product features.

## Verification

The web application passes TypeScript, ESLint and a production webpack build.
Browser checks cover learner and owner navigation, catalog filtering, employee
search, matrix filters and the redesigned screens. Mobile checks confirm that
the drawer contains focus, locks background interaction and scrolling, closes
with Escape and returns focus to the trigger. These are interface checks;
they do not constitute instructor approval of academy lesson content.
