import type { Diagnosis, Program, Recommendation, Requirement, RoadmapItem, StudentProfile, StudyField, University } from "./api";

export const fields: Record<StudyField, string> = {
  computer_science: "Компьютерные науки", engineering: "Инженерия", business: "Бизнес",
  economics: "Экономика", design: "Дизайн", other: "Другое направление",
};
export const selectableFields = (Object.keys(fields) as StudyField[]).filter((field) => field !== "other");
export const studentStages: Record<StudentProfile["studentStage"], string> = {
  grade_9_10: "9–10 класс", grade_11: "11 класс", grade_12: "12 класс", graduated: "Школа окончена",
};
export const statuses = {
  pending: "Не начато", in_progress: "В работе", done: "Готово", blocked: "Нужна помощь",
} as const;
export const componentNames = {
  academic: "Академические данные", program: "Программа", budget: "Бюджет", preferences: "Предпочтения",
};
export const requirementNames: Record<Requirement["kind"], string> = {
  application_deadline: "Срок подачи", english: "Английский язык", sat_act: "SAT или ACT",
  document: "Документы", gpa: "Средний балл", other: "Другое требование",
};
export const stateNames: Record<string, string> = {
  AL: "Алабама", AK: "Аляска", AZ: "Аризона", AR: "Арканзас", CA: "Калифорния",
  CO: "Колорадо", CT: "Коннектикут", DE: "Делавэр", FL: "Флорида", GA: "Джорджия",
  HI: "Гавайи", ID: "Айдахо", IL: "Иллинойс", IN: "Индиана", IA: "Айова",
  KS: "Канзас", KY: "Кентукки", LA: "Луизиана", ME: "Мэн", MD: "Мэриленд",
  MA: "Массачусетс", MI: "Мичиган", MN: "Миннесота", MS: "Миссисипи", MO: "Миссури",
  MT: "Монтана", NE: "Небраска", NV: "Невада", NH: "Нью-Гэмпшир", NJ: "Нью-Джерси",
  NM: "Нью-Мексико", NY: "Нью-Йорк", NC: "Северная Каролина", ND: "Северная Дакота",
  OH: "Огайо", OK: "Оклахома", OR: "Орегон", PA: "Пенсильвания", RI: "Род-Айленд",
  SC: "Южная Каролина", SD: "Южная Дакота", TN: "Теннесси", TX: "Техас", UT: "Юта",
  VT: "Вермонт", VA: "Виргиния", WA: "Вашингтон", WV: "Западная Виргиния",
  WI: "Висконсин", WY: "Вайоминг",
};
export const money = (value?: number) => value === undefined ? "Нет данных" : `$${value.toLocaleString("ru-RU")}`;
export const date = (value?: string) => value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Дата не указана";
export const place = (u: University) => [u.city, u.state && (stateNames[u.state] ?? u.state), "США"].filter(Boolean).join(", ");
export const programName = (field: StudyField) => fields[field];
export function visibleProgramFields(programs: Program[]): StudyField[] {
  const unique = [...new Set(programs.map((program) => program.field))];
  const named = unique.filter((field) => field !== "other");
  return named.length ? named : unique;
}

export function concernText(code: string): string {
  const map: Record<string, string> = {
    SAT_REFERENCE_UNKNOWN: "Нет опубликованного ориентира по SAT.",
    SAT_NOT_PROVIDED: "Результат SAT пока не указан; его вклад в оценку нейтрален.",
    COST_UNKNOWN: "Уточните стоимость обучения и общие расходы у университета.",
    COST_SCOPE_LIMITED: "Указана стоимость обучения для иногородних студентов. Полная стоимость для иностранных студентов может отличаться.",
    STATE_UNKNOWN: "Штат университета не указан.",
    CAMPUS_SIZE_UNKNOWN: "Размер кампуса неизвестен.",
  };
  return map[code] ?? "Уточните данные непосредственно в университете.";
}

