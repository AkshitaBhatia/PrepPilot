# PrepPilot — Product Requirements Document

**Version:** 1.0  
**Primary Platform:** Android  
**Web:** Browser-based display/demo  
**Backend:** Supabase  
**AI:** Google Gemini API  
**Core Principle:** Tracker First, AI Second

## 1. Product Vision

PrepPilot helps students understand exactly where they stand in their syllabus and how much time they have invested in studying.

Core workflow:

**Add syllabus → Track topics → Study → Record time → See progress**

AI supports the workflow but does not control it.

## 2. Goals

- Offline-first syllabus tracking.
- Subject → Chapter → Topic hierarchy.
- Accurate topic-based progress.
- Stopwatch, Pomodoro and Custom timers.
- Study-session history and total study time.
- 10+ prebuilt templates plus Custom.
- Student-controlled reminders.
- Optional Gemini AI.
- Realistic Android Focus Mode.
- Clean, simple, professional UI.
- Academic and production-quality documentation.

## 3. Non-Goals

V1 does not focus on social networking, friends, followers, leaderboards, public profiles, competitive rankings, AI-controlled decisions, automatic syllabus changes, a full LMS, or a full note-taking system.

## 4. Platforms

### Android

Full product experience: offline tracker, authentication, timers, history, notifications, Focus Mode, AI and synchronization.

### Web

Primarily demonstration, portfolio, teacher evaluation and UI showcase.

## 5. Architecture

Core:

**Android App → Local Database → Sync Layer → Supabase**

AI:

**Client → Secure Backend/API → Gemini API → Response**

The Gemini key must never be embedded in the Android app or web frontend.

## 6. Offline-First Requirements

Without internet the user must be able to:

- View subjects, chapters and topics.
- Add/edit/delete syllabus items.
- Check/uncheck topics.
- Calculate progress.
- Use timers.
- Record study sessions.
- View local history.

When connectivity returns, local changes synchronize with Supabase.

## 7. Authentication

V1:

- Email/password
- Google
- Phone number + OTP

Supabase Auth should be used where practical.

## 8. Account and Privacy

Each user may access only their own syllabus, progress, study sessions, template imports, preferences and reminders.

Use Supabase Row Level Security.

Users must be able to delete their account and associated data.

## 9. Tracker

Hierarchy:

**Subject → Chapter → Topic**

All three levels support create, edit and delete.

### Subject

- Name
- Circular progress
- Percentage
- Expand/collapse
- Play
- Options

### Chapter

- Name
- Horizontal progress bar
- Percentage
- Expand/collapse
- Play
- Options

### Topic

- Checkbox
- Name
- Completion state
- Play where appropriate
- Options

## 10. Progress System

Chapter:

`Completed Topics / Total Topics × 100`

Example: 1 of 2 = 50%.

Subject:

`All completed topics under subject / All topics under subject × 100`

Overall:

`All completed topics / All topics × 100`

Subject progress must be topic-weighted rather than a simple average of chapter percentages.

A chapter with zero topics must display an appropriate empty state rather than misleading progress.

Checking a topic immediately updates topic, chapter, subject, overall and relevant dashboard statistics.

## 11. Timer

Every relevant Subject, Chapter and Topic can open an associated timer.

Modes:

- Stopwatch
- Pomodoro
- Custom

Study sessions store:

- User
- Subject
- Chapter when applicable
- Topic when applicable
- Start time
- End time
- Duration
- Timer mode
- Status

## 12. History and Dashboard

History shows what was studied, when, duration and related subject/chapter/topic.

Dashboard shows:

- Overall syllabus progress
- Subject progress
- Today's study time
- Recent study sessions
- Statistics
- Total time studied using PrepPilot

## 13. Templates

Mandatory initial templates:

1. JEE
2. NEET-PG
3. NEET-UG
4. IIT JAM
5. CBSE Class 10
6. CBSE Class 12 PCM
7. CBSE Class 12 PCB
8. CBSE Class 12 PCMB
9. CBSE Class 12 Commerce
10. CBSE Class 12 Humanities
11. Additional template
12. Additional template
13. Additional template

Also provide a Custom option.

Flow:

**Template Library → Preview → Import → Tracker**

Imported templates remain fully editable.

## 14. AI

Google Gemini API is the AI provider.

Possible features:

- Topic explanations
- Quick insights
- Academic questions
- Concept clarification
- User-requested study plans

AI is secondary and online-only.

AI must not automatically:

