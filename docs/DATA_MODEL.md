# PrepPilot — Data Model

## Profile

- id
- display_name
- email
- phone
- created_at
- updated_at

## Subject

- id
- user_id
- name
- description
- created_at
- updated_at
- sync_status

## Chapter

- id
- subject_id
- name
- created_at
- updated_at
- sync_status

## Topic

- id
- chapter_id
- name
- completed
- created_at
- updated_at
- sync_status

## Study Session

- id
- user_id
- subject_id
- chapter_id
- topic_id
- start_time
- end_time
- duration
- timer_mode
- status
- sync_status

## Reminder

- id
- user_id
- title
- scheduled_time
- repeat_rule
- subject_id
- chapter_id
- topic_id
- enabled
- sync_status

## Template

- id
- name
- category
- description
- version
- structure

## User Template Import

- id
- user_id
- template_id
- imported_at

## User Preference

- id
- user_id
- key
- value

## Relationships

User → Subjects → Chapters → Topics

User → Study Sessions

User → Reminders

Template → User Template Import

## Progress

Chapter = completed topics / total topics × 100

Subject = completed topics under subject / total topics under subject × 100

Overall = completed topics / total topics × 100
