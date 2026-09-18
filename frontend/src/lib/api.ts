export type StudyField = "computer_science" | "engineering" | "business" | "economics" | "design" | "other";
export type ExamStatus = "not_planned" | "planned" | "taken";
export type RoadmapStatus = "pending" | "in_progress" | "done" | "blocked";
export type SourceStatus = "official" | "verified" | "demo" | "unknown";

export interface StudentProfile {
  id?: string;
  targetCountry: "US";
  targetDegree: "bachelor";
  targetField: StudyField;
  targetIntakeYear: number;
  gpaValue: number;
  gpaScale: 4 | 5 | 10 | 100;
  englishExam?: { type: "IELTS" | "TOEFL" | "DUOLINGO"; status: ExamStatus; score?: number };
  sat?: { status: ExamStatus; score?: number };
  annualBudgetUsd: number;
  preferredStates?: string[];
  campusSize?: "small" | "medium" | "large" | "any";
}
export interface Program { key: string; name: string; field: StudyField; degree: "bachelor"; sourceStatus: SourceStatus; sourceUrl?: string }
export interface University {
  id: string; provider: "college_scorecard" | "curated" | "demo"; name: string;
  city?: string; state?: string; websiteUrl?: string; studentSize?: number; admissionRate?: number;
  tuitionOutOfStateUsd?: number; averageNetPriceUsd?: number; satMedian?: number;
  programs: Program[]; dataYear?: number; sourceUrl?: string; sourceStatus: SourceStatus;
}
export interface ScoreComponent { key: "academic" | "program" | "budget" | "preferences"; score: number; maxScore: number; reasons: string[] }
export interface Recommendation {
  universityId: string; fitScore: number; components: ScoreComponent[];
  reasonCodes: string[]; concerns: { code: string; message: string }[];
  university: University;
}
export interface Requirement {
  id: string; universityId: string; programKey?: string;
  kind: "application_deadline" | "english" | "sat_act" | "document" | "gpa" | "other";
  label: string; valueText: string; numericValue?: number; date?: string;
  sourceUrl?: string; sourceTitle?: string; sourceStatus: SourceStatus; checkedAt?: string;
}
export interface RoadmapItem {
  id: string; title: string; description?: string;
  category: "exam" | "document" | "application" | "academic" | "activity" | "research";
  dueDate?: string; priority: number; status: RoadmapStatus; dependsOnIds: string[];
  sourceUrl?: string; sourceStatus?: SourceStatus; isNextAction: boolean;
}
export interface Roadmap { id?: string; rulesVersion: string; items: RoadmapItem[]; nextActionId: string | null; selectedUniversityIds?: string[] }
export interface SourceCoverage { official: number; verified: number; demo: number; unknown: number }
export interface Plan {
  profile: StudentProfile & { id: string }; profileHash: string;
  recommendationRun: { id: string; engineVersion: string; recommendations: Recommendation[] };
  roadmap: Roadmap & { id: string; selectedUniversityIds: string[] };
  sourceCoverage: SourceCoverage;
}
export interface Diagnosis { goalSummary: string; strengths: string[]; constraints: string[]; focusNow: string[] }
export interface Comparison { university: University; recommendation: Omit<Recommendation, "university"> | null; requirements: Requirement[]; requirementsStatus: "reported" | "unknown" }

const errorMessages: Record<string, string> = {
  VALIDATION: "Проверьте введённые данные.", REQUEST_TOO_LARGE: "Запрос слишком большой.",
  NOT_FOUND: "Данные не найдены. Обновите страницу.", CONFLICT: "План изменился. Обновите страницу и повторите действие.",
  EXTERNAL_UNAVAILABLE: "Данные университетов сейчас недоступны.",
  DATABASE_UNAVAILABLE: "База данных сейчас недоступна.", INTERNAL: "Ошибка сервера. Попробуйте позже.",
};

export async function api<T>(path: string, method: "GET" | "POST" | "PUT" | "PATCH" = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", "Accept-Language": "ru" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Нет соединения с сервером. Проверьте, что API запущен.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    throw new Error(errorMessages[data?.error?.code ?? ""] ?? `Ошибка сервера (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const defaultProfile: StudentProfile = {
  targetCountry: "US", targetDegree: "bachelor", targetField: "computer_science",
  targetIntakeYear: Math.max(2028, new Date().getFullYear() + 1),
  gpaValue: 3.5, gpaScale: 4, annualBudgetUsd: 30000,
  englishExam: { type: "IELTS", status: "not_planned" }, sat: { status: "not_planned" },
  preferredStates: [], campusSize: "any",
};
