# Certification Academy: audit and Milestone 1

Audit date: 2026-10-30. Base: `claude/olbos-lms-platform-14b2bt`.

## Verified inventory and reuse

The repository has Next.js 16 / React 19 / Tailwind 4, a Fastify 5 API,
PostgreSQL 16 with Prisma 6, cookie sessions with CSRF, and a separate worker.
`request.db` scopes tenant queries; permission checks and entitlement resolution
already drive the sidebar. Course, CourseVersion, CourseModule, Lesson,
Enrollment, LessonProgress, QuestionBank, QuestionOption, Quiz, QuizAttempt and
QuizResponse already exist. Core grading supports single and multiple response.
The learner page displays assigned training but has no lesson player or quiz
delivery API. Existing certificates belong to the training-record pipeline.
Billing remains entitlement based; no new payment system is needed.

CI installs the locked pnpm dependencies, checks formatting, lint, types, unit
and PostgreSQL integration tests, and audits production dependencies. Migrations
are forward-only. Existing design tokens, components and app shell are retained.

## Gaps and sequence

1. Add version-level certification metadata, question approval and attempt
   snapshots using additive columns on existing models. No parallel LMS tables.
2. Supply an explicit instructor-only draft import and review/publication gate.
   Seed seven Week 1 lessons and twenty original questions as **drafts**. A human
   instructor must review them; generated content is never labelled human reviewed.
3. Deliver tenant-scoped catalog, self enrollment, pinned course-version reader,
   idempotent progress and server-graded practice. Serialize enrollment writes
   and freeze the question key in each attempt; never send the key before grading.
4. Reuse the existing UI for responsive course navigation and quiz feedback.
5. Test the full API workflow, ownership, tenant isolation, concurrent writes,
   approval, answer privacy and version pinning. Report actual execution results.

## Milestone boundaries

Only Week 1 is available in this milestone; the other eleven weeks are a roadmap,
not completed content. Lesson completion is distinct from certification/course
eligibility: no completion certificate is issued from this foundation. Mock exams,
adaptive readiness, labs, AI tutoring, study plans, certificates, richer authoring
and the 600-question production target remain later milestones. Core learning
does not require an AI provider or AWS account. No resources are provisioned.

## Source provenance

Official sources checked on 2026-10-30:

- https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html
- https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- https://aws.amazon.com/compliance/shared-responsibility-model/
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html
- https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions-availability-zones.html

The official blueprint is Secure 30%, Resilient 26%, High-Performing 24%,
Cost-Optimized 20%. Week 1 principally maps to objective 1.1 (secure access),
with foundational context for 2.2 (availability). Practice percentages are
independent Olbos scores, never AWS scaled scores or a guarantee of passing.

## Review and operation

Apply migrations before running the API. An instructor imports the bundled
draft through Instructor review on `/academy`, reviews every lesson, question,
option explanation and source, then explicitly approves the course version.
The import is tenant local and does not modify existing courses. Future content
revisions require a new CourseVersion; existing enrollments retain their version.
Do not edit published academy content in place. Recheck the blueprint before
publishing another version.

Self enrollment and lesson completion have separate self-scoped permissions;
built-in tenant roles receive them through the additive migration. Custom roles
require explicit administrator grants. Draft review filters course scopes and
does not grant a scoped instructor access to other courses' answer keys.

The clean web build exposed a missing dependency: `@olbos/ui/styles.css` imports
Tailwind but the UI package did not declare it. Its existing version is now
declared directly. On this Windows environment Turbopack's CSS worker fails;
webpack is the production-build fallback used for verification.

## Local verification

The shared-package/API/worker build, workspace typecheck, ESLint and Prettier
checks passed. The web production build passed with `next build --webpack`.
PostgreSQL 16 integration coverage uses a disposable database and includes
the learner workflow, approval provenance, scoped instructor review, ownership,
tenant isolation, version pinning, deadline rejection and concurrent submissions.

The built application was driven in a browser with separate demo instructor and
learner accounts: import draft → exercise local test approval → enroll → complete
one lesson → submit practice → inspect option explanations → verify persisted
14% progress on the dashboard. One correct answer and nineteen omissions scored
5%, as expected. These are disposable test fixtures, not real learner records or
human content-review evidence. A narrow mobile viewport showed no horizontal
overflow (375px content within a 375px viewport); desktop lesson layout was also
inspected. Screenshots were saved locally under the ignored `tmp/` folder.

No hosted environment was changed. Production publication still requires an
authorized human review of all seven lessons and twenty question drafts.

## Institutional interface refinement

Academy screens share a scoped visual system using existing Olbos color and
typography tokens: formal course mastheads, breadcrumb navigation, consistent
section headings, accessible primary actions, and restrained document surfaces.
The course reader provides a sticky syllabus, distinct completion indicators,
previous/next lesson navigation, readable lesson typography, learning-objective
and exercise panels, reference links, and separate practice/history sections.
Practice screens add a question navigator, answer-state labels, lettered choices,
and results summaries derived from the persisted attempt. Narrow screens stack
these areas into one column and offer a collapsible syllabus. No grading, authorization or content-review rules
are changed by this presentation update.

Refinement verification: the webpack production build, web TypeScript check,
ESLint and formatting checks passed. Browser checks confirmed previous/next
lesson navigation, the mobile syllabus toggle, all twenty question links,
navigation to question 10, and the persisted result summary. Course and results
pages had 375px content width within a 375px mobile viewport. Updated screenshots
are under `tmp/academy-institutional-*.png` in the local checkout.
