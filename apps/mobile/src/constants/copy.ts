/**
 * User-facing copy defined by UI_UX_SPECIFICATION.md, kept in one place so the
 * wording stays consistent and is easy to review against the specification.
 */
export const emptyStateCopy = {
  tracker: {
    title: 'No subjects yet',
    description: 'Add a subject or choose a template to get started.',
  },
  history: {
    title: 'No study sessions yet',
    description: 'Start a timer to begin building your study history.',
  },
  templates: {
    title: 'Choose a syllabus template to get started.',
  },
  ai: {
    title: 'Ask PrepPilot anything about a topic you’re studying.',
  },
  chapter: {
    title: 'No topics yet',
    description: 'Add a topic to start tracking this chapter.',
  },
} as const;

export const offlineCopy = {
  /** AI is the one feature that genuinely cannot work offline (PRD §14). */
  aiRequiresInternet: 'PrepPilot needs an internet connection to answer this.',
  changesQueued: 'Saved on this device. It will sync when you are back online.',
} as const;
