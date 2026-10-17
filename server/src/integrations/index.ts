// Interfaces for future integrations. Nothing here talks to an external service yet, and the UI
// reports each integration as "not connected" so GhostMate never claims a sync that isn't real.

export interface ExternalCalendarEvent {
  externalId: string;
  title: string;
  start: Date;
  end: Date | null;
  location?: string;
}

/** e.g. Google Calendar (OAuth + Calendar API) or a TH Köln ICS feed. */
export interface CalendarProvider {
  readonly id: string;
  listEvents(userId: string, from: Date, to: Date): Promise<ExternalCalendarEvent[]>;
}

/** e.g. Gmail drafts. Must only ever create drafts; sending stays a manual user action. */
export interface EmailDraftProvider {
  readonly id: string;
  createDraft(userId: string, draft: { to: string; subject: string; body: string }): Promise<{ draftUrl: string }>;
}

/** A documented job-search API (e.g. the Bundesagentur für Arbeit Jobsuche API). */
export interface JobSearchProvider {
  readonly id: string;
  search(query: { keywords: string; location: string; radiusKm: number }): Promise<{ title: string; company: string; url: string; location: string }[]>;
}

export const calendarProviders: CalendarProvider[] = [];
export const emailProviders: EmailDraftProvider[] = [];
export const jobSearchProviders: JobSearchProvider[] = [];

export function integrationStatus() {
  return {
    calendar: { connected: calendarProviders.length > 0, note: "Not connected. Events are stored in GhostMate only." },
    email: { connected: emailProviders.length > 0, note: "Not connected. GhostMate drafts text for you to copy and send yourself." },
    jobSearch: { connected: jobSearchProviders.length > 0, note: "Not connected. Paste job links and descriptions manually." },
    pushNotifications: { connected: false, note: "Reminders appear in the app (and as browser notifications if allowed) while GhostMate is open." },
  };
}
