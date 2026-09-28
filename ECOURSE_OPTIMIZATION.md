# E-course Optimization

Implementation status: complete (September 11, 2026).

## Course authoring

- Courses support categories, tags, difficulty, duration, instructor profile,
  access duration, enrollment limits, featured placement, and SEO metadata.
- Lesson content uses the rich-text editor and supports transcripts, duration,
  previews, drip schedules, prerequisites, attachments, private PDF files, and
  private MP4/WebM video.
- Private video delivery supports authenticated HTTP Range streaming.
- Publishing validates that the curriculum has complete lessons and records a
  version snapshot. Courses can be duplicated for a new edition.

## Assessments and completion

- Each lesson can have a scored quiz with single choice, multiple choice,
  true/false, or short-text questions, passing score, and attempt limit.
- Lessons can have assignments with learner submission, instructor grading,
  score, and feedback.
- Progress tracks the current lesson, percentage, time spent, and last activity.
- Sequential learning, explicit prerequisites, drip dates, and assessment gates
  are enforced server-side.
- Course completion is calculated automatically. Eligible courses issue a
  public, revocable certificate with a verification code and printable view.

## Learner experience

- The learning area resumes the last lesson and shows locked or upcoming content.
- Learners can save private notes, bookmark lessons, join lesson discussions,
  submit assignments and quizzes, and review completed courses.
- Member accounts show progress, resume links, certificates, and bookmarks.
- Published announcements and upcoming live sessions appear in the learning area.

## Catalog and sales

- The public catalog supports search, category, difficulty, pricing, featured
  ordering, pagination, ratings, and enrollment counts.
- Course pages include instructor information, approved reviews, Course JSON-LD,
  canonical metadata, duration, level, and preview lessons.
- Paid enrollment supports Midtrans or manual payment proof and admin review.
- Coupons can be restricted to selected courses and enrollment stores immutable
  subtotal, discount, total, coupon, and checkout request snapshots.
- Access activates only after confirmed payment. Enrollment and completion email
  notifications are recorded in the notification log.

## Administration and analytics

- Admin tools cover advanced settings, categories, cohorts, bulk enrollment,
  announcements, live sessions, quizzes, assignments, and course duplication.
- Student operations include search/filter, cohort assignment, activation,
  suspension, progress reset, CSV export, grading, and manual-payment review.
- Insights include enrollments, completion rate, revenue, average study time,
  lesson drop-off, quiz performance, and review moderation.

## Workspace-wide LMS operations (28 September 2026)

- Students page lists enrollments across every course with course/status
  filters, search, progress, access, CSV export, and suspend/activate/reset.
- Adding students by hand never downgrades a completed enrollment, never
  shortens longer access, respects the enrollment limit, and sends the access
  email (`lib/lms-enrollment-rules.ts`).
- Reactivating a student grants the course's normal access period instead of
  lifetime access.
- Grading queue across every course: grade (completes the lesson) or return
  for revision with feedback (lesson stays open, learner resubmits). Graded
  work can't be resubmitted by the learner; grades can be corrected.
- Course editor uses one access-type choice: free enrollment, paid, or
  members only (optionally with a price).
- Student CSV exports neutralise spreadsheet formulas.

## Deployment checklist

- Prisma migration: `20260911130000_lms_upgrade` (applied).
- Configure SMTP to deliver lifecycle and announcement emails.
- Ensure `private/course-assets` is persistent and writable in single-instance
  deployments. Multi-instance deployments should replace local storage with an
  object-storage adapter before production scaling.
- Configure Midtrans and at least one active manual payment method when selling
  paid courses.
- Add instructor details, course SEO fields, assessment pass rules, access days,
  and certificate settings before publishing each course.

## Verification

- Prisma schema validation: passed.
- Prisma migration status: database schema is up to date.
- TypeScript: passed.
- Vitest: 200 tests passed across 37 files.
- Next.js production build: passed.
