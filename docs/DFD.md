# PrepPilot — Data Flow Diagrams

Mermaid diagrams are used so the DFDs remain editable in Markdown.

## DFD Level 0

```mermaid
flowchart LR
    Student[Student]
    PrepPilot((PrepPilot))
    Auth[Supabase Auth]
    DB[(Supabase Database)]
    AI[Gemini API]

    Student -->|Login / Tracker / Timer / AI Requests| PrepPilot
    PrepPilot -->|Authentication| Auth
    PrepPilot -->|Sync Data| DB
    PrepPilot -->|AI Request| AI
    Auth -->|Session| PrepPilot
    DB -->|Synced Data| PrepPilot
    AI -->|AI Response| PrepPilot
```

## DFD Level 1

```mermaid
flowchart TD
    Student[Student]

    AuthP[1. Authentication]
    Tracker[2. Syllabus Tracking]
    Progress[3. Progress Engine]
    Timer[4. Timer & Study Sessions]
    Templates[5. Template System]
    AI[6. AI Assistance]
    Focus[7. Focus Mode]
    Notify[8. Notifications]
    Sync[9. Synchronization]

    Local[(Local Database)]
    Cloud[(Supabase)]
    AuthDB[Supabase Auth]
    Gemini[Gemini API]

    Student --> AuthP
    Student --> Tracker
    Student --> Timer
    Student --> Templates
    Student --> AI
    Student --> Focus
    Student --> Notify

    AuthP --> AuthDB
    Tracker --> Local
    Tracker --> Progress
    Progress --> Local
    Timer --> Local
    Templates --> Local
    AI --> Gemini
    Focus --> Local
    Notify --> Local
    Local --> Sync
    Sync <--> Cloud
```

## DFD Level 2 — Topic Completion

```mermaid
flowchart TD
    Student[Student]
    Checkbox[Check Topic]
    Topic[(Topic)]
    Chapter[Chapter Progress]
    Subject[Subject Progress]
    Overall[Overall Progress]
    Local[(Local Database)]
    Sync[Sync Queue]

    Student --> Checkbox
    Checkbox --> Topic
    Topic --> Chapter
    Chapter --> Subject
    Subject --> Overall
    Topic --> Local
    Local --> Sync
```

## DFD Level 2 — Study Session

```mermaid
flowchart TD
    Student[Student]
    Start[Start Timer]
    Timer[Timer Engine]
    Session[Study Session]
    Local[(Local Database)]
    History[Study History]
    Sync[Sync Queue]
    Cloud[(Supabase)]

    Student --> Start
    Start --> Timer
    Timer --> Session
    Session --> Local
    Local --> History
    Local --> Sync
    Sync --> Cloud
```

## DFD Level 2 — AI

```mermaid
flowchart LR
    Student[Student]
    Client[PrepPilot Client]
    Backend[Secure AI Backend]
    Gemini[Gemini API]
    Response[AI Response]

    Student -->|Question / Request| Client
    Client --> Backend
    Backend --> Gemini
    Gemini --> Backend
    Backend --> Response
    Response --> Client
    Client --> Student
```

## DFD Level 2 — Synchronization

```mermaid
flowchart TD
    Local[(Local Database)]
    Queue[Pending Changes]
    Network{Internet Available?}
    Supabase[(Supabase)]
    Retry[Retry Queue]

    Local --> Queue
    Queue --> Network
    Network -->|Yes| Supabase
    Network -->|No| Retry
    Retry --> Network
    Supabase --> Local
```