export function diagnosisLines(profile: StudentProfile, diagnosis: Diagnosis) {
  const normalized = Math.round(profile.gpaValue / profile.gpaScale * 4 * 100) / 100;
  return {
    summary: `Сейчас: ${studentStages[profile.studentStage].toLowerCase()}. Цель: бакалавриат по направлению «${fields[profile.targetField]}» в США, начало обучения — ${profile.targetIntakeYear} год.`,
    strengths: diagnosis.strengths.map((line) => line.includes("GPA")
      ? `Средний балл соответствует хорошему ориентиру: ${normalized} из 4.`
      : line.includes("SAT")
        ? `Результат SAT: ${profile.sat?.score ?? "не указан"}.`
        : `Результат ${profile.englishExam?.type ?? "языкового экзамена"}: ${profile.englishExam?.score ?? "не указан"}.`),
    constraints: diagnosis.constraints.map((line) => line.includes("budget")
      ? `Годовой бюджет ${money(profile.annualBudgetUsd)} ниже ориентира $25 000.`
      : normalized < 3 && line.includes("GPA")
        ? `Средний балл ${normalized} из 4 ниже ориентира 3 из 4.`
        : "В профиле пока нет результата языкового экзамена."),
    focus: diagnosis.focusNow.map((line) => line.includes("GPA")
      ? "Сверьте условия программ с текущим средним баллом."
      : line.includes("SAT")
        ? profile.sat?.status === "planned" ? "Сдайте запланированный SAT и добавьте результат." : "Проверьте, учитывают ли выбранные программы SAT."
        : line.includes("English exam") || (profile.englishExam && line.includes(profile.englishExam.type))
          ? "Запланируйте языковой экзамен и добавьте результат."
          : line.includes("budget") || line.includes("costs")
            ? "Сравните полную стоимость обучения с вашим бюджетом."
            : `Проверьте программы по направлению «${fields[profile.targetField]}» на ${profile.targetIntakeYear} год.`),
  };
}

export function roadmapTitle(item: RoadmapItem, universities: University[]): string {
  const fixed: Record<string, string> = {
    "research:programs": "Проверить выбранные программы бакалавриата",
    "document:academic-records": "Подготовить документы об образовании",
    "research:budget": "Проверить бюджет поступления",
    "research:budget-gap": "Найти варианты в пределах бюджета на обучение",
    "research:budget-limit": "Проверить расходы сверх бюджета на обучение",
    "academic:course-plan": "Спланировать предметы на следующий учебный год",
    "academic:grade-11-focus": "Укрепить академические результаты в 11 классе",
    "academic:final-year-records": "Подготовить оценки и документы выпускного класса",
    "academic:records-review": "Проверить готовые документы об образовании",
    "exam:english": "Запланировать экзамен по английскому языку",
    "exam:sat": "Сдать запланированный SAT",
  };
  if (fixed[item.id]) return fixed[item.id];
  const stageField = (Object.keys(fields) as StudyField[]).find((field) => item.id.endsWith(`:${field}`));
  if (item.id.startsWith("academic:course-plan:")) return `Спланировать предметы по направлению «${fields[stageField ?? "other"]}»`;
  if (item.id.startsWith("academic:grade-11-focus:")) return `Укрепить результаты для направления «${fields[stageField ?? "other"]}»`;
  if (item.id.startsWith("academic:final-year-records:")) return `Подготовить выпускные документы для направления «${fields[stageField ?? "other"]}»`;
  if (item.id.startsWith("academic:records-review:")) return `Проверить документы для направления «${fields[stageField ?? "other"]}»`;
  if (item.id.startsWith("activity:")) {
    const field = item.id.slice("activity:".length) as StudyField;
    return ({
      computer_science: "Сделать небольшой программный проект",
      engineering: "Описать инженерный проект",
      business: "Разобрать практический бизнес-кейс",
      economics: "Подготовить экономический анализ",
      design: "Собрать профильное дизайн-портфолио",
      other: "Подготовить профильный проект",
    })[field] ?? "Подготовить профильный проект";
  }
  const university = universities.find((u) => item.id.startsWith(`school:${u.id}:`));
  if (!university) return {
    exam: "Проверить экзамены", document: "Подготовить документы", application: "Подготовить заявку",
    academic: "Уточнить условия поступления", activity: "Выполнить задачу", research: "Проверить информацию",
  }[item.category];
  if (item.id.endsWith(":verify")) return `Уточнить условия поступления: ${university.name}`;
  if (item.id.includes(":deadline:") || item.id.endsWith(":apply")) return `Подготовить заявку: ${university.name}`;
  const kind = item.category === "exam" ? "экзамен" : item.category === "document" ? "документы" : "условия поступления";
  return `Проверить ${kind}: ${university.name}`;
}

export function scoreSummary(recommendation: Recommendation): string {
  const budget = recommendation.components.find((part) => part.key === "budget");
  if (budget?.score === budget?.maxScore) return "Программа подходит по направлению и указанному бюджету.";
  return "Программа соответствует выбранному направлению. Уточните расходы на обучение.";
}
