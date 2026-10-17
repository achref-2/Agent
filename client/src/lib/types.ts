export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Category = "university" | "german" | "job" | "admin" | "personal" | "other";

export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  memoryEnabled: boolean;
  profile: { headline: string; background: string; skills: string[]; languages: string; location: string };
  german: { level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"; goals: string; explanationLanguage: "en" | "fr" | "tn" };
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  dueTime: string | null;
  reminderAt: string | null;
  reminderSentAt: string | null;
  source: string;
  documentId: string | null;
  applicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  notes: string;
  category: Category;
  recurring: boolean;
}

export interface ToolActivity {
  name: string;
  input: unknown;
  ok: boolean;
  summary: string;
  pendingActionId: string | null;
}

export interface ChatMessage {
  _id?: string;
  role: "user" | "assistant";
  content: string;
  toolActivity?: ToolActivity[];
  meta?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  scenario?: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export type AppStatus = "saved" | "preparing" | "applied" | "interview" | "rejected" | "offer";

export interface JobApplication {
  id: string;
  company: string;
  title: string;
  url: string;
  location: string;
  employmentType: string;
  status: AppStatus;
  appliedDate: string | null;
  followUpDate: string | null;
  contact: { name: string; email: string; phone: string };
  notes: string;
  description: string;
  requirements: { summary: string; mustHave: string[]; niceToHave: string[]; languages: string[] };
  fitAnalysis: FitAnalysis | null;
  drafts: { _id: string; kind: string; language: string; content: string; createdAt: string }[];
  updatedAt: string;
}

export interface FitAnalysis {
  overallFit: "strong" | "moderate" | "weak" | "unclear";
  matches: { requirement: string; evidence: string }[];
  gaps: { requirement: string; suggestion: string }[];
  unclear: string[];
  priorityAdvice: string;
  talkingPoints: string[];
  generatedAt?: string;
}

export interface Doc {
  id: string;
  title: string;
  kind: "lecture" | "admin" | "job" | "other";
  course: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileId: string | null;
  pageCount: number;
  textLength: number;
  emptyPages: number[];
  status: "ready" | "needs_ocr" | "failed";
  statusMessage: string;
  summary: string;
  analysis?: AdminAnalysis | null;
  createdAt: string;
}

export interface AdminAnalysis {
  plainEnglishSummary: string;
  sender: string | null;
  documentType: string;
  purpose: string;
  facts: { statement: string; quote: string; page: number | null; verified: boolean }[];
  interpretations: { statement: string; confidence: "high" | "medium" | "low" }[];
  deadlines: { date: string | null; description: string; quote: string; verified: boolean }[];
  actions: { title: string; dueDate: string | null; priority: Priority; reason: string }[];
  requiredDocuments: string[];
  uncertainties: string[];
  draftReplyGerman: string | null;
  draftReplyEnglish: string | null;
  generatedAt: string;
  model: string;
}

export interface Memory {
  id: string;
  category: string;
  content: string;
  source: "user" | "assistant";
  updatedAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AiStatus {
  provider: string;
  configured: boolean;
  model: string | null;
  devMock: boolean;
}
