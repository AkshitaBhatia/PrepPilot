# PrepPilot — UI/UX Specification

## Purpose

This document defines the UI/UX requirements for implementation.

The previously supplied reference screenshots establish the intended direction for tracker hierarchy, checkbox interaction, progress visualization, expandable sections, timer presentation, dashboard organization, and clean visual style.

They are references, not assets to copy pixel-for-pixel.

## Design Principles

- Clean
- Simple
- Modern
- Professional
- Calm
- Student-focused
- Easy to scan
- Tracker first
- AI second

Avoid excessive gradients, decoration, animation and unnecessary cards.

## Information Architecture

Dashboard → progress, study time, recent sessions, statistics

Tracker → Subjects → Chapters → Topics

Timer → Stopwatch, Pomodoro, Custom

History → Study sessions

Templates → Prebuilt + Custom

AI → Explanations, questions, insights, requested plans

Focus Mode → Focus session and supported restrictions

Settings → Account, preferences, notifications, deletion

## Primary Tracker

The Tracker is the most important screen.

Subject:

- Circular progress meter
- Percentage
- Expand/collapse
- Play
- Options

Chapter:

- Horizontal progress bar
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

## Progress

Chapter:
`completed topics / total topics × 100`

Subject:
`completed topics under subject / total topics under subject × 100`

Overall:
`completed topics / total topics × 100`

Checking a topic immediately updates all applicable progress.

## Expand/Collapse

Subjects expand into chapters. Chapters expand into topics.

Avoid overwhelming the student with a fully expanded syllabus by default.

## Empty States

Tracker:
"No subjects yet. Add a subject or choose a template to get started."

History:
"No study sessions yet. Start a timer to begin building your study history."

Templates:
"Choose a syllabus template to get started."

AI:
"Ask PrepPilot anything about a topic you're studying."

## Loading/Error

All remote operations need clear feedback. Never expose raw technical errors.

## Offline UX

Tracker, timers, local sessions and local history remain usable offline.

AI clearly indicates that internet is required.

## Dashboard

Show:

- Overall progress
- Subject progress
- Today's study time
- Recent sessions
- Statistics
- Total PrepPilot study time

## Timer

Show:

- Current study item
- Mode
- Time
- Start
- Pause
- Resume
- Stop
- Reset where applicable

## History

Each session shows:

- Subject/chapter/topic
- Date/time
- Duration

## Templates

Flow:

**Browse → Preview → Confirm → Import**

Imported templates remain editable.

## AI

Quick actions:

- Explain this topic
- Quick insight
- Ask a question
- Create a study plan

If AI suggests tracker changes:

**Proposal → Preview → Confirmation → Apply**

## Notifications

Student controls title, date, time, repeat, associated item and enabled state.

## Focus Mode

Show current session, duration, permissions and supported restrictions. Never pretend unsupported restrictions are active.

## Design System

Define globally:

- Typography
- Colors
- Spacing
- Radius
- Icons
- Buttons
- Cards
- Inputs
- Checkbox
- Progress
- Timer controls
- Modals
- Empty/loading/error states

Use reusable components.

## Accessibility

Ensure adequate touch targets, readable typography, contrast, screen-reader labels and status communication that does not depend only on color.

## UI Quality Gate

A screen is complete only when:

- Layout is clean
- Typography is consistent
- Spacing is consistent
- Components are reusable
- Interactions are obvious
- Empty/loading/error states exist where needed
- Accessibility is considered
- Theme behavior is considered
- It matches the PrepPilot design system
- It does not look like a generic AI-generated template

## Required Screens

1. Splash
2. Login
3. Registration
4. OTP
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
16. History
17. Templates
18. Template preview
19. AI
20. Focus Mode
21. Notifications
22. Settings
23. Account deletion