- Mark topics complete
- Delete topics
- Change syllabus
- Create mandatory schedules

If AI proposes tracker changes:

**AI Proposal → User Review → Confirmation → Apply**

## 15. Gemini Security

The Gemini API key must be server-side only.

Recommended:

**Client → Secure Backend Endpoint → Gemini API**

Use environment/server secrets. Never commit keys to Git.

## 16. Notifications

Students create their own alarms/reminders.

Fields:

- Title
- Date
- Time
- Repeat
- Related subject/chapter/topic where applicable
- Enabled/disabled

PrepPilot should not create intrusive automatic schedules.

## 17. Focus Mode

Use realistic Android capabilities and permissions.

Flow:

**Start → Configure → Permissions → Focus Session → End**

Never claim universal app blocking. Document device/API limitations.

## 18. Social

No social features in V1.

## 19. UI/UX Requirements

UI/UX is a first-class product requirement.

Design direction:

- Clean
- Simple
- Modern
- Professional
- Calm
- Student-focused
- Portfolio-worthy

The supplied reference screenshots establish the intended direction for syllabus hierarchy, subject cards, expandable sections, checkbox interaction, circular progress, chapter progress bars, timer presentation, dashboard organization, clean spacing and visual hierarchy.

They are visual references, not assets to copy pixel-for-pixel.

Design process:

**PRD → UI/UX Specification → Wireframes → Design System → Components → Screens → Interaction Testing → Polish**

Maintain `UI_UX_SPECIFICATION.md`.

### Design System

Define:

- Typography
- Colors
- Spacing
- Border radius
- Icons
- Buttons
- Cards
- Inputs
- Checkbox
- Progress
- Timer controls
- Modals
- Empty/loading/error states

### Tracker UX

The Tracker is the primary screen.

Subject:

- Circular progress
- Percentage
- Expand/collapse
- Play
- Options

Chapter:

- Progress bar
- Percentage
- Expand/collapse
- Play
- Options

Topic:

- Checkbox
- Name
- Completion state
- Play where appropriate
- Options

Visual hierarchy:

**Subject → Circular Progress**  
**Chapter → Progress Bar**  
**Topic → Checkbox**

### Required Interaction

Checking a topic immediately updates:

1. Topic state
2. Chapter progress
3. Subject progress
4. Overall progress
5. Relevant dashboard statistics

### UI Quality

A screen is not complete merely because it functions. Verify:

- Clean layout
- Consistent typography
- Consistent spacing
- Reusable components
- Obvious interactions
- Empty/loading/error states
- Accessibility
- Theme behavior
- PrepPilot design-system consistency
- No generic AI-generated dashboard appearance

## 20. Required Screens

1. Splash
2. Login
3. Registration
4. OTP verification
5. Dashboard
6. Tracker
7. Subject expanded
8. Chapter expanded
9. Add subject
10. Add chapter
11. Add topic
12. Edit content
13. Timer
14. Pomodoro
15. Custom timer
16. Study history
17. Templates
18. Template preview
19. AI assistant
20. Focus Mode
21. Notifications/reminders
22. Profile/settings
23. Account deletion

## 21. Data Model

Local database:

- User/session
- Subjects
- Chapters
- Topics
- Study sessions
- Reminders
- Preferences
- Sync state

Suggested Supabase tables:

- profiles
- subjects
- chapters
- topics
- study_sessions
- reminders
- templates
- user_template_imports
- user_preferences

## 22. Synchronization

Sync must:

- Upload local changes.
- Download remote changes.
- Track sync status.
- Retry after network failure.
- Avoid duplicates.
- Resolve conflicts deterministically.

Use stable IDs.

## 23. Security

- Supabase RLS
- Secure authentication
- Server-side Gemini key
- Environment variables
- No secrets in Git
- User data isolation
- Secure local storage where required
- Input validation
- Authorization

## 24. Performance

Remain responsive with many subjects, chapters, hundreds of topics and large study history. Avoid reloading the entire syllabus when one topic changes.

## 25. Documentation

Maintain separate:

- Printable teacher/college documentation
- Developer documentation

Academic documentation should include problem, objectives, features, architecture, DFD, workflows, data model, technology stack, testing and future scope.

Developer documentation should include implementation architecture, database, APIs, state, offline sync, AI, security, deployment and development procedures.

## 26. DFD Requirements

Include DFD Level 0, Level 1 and Level 2 for important processes.

Use Mermaid where practical.

## 27. Required Workflows

Document:

1. Registration/login
2. Create subject
3. Add chapter
4. Add topic
5. Complete topic
6. Progress calculation
7. Start timer
8. Complete session
9. View history
10. Import template
11. Customize template
12. Ask AI
13. Create reminder
14. Start Focus Mode
15. Offline operation
16. Synchronization
17. Account deletion

## 28. Technology Stack

- React Native
- Expo
- TypeScript
- Expo Router
- Zustand or equivalent
- Reliable mobile local database
- Supabase
- PostgreSQL
- Supabase Auth
- Google Gemini API
- Secure backend/API layer
- Modern web stack
- Markdown
- Mermaid
- Git
- GitHub

The local database library should be selected during technical architecture based on Expo compatibility, performance, reliability and synchronization support.

## 29. MVP

Critical:

- Android foundation
- Authentication
- Offline tracker
- Subject/Chapter/Topic
- CRUD
- Completion
- Progress
- Timers
- History
- Templates
- Notifications
- Dashboard

Secondary:

- Gemini
- Study planner
- Focus Mode
- Advanced analytics
- Web demonstration

## 30. Development Phases

1. Foundation
2. Design system
3. Authentication
4. Offline tracker
5. Progress engine
6. Timer
7. History/dashboard
8. Templates
9. Synchronization
10. Notifications
11. AI
12. Focus Mode
13. Web demonstration
14. Testing/polish
15. Final documentation

## 31. September Target

At least 75% of meaningful project work should be complete by September.

Priority:

1. Foundation
2. UI
3. Authentication
4. Offline tracker
5. Progress
6. Timer
7. History/dashboard
8. Templates
9. Synchronization
10. Notifications
11. AI
12. Focus Mode
13. Web
14. Testing/polish

## 32. Success Matrix

| Module           | Minimum Success Condition                               | Priority |
| ---------------- | ------------------------------------------------------- | -------- |
| Authentication   | All 3 methods work                                      | Critical |
| Offline Tracker  | Works without internet                                  | Critical |
| Subject          | CRUD + expand                                           | Critical |
| Chapter          | CRUD + expand                                           | Critical |
| Topic            | CRUD + check                                            | Critical |
| Progress         | Correct topic-based calculation                         | Critical |
| Subject Progress | Correct weighted percentage                             | Critical |
| Chapter Progress | Correct topic-based percentage                          | Critical |
| Timer            | 3 modes work                                            | Critical |
| History          | Sessions recorded/viewable                              | High     |
| Total Study Time | Accurate                                                | High     |
| Templates        | 10+ available                                           | Critical |
| Custom Template  | User can build one                                      | High     |
| Template Editing | Imported templates editable                             | High     |
| Notifications    | User alarms work                                        | High     |
| AI               | Gemini assistance works                                 | Medium   |
| AI Safety        | User confirmation for changes                           | High     |
| Focus Mode       | Supported Android behavior works                        | Medium   |
| Sync             | Offline data synchronizes                               | Critical |
| Security         | User data isolated                                      | Critical |
| Web              | Demonstration interface                                 | Medium   |
| UI/UX            | Clean, consistent, reference-informed and accessible    | Critical |
| Tracker UX       | Subject → Chapter → Topic is immediately understandable | Critical |
| Progress UX      | Circular subject + chapter bars + topic checkboxes      | Critical |
| Interaction UX   | Add/edit/delete/check/expand/play are intuitive         | Critical |
| Responsive Web   | Same design system                                      | High     |
| Accessibility    | Labels, sizing, contrast                                | High     |
| Documentation    | Academic + developer docs complete                      | Critical |

## 33. Acceptance Criteria

A student must be able to:

1. Open the app.
2. Register/login using email, Google or phone OTP.
3. Create/import a syllabus.
4. View subjects.
5. Expand chapters.
6. Expand topics.
7. Check topics.
8. See chapter progress update.
9. See subject progress update.
10. See overall progress.
11. Start a timer.
12. Complete a study session.
13. View history.
14. See total study time.
15. Create reminders.
16. Use the tracker offline.
17. Synchronize after reconnecting.
18. Ask Gemini a study question.
19. Receive an AI response.
20. Use supported Focus Mode.
21. Edit the syllabus.
22. Delete the account.

## 34. Final Principle

PrepPilot should impress through clarity, accuracy, smooth interaction, useful progress visualization, consistency, professional design and reliable offline tracking.

**SIMPLE TO USE. POWERFUL UNDER THE HOOD.**
