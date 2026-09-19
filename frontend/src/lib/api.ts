export type StudyField = "computer_science" | "engineering" | "business" | "economics" | "design" | "other";
// Increment alongside the backend version when saved recommendation snapshots need refreshing.
export const RECOMMENDATION_ENGINE_VERSION = "1.1.0";
export type ExamStatus = "not_planned" | "planned" | "taken";
export type StudentStage = "grade_9_10" | "grade_11" | "grade_12" | "graduated";
export type RoadmapStatus = "pending" | "in_progress" | "done" | "blocked";
export type SourceStatus = "official" | "verified" | "demo" | "unknown";

export interface StudentProfile {
  id?: string;
  targetCountry: "US";
  targetDegree: "bachelor";
  targetField: StudyField;
  targetIntakeYear: number;
  studentStage: StudentStage;
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
export type PlanResponse = Plan & { accessToken?: string };
export interface Diagnosis { goalSummary: string; strengths: string[]; constraints: string[]; focusNow: string[] }
export interface Comparison { university: University; recommendation: Omit<Recommendation, "university"> | null; requirements: Requirement[]; requirementsStatus: "reported" | "unknown" }

const errorMessages: Record<string, string> = {
  VALIDATION: "Проверьте введённые данные.", REQUEST_TOO_LARGE: "Запрос слишком большой.",
  NOT_FOUND: "Данные не найдены. Обновите страницу.", CONFLICT: "План изменился. Обновите страницу и повторите действие.",
  EXTERNAL_UNAVAILABLE: "Данные университетов сейчас недоступны.",
  DATABASE_UNAVAILABLE: "База данных сейчас недоступна.", INTERNAL: "Ошибка сервера. Попробуйте позже.",
  UNIVERSITY_EMAIL_UNAVAILABLE: "У университета пока нет проверенного адреса приёмной комиссии.",
  LETTER_NOT_FOUND: "Письмо не найдено. Создайте новое письмо.",
  LETTER_NOT_EDITABLE: "Письмо больше нельзя изменить. Обновите страницу.",
  LETTER_NOT_READY: "Сначала выберите и сохраните текст письма.",
  LETTER_ALREADY_SENT: "Письмо уже отправлено.",
  LETTER_SEND_IN_PROGRESS: "Статус отправки пока неизвестен. Проверьте письмо перед повторной попыткой.",
  INVALID_REPLY_TO: "Укажите действительный адрес для ответа.",
  AI_DRAFT_GENERATION_FAILED: "Не удалось создать черновики. Проверьте настройку Gemini и попробуйте позже.",
  UNSUPPORTED_ATTACHMENT_TYPE: "Можно прикрепить PDF, JPEG или PNG.",
  ATTACHMENT_TOO_LARGE: "Файл превышает допустимый размер.",
  LETTER_ATTACHMENT_TOTAL_LIMIT: "Превышен общий размер вложений.",
  INVALID_FILE: "Не удалось загрузить файл. Проверьте его формат.",
  MAIL_PROVIDER_UNAVAILABLE: "Отправка почты сейчас недоступна.",
  MAIL_SEND_FAILED: "Не удалось подтвердить отправку. Проверьте статус письма перед повторной попыткой.",
  UNAUTHORIZED: "Доступ к этому профилю истёк. Заполните профиль заново.",
  INVALID_RESPONSE: "Сервер вернул некорректные данные. Обновите страницу и попробуйте снова.",
};

export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message); }
}

export async function apiRequest<T>(path: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", body?: unknown, headers?: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    const accessToken = typeof window === "undefined" ? null : localStorage.getItem("admitly.accessToken");
    response = await fetch(`/api${path}`, {
      method,
      headers: { ...(!(body instanceof FormData) && body !== undefined ? { "Content-Type": "application/json" } : {}), "Accept-Language": "ru", ...(accessToken ? { "X-Admitly-Access-Key": accessToken } : {}), ...headers },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Нет соединения с сервером. Проверьте, что API запущен.", "NETWORK", 0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    const code = data?.error?.code ?? "UNKNOWN";
    throw new ApiError(errorMessages[code] ?? `Ошибка сервера (${response.status}).`, code, response.status);
  }
  const data: unknown = await response.json().catch(() => null);
  if (data === null || (typeof data !== "object" && !Array.isArray(data))) {
    throw new ApiError(errorMessages.INVALID_RESPONSE!, "INVALID_RESPONSE", response.status);
  }
  return data as T;
}

export function requirePlan(value: unknown): PlanResponse {
  const candidate = value as Partial<PlanResponse> | null;
  if (!candidate || typeof candidate !== "object" || !candidate.profile || typeof candidate.profile !== "object"
    || !candidate.recommendationRun || !Array.isArray(candidate.recommendationRun.recommendations)
    || !candidate.roadmap || !Array.isArray(candidate.roadmap.items)
    || !Array.isArray(candidate.roadmap.selectedUniversityIds)) {
    throw new ApiError(errorMessages.INVALID_RESPONSE!, "INVALID_RESPONSE", 200);
  }
  return candidate as PlanResponse;
}

export async function api<T>(path: string, method: "GET" | "POST" | "PUT" | "PATCH" = "GET", body?: unknown): Promise<T> {
  return apiRequest<T>(path, method, body);
}

export const defaultProfile: StudentProfile = {
  targetCountry: "US", targetDegree: "bachelor", targetField: "computer_science",
  targetIntakeYear: Math.max(2028, new Date().getFullYear() + 1), studentStage: "grade_11",
  gpaValue: 3.5, gpaScale: 4, annualBudgetUsd: 30000,
  englishExam: { type: "IELTS", status: "not_planned" }, sat: { status: "not_planned" },
  preferredStates: [], campusSize: "any",
};
