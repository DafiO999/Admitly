"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  api, defaultProfile, RECOMMENDATION_ENGINE_VERSION, type Comparison, type Diagnosis, type Plan, type Recommendation,
  type RoadmapStatus, type StudentProfile, type StudyField,
} from "@/lib/api";
import {
  componentNames, concernText, date, diagnosisLines, fields, money, place, programName,
  requirementNames, roadmapTitle, scoreSummary, stateNames, statuses, visibleProgramFields,
} from "@/lib/russian";
import { universityImage } from "@/lib/images";
import { CinematicHero } from "@/components/hero/cinematic-hero";
import { Onboarding } from "@/components/onboarding";
import { LetterComposer } from "@/components/letter-composer";

const PROFILE_KEY = "admitly.profileId";
const THEME_KEY = "admitly.theme";
const stateOptions = Object.entries(stateNames);

function readPath() { return typeof window === "undefined" ? "/" : window.location.pathname; }
function profileError(profile: StudentProfile): string | null {
  if (!Number.isInteger(profile.targetIntakeYear) || profile.targetIntakeYear < 2020 || profile.targetIntakeYear > 2100) return "Укажите год начала обучения от 2020 до 2100.";
  if (!Number.isFinite(profile.gpaValue) || profile.gpaValue < 0 || profile.gpaValue > profile.gpaScale) return "Средний балл должен быть в пределах выбранной шкалы.";
  if (!Number.isInteger(profile.annualBudgetUsd) || profile.annualBudgetUsd < 0) return "Укажите годовой бюджет в долларах США.";
  const exam = profile.englishExam;
  const max = exam?.type === "IELTS" ? 9 : exam?.type === "TOEFL" ? 120 : 160;
  const min = exam?.type === "DUOLINGO" ? 10 : 0;
  if (exam?.status === "taken" && (exam.score === undefined || !Number.isFinite(exam.score) || exam.score < min || exam.score > max)) return `Укажите корректный результат ${exam.type}.`;
  if (profile.sat?.status === "taken" && (profile.sat.score === undefined || !Number.isInteger(profile.sat.score) || profile.sat.score < 400 || profile.sat.score > 1600)) return "Результат SAT должен быть от 400 до 1600.";
  return null;
}

export function ProductApp() {
  const [path, setPath] = useState("/");
  const [profile, setProfile] = useState<StudentProfile>(defaultProfile);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const loadDiagnosis = useCallback(async (value: StudentProfile) => {
    try { const result = await api<{ diagnosis: Diagnosis }>("/diagnosis", "POST", { profile: value }); setDiagnosis(result.diagnosis); }
    catch { setDiagnosis(null); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    setPath(readPath());
    const savedTheme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    const onPop = () => setPath(readPath());
    window.addEventListener("popstate", onPop);
    const id = localStorage.getItem(PROFILE_KEY);
    if (id) {
      const savedId = id;
      async function loadPlan() {
        try {
          let value = await api<Plan>(`/plan/${encodeURIComponent(savedId)}`);
          if (cancelled) return;
          if (value.recommendationRun.engineVersion !== RECOMMENDATION_ENGINE_VERSION) {
            try {
              value = await api<Plan>("/plan/recalculate", "POST", { profile: value.profile });
            } catch (reason) {
              if (!cancelled) setError(`Не удалось обновить сохранённый подбор: ${(reason as Error).message}`);
            }
          }
          if (!cancelled) { setPlan(value); setProfile(value.profile); void loadDiagnosis(value.profile); }
        } catch (reason) { if (!cancelled) setError((reason as Error).message); }
        finally { if (!cancelled) setLoading(false); }
      }
      void loadPlan();
    } else setLoading(false);
    return () => { cancelled = true; window.removeEventListener("popstate", onPop); };
  }, [loadDiagnosis]);

  const go = (next: string) => { history.pushState({}, "", next); setPath(next); setError(""); window.scrollTo(0, 0); };
  const recommendations = plan?.recommendationRun.recommendations ?? [];
  const byId = useMemo(() => new Map(recommendations.map((row) => [row.universityId, row])), [recommendations]);
  const selected = useMemo(() => compareIds.map((id) => byId.get(id)).filter((item): item is Recommendation => Boolean(item)), [compareIds, byId]);

  async function saveProfile(next: StudentProfile) {
    const issue = profileError(next);
    if (issue) { setError(issue); return; }
    setBusy(true); setError("");
    try {
      const saved = plan?.profile.id
        ? await api<Plan>("/plan/recalculate", "POST", { profile: { ...next, id: plan.profile.id } })
        : await api<Plan>("/profile", "PUT", { profile: next });
      localStorage.setItem(PROFILE_KEY, saved.profile.id);
      setPlan(saved); setProfile(saved.profile); setCompareIds([]); setComparison(null);
      void loadDiagnosis(saved.profile);
      go("/discover");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function refreshRecommendations() {
    if (!plan) return;
    setBusy(true); setError("");
    try {
      const updated = await api<Plan>("/plan/recalculate", "POST", { profile: plan.profile });
      setPlan(updated); setProfile(updated.profile); setCompareIds([]); setComparison(null);
      void loadDiagnosis(updated.profile);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function setTask(id: string, status: RoadmapStatus) {
    if (!plan) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ roadmap: Plan["roadmap"] }>(`/roadmaps/${encodeURIComponent(plan.roadmap.id)}/items/${encodeURIComponent(id)}`, "PATCH", { status });
      setPlan({ ...plan, roadmap: result.roadmap });
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  function toggleCompare(id: string) {
    setComparison(null);
    setCompareIds((items) => items.includes(id) ? items.filter((value) => value !== id) : items.length < 3 ? [...items, id] : items);
  }
  async function loadComparison() {
    if (compareIds.length < 2 || !plan) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ comparisons: Comparison[] }>("/comparison", "POST", { profile: plan.profile, universityIds: compareIds });
      setComparison(result.comparisons);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (path === "/compare" && compareIds.length >= 2 && !comparison) void loadComparison(); }, [path, compareIds, comparison]);

  const detailId = path.startsWith("/universities/") ? decodeURIComponent(path.slice("/universities/".length)) : null;
  const detail = detailId ? byId.get(detailId) : null;
  const letterUniversityId = path.startsWith("/letters/") ? decodeURIComponent(path.slice("/letters/".length)) : null;
  const letterUniversity = letterUniversityId ? byId.get(letterUniversityId) : null;
  const nav = [
    ["/discover", "Университеты"], ["/compare", `Сравнение${compareIds.length ? ` (${compareIds.length})` : ""}`],
    ["/plan", "План"], ["/profile", "Профиль"],
  ];
  if (path === "/") return <CinematicHero onEnterProduct={() => go(plan ? "/home" : "/onboarding")} />;
  return <>
    <header className="top">
      <button className="brand" onClick={() => go("/home")} aria-label="Admitly — главная"><i />Admitly</button>
      <nav>{nav.map(([url, label]) => <button key={url} onClick={() => go(url)} className={path === url ? "active" : ""}>{label}{path === url && <span className="navActive" />}</button>)}</nav>
      <div className="topRight"><button className="themeButton" onClick={() => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem(THEME_KEY, next); }} aria-label="Сменить тему">{theme === "dark" ? "☀" : "☾"}</button></div>
    </header>
    <main className="shell">
      {error && <div className="alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Закрыть">×</button></div>}
      {loading ? <Empty title="Загружаем план" text="Подождите немного." />
        : path === "/home" ? <Home plan={plan} go={go} />
        : path === "/onboarding" ? <Onboarding key={plan?.profile.id ?? "new"} initial={profile} save={saveProfile} busy={busy} />
        : path === "/profile" ? <ProfileForm key={plan?.profile.id ?? "new"} initial={profile} save={saveProfile} busy={busy} diagnosis={diagnosis} plan={plan} />
        : path === "/discover" ? <Discover rows={recommendations} hasProfile={Boolean(plan)} go={go} selected={compareIds} toggle={toggleCompare} refresh={refreshRecommendations} busy={busy} />
        : path === "/compare" ? <Compare rows={selected} comparisons={comparison} go={go} toggle={toggleCompare} load={loadComparison} busy={busy} />
        : path === "/plan" ? <PlanPage plan={plan} setTask={setTask} busy={busy} go={go} />
        : letterUniversity && plan ? <LetterComposer key={letterUniversity.universityId} universityId={letterUniversity.universityId} universityName={letterUniversity.university.name} profileId={plan.profile.id} go={go} />
        : detail ? <UniversityPage row={detail} profile={plan!.profile} go={go} selected={compareIds.includes(detail.universityId)} toggle={toggleCompare} />
        : <Empty title="Страница не найдена" text="Вернитесь к подбору университетов." action="К подбору" onClick={() => go("/discover")} />}
    </main>
    <div className="mobileNav">{nav.map(([url, label]) => <button key={url} className={path === url ? "active" : ""} onClick={() => go(url)}>{label}</button>)}</div>
  </>;
}

function Action({ children, onClick, disabled, secondary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean }) {
  return <button className={secondary ? "ghost" : "primary"} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Empty({ title, text, action, onClick }: { title: string; text: string; action?: string; onClick?: () => void }) {
  return <div className="empty"><span className="emptyMark" /><h2>{title}</h2><p>{text}</p>{action && onClick && <Action onClick={onClick}>{action} →</Action>}</div>;
}
function PageHead({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="pageHead"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>;
}
function Home({ plan, go }: { plan: Plan | null; go: (path: string) => void }) {
  return <div className="stack home">
    <section className="intro"><span className="eyebrow">Поступление в США</span><h1>Выберите университет с ясным планом поступления</h1><p>Расскажите о своём профиле. Admitly сопоставит программы бакалавриата и бюджет, затем составит план подготовки.</p><div className="actions"><Action onClick={() => go("/profile")}>{plan ? "Обновить профиль" : "Заполнить профиль"} →</Action><Action secondary onClick={() => go(plan ? "/discover" : "/profile")}>Смотреть подбор</Action></div></section>
    <section><div className="sectionTitle"><span className="eyebrow">Как это работает</span><h2>От профиля к следующему шагу</h2></div><div className="steps">{[
      ["01", "Профиль", "Направление, оценки, экзамены и бюджет."],
      ["02", "Подбор", "Оценка соответствия по прозрачным критериям."],
      ["03", "Сравнение", "Стоимость и направления обучения рядом."],
      ["04", "План", "Задачи подготовки с сохранением прогресса."],
    ].map(([number, title, text]) => <div className="step" key={number}><span className="stepMark">{number}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
    {plan && plan.recommendationRun.recommendations.length > 0 && <section className="wide"><div className="sectionTitle"><span className="eyebrow">Рекомендации</span><h2>Варианты для начала</h2></div><div className="cards">{plan.recommendationRun.recommendations.slice(0, 3).map((row) => <UniversityCard key={row.universityId} row={row} go={go} />)}</div></section>}
    <section className="darkPanel"><h2>Выбор сделан. Дальше — по плану.</h2><p>Отмечайте выполненные задачи и следите за следующим шагом.</p><Action onClick={() => go(plan ? "/plan" : "/profile")}>{plan ? "Открыть план" : "Начать"} →</Action></section>
  </div>;
}

function ProfileForm({ initial, save, busy, diagnosis, plan }: { initial: StudentProfile; save: (profile: StudentProfile) => Promise<void>; busy: boolean; diagnosis: Diagnosis | null; plan: Plan | null }) {
  const [draft, setDraft] = useState<StudentProfile>(initial);
  const [stateToAdd, setStateToAdd] = useState("");
  const update = (values: Partial<StudentProfile>) => setDraft((current) => ({ ...current, ...values }));
  const exam = draft.englishExam ?? { type: "IELTS" as const, status: "not_planned" as const };
  const sat = draft.sat ?? { status: "not_planned" as const };
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void save(draft); }
  return <section>
    <PageHead eyebrow="Профиль" title="Ваш путь к бакалавриату" text="Подбор доступен для колледжей и университетов США. Все поля отражают данные, которые использует модель рекомендаций." />
    <form className="profileForm" onSubmit={submit}>
      <div className="formSection"><h2>Цель обучения</h2><p>Бакалавриат в колледжах и университетах США.</p><div className="fieldGrid">
        <label>Направление<select value={draft.targetField} onChange={(event) => update({ targetField: event.target.value as StudyField })}>{Object.entries(fields).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label>Год начала обучения<input type="number" min="2020" max="2100" required value={draft.targetIntakeYear} onChange={(event) => update({ targetIntakeYear: Number(event.target.value) })} /></label>
      </div></div>
      <div className="formSection"><h2>Академические данные</h2><div className="fieldGrid">
        <label>Средний балл (GPA)<input type="number" min="0" max={draft.gpaScale} step="0.01" required value={draft.gpaValue} onChange={(event) => update({ gpaValue: Number(event.target.value) })} /></label>
        <label>Шкала GPA<select value={draft.gpaScale} onChange={(event) => update({ gpaScale: Number(event.target.value) as StudentProfile["gpaScale"] })}>{[4, 5, 10, 100].map((scale) => <option key={scale} value={scale}>{scale} баллов</option>)}</select></label>
      </div></div>
      <div className="formSection"><h2>Экзамены</h2><div className="fieldGrid">
        <label>Экзамен по английскому<select value={exam.type} onChange={(event) => update({ englishExam: { type: event.target.value as typeof exam.type, status: exam.status } })}><option value="IELTS">IELTS</option><option value="TOEFL">TOEFL</option><option value="DUOLINGO">Duolingo</option></select></label>
        <label>Статус экзамена<select value={exam.status} onChange={(event) => update({ englishExam: { type: exam.type, status: event.target.value as typeof exam.status } })}><option value="not_planned">Не запланирован</option><option value="planned">Запланирован</option><option value="taken">Сдан</option></select></label>
        {exam.status === "taken" && <label>Результат {exam.type}<input type="number" step={exam.type === "IELTS" ? "0.5" : "1"} min={exam.type === "DUOLINGO" ? 10 : 0} max={exam.type === "IELTS" ? 9 : exam.type === "TOEFL" ? 120 : 160} required value={exam.score ?? ""} onChange={(event) => update({ englishExam: { ...exam, score: event.target.value === "" ? undefined : Number(event.target.value) } })} /></label>}
        <label>SAT<select value={sat.status} onChange={(event) => update({ sat: { status: event.target.value as typeof sat.status } })}><option value="not_planned">Не запланирован</option><option value="planned">Запланирован</option><option value="taken">Сдан</option></select></label>
        {sat.status === "taken" && <label>Результат SAT<input type="number" min="400" max="1600" step="1" required value={sat.score ?? ""} onChange={(event) => update({ sat: { ...sat, score: event.target.value === "" ? undefined : Number(event.target.value) } })} /></label>}
      </div></div>
      <div className="formSection"><h2>Бюджет и предпочтения</h2><div className="fieldGrid">
        <label>Годовой бюджет, USD<input type="number" min="0" step="1" required value={draft.annualBudgetUsd} onChange={(event) => update({ annualBudgetUsd: Number(event.target.value) })} /></label>
        <label>Размер кампуса<select value={draft.campusSize ?? "any"} onChange={(event) => update({ campusSize: event.target.value as StudentProfile["campusSize"] })}><option value="any">Любой</option><option value="small">Небольшой</option><option value="medium">Средний</option><option value="large">Крупный</option></select></label>
      </div><p>Предпочтительные штаты (необязательно, до 10)</p><div className="statePicker"><select aria-label="Выберите штат" value={stateToAdd} onChange={(event) => setStateToAdd(event.target.value)}><option value="">Выберите штат</option>{stateOptions.map(([code, name]) => <option key={code} value={code} disabled={draft.preferredStates?.includes(code)}>{name}</option>)}</select><button type="button" className="ghost" disabled={!stateToAdd || (draft.preferredStates?.length ?? 0) >= 10} onClick={() => { update({ preferredStates: [...(draft.preferredStates ?? []), stateToAdd] }); setStateToAdd(""); }}>Добавить штат</button></div><div className="choiceRow stateChoices">{draft.preferredStates?.map((code) => <button type="button" key={code} className="selected" onClick={() => update({ preferredStates: draft.preferredStates?.filter((item) => item !== code) })}>{stateNames[code] ?? code} ×</button>)}</div></div>
      <div className="formActions"><Action onClick={() => {}} disabled={busy}>{busy ? "Сохраняем…" : plan ? "Пересчитать план" : "Сохранить и подобрать"} →</Action></div>
    </form>
    {diagnosis && <DiagnosisView profile={initial} diagnosis={diagnosis} />}
  </section>;
}

function DiagnosisView({ profile, diagnosis }: { profile: StudentProfile; diagnosis: Diagnosis }) {
  const content = diagnosisLines(profile, diagnosis);
  return <section className="diagnosis"><div className="sectionTitle"><span className="eyebrow">Разбор профиля</span><h2>На что обратить внимание</h2></div><p>{content.summary}</p><div className="infoGrid">{content.strengths.length > 0 && <Info title="Сильные стороны" rows={content.strengths.map((line) => ["✓", line])} />}{content.constraints.length > 0 && <Info title="Что проверить" rows={content.constraints.map((line) => ["!", line])} />}{content.focus.length > 0 && <Info title="Следующие действия" rows={content.focus.map((line) => ["→", line])} />}</div></section>;
}

function UniversityCard({ row, go, selected, toggle }: { row: Recommendation; go: (path: string) => void; selected?: boolean; toggle?: (id: string) => void }) {
  const u = row.university;
  return <article className="uCard apiCard">
    <div className="cardBackdrop" style={{ backgroundImage: `url("${universityImage(u.id)}")` }} />
    <div className="cardShade" />
    <div className="cardContent">
      <div className="cardIdentity">
        <h3>{u.name}</h3>
        <p>{place(u)}</p>
      </div>
      <p className="reason">{scoreSummary(row)}</p>
      <div className="cardStats">
        <span><b>{row.fitScore}</b><small>Соответствие профилю</small></span>
        <span><b>{money(u.tuitionOutOfStateUsd)}</b><small>Обучение в год</small></span>
      </div>
      <div className="tags">{visibleProgramFields(u.programs).slice(0, 3).map((field) =>
        <span key={field}>{programName(field)}</span>)}</div>
      <div className="cardActions">
        <button className="cardPrimary" onClick={() => go(`/universities/${encodeURIComponent(u.id)}`)}>Подробнее →</button>
        {toggle && <button className="cardSecondary" onClick={() => toggle(u.id)}>{selected ? "Убрать" : "Сравнить"}</button>}
      </div>
    </div>
  </article>;
}
function Discover({ rows, hasProfile, go, selected, toggle, refresh, busy }: { rows: Recommendation[]; hasProfile: boolean; go: (path: string) => void; selected: string[]; toggle: (id: string) => void; refresh: () => Promise<void>; busy: boolean }) {
  const [query, setQuery] = useState("");
  const [max, setMax] = useState(100000);
  const filtered = rows.filter((row) => {
    const u = row.university;
    const text = `${u.name} ${u.city ?? ""} ${u.state ?? ""} ${u.programs.map((program) => fields[program.field]).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (u.tuitionOutOfStateUsd === undefined || u.tuitionOutOfStateUsd <= max);
  });
  const source = rows[0]?.university.provider === "demo" ? "Демонстрационные данные" : "Данные College Scorecard";
  return <section>
    <PageHead eyebrow="Подбор" title="Университеты под ваш профиль" text="Оценка показывает соответствие профилю, а не вероятность поступления. Уточняйте стоимость и условия на сайте университета." />
    {hasProfile && <div className="refreshBar"><span>{rows.length ? `${source} · подбор сохранён в вашем плане` : "Рекомендаций пока нет"}</span><button className="textBtn" disabled={busy} onClick={() => void refresh()}>{busy ? "Обновляем…" : "Обновить подбор ↻"}</button></div>}
    {rows.length ? <>
      <div className="search"><span className="searchIcon" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по подбору: название или город" aria-label="Поиск университетов" /></div>
      <div className="discoverGrid"><aside className="filters"><div><b>Фильтры</b><button className="textBtn" onClick={() => { setQuery(""); setMax(100000); }}>Сбросить</button></div><label>Максимальная стоимость обучения: {money(max)}<input type="range" min="0" max="100000" step="1000" value={max} onChange={(event) => setMax(Number(event.target.value))} /></label><div className="filterNote">Показаны программы бакалавриата в США по выбранному направлению.</div></aside>
        <div><div className="resultBar"><b>{filtered.length} университетов</b><span>Сначала наиболее подходящие</span></div><div className="cards results">{filtered.map((row) => <UniversityCard key={row.universityId} row={row} go={go} selected={selected.includes(row.universityId)} toggle={toggle} />)}</div>{!filtered.length && <Empty title="Ничего не найдено" text="Измените запрос или расширьте фильтр стоимости." />}</div>
      </div>
    </> : <Empty title={hasProfile ? "По этому направлению пока нет вариантов" : "Сначала заполните профиль"} text={hasProfile ? "Попробуйте другое направление или уточните профиль." : "Рекомендации рассчитываются по вашим данным."} action={hasProfile ? "Изменить профиль" : "Заполнить профиль"} onClick={() => go("/profile")} />}
  </section>;
}

function UniversityPage({ row, profile, go, selected, toggle }: { row: Recommendation; profile: StudentProfile; go: (path: string) => void; selected: boolean; toggle: (id: string) => void }) {
  const u = row.university;
  const [explained, setExplained] = useState<{ summary: string; reasons: string[]; concerns: string[] } | null>(null);
  const [explanationError, setExplanationError] = useState("");
  const costRows: [string, string][] = [
    ...(u.tuitionOutOfStateUsd === undefined ? [] : [["Обучение в год", money(u.tuitionOutOfStateUsd)] as [string, string]]),
    ...(u.averageNetPriceUsd === undefined ? [] : [["Средняя чистая стоимость", money(u.averageNetPriceUsd)] as [string, string]]),
    ...(u.studentSize === undefined ? [] : [["Число студентов", u.studentSize.toLocaleString("ru-RU")] as [string, string]]),
  ];
  const admissionRows: [string, string][] = [
    ...(u.admissionRate === undefined ? [] : [["Доля поступивших", `${Math.round(u.admissionRate * 100)}%`] as [string, string]]),
    ...(u.satMedian === undefined ? [] : [["Средний SAT", String(u.satMedian)] as [string, string]]),
    ...(u.dataYear === undefined ? [] : [["Год данных", String(u.dataYear)] as [string, string]]),
  ];
  async function explain() {
    try {
      const result = await api<{ explanation: { summary: string; reasons: string[]; concerns: string[] } }>(`/recommendations/${encodeURIComponent(u.id)}/explanation`, "POST", { profile });
      setExplained(result.explanation);
      setExplanationError("");
    } catch (reason) { setExplanationError((reason as Error).message); }
  }
  return <section>
    <button className="textBtn" onClick={() => go("/discover")}>← К результатам</button>
    <div className="detailHero">
      <div>
        <h1>{u.name}</h1>
        <p className="detailLocation">{place(u)}</p>
        <p>{programName(profile.targetField)}</p>
        <div className="actions">
          <Action onClick={() => toggle(u.id)}>{selected ? "Убрать из сравнения" : "Добавить к сравнению"}</Action>
          <button className="ghost" onClick={() => go(`/letters/${encodeURIComponent(u.id)}`)}>Написать в приёмную</button>
          {u.websiteUrl && <a className="ghost linkButton" href={u.websiteUrl} target="_blank" rel="noreferrer">Сайт университета ↗</a>}
        </div>
      </div>
      <div className="detailPhoto" style={{ backgroundImage: `linear-gradient(135deg, rgba(36, 33, 36, 0.58), rgba(213, 0, 84, 0.1)), url("${universityImage(u.id)}")` }}>
        <div className="scoreBig"><b>{row.fitScore}</b><span>из 100<small>соответствие профилю</small></span></div>
      </div>
    </div>
    <div className="analysis">
      <div>
        <h2>Почему этот вариант в подборе</h2>
        <p>Баллы отражают совпадение с профилем и не означают вероятность поступления.</p>
        <p className="positive">{scoreSummary(row)}</p>
        {row.concerns.filter((concern) => concern.code !== "REQUIREMENT_UNKNOWN").map((concern) =>
          <p className="concern" key={concern.code}>{concernText(concern.code)}</p>)}
        <button className="textBtn" onClick={() => void explain()}>{explained ? "Обновить объяснение" : "Показать объяснение"}</button>
        {explained && <div className="apiExplanation">
          <p>{explained.summary}</p>
          {explained.reasons.map((reason) => <p className="positive" key={reason}>{reason}</p>)}
          {explained.concerns.map((concern) => <p className="concern" key={concern}>{concern}</p>)}
        </div>}
        {explanationError && <p role="alert">{explanationError}</p>}
      </div>
      <div className="metrics">{row.components.map((part) => <div key={part.key}>
        <span>{componentNames[part.key]}</span><b>{part.score}/{part.maxScore}</b>
        <i><em style={{ transform: `scaleX(${part.maxScore ? part.score / part.maxScore : 0})` }} /></i>
      </div>)}</div>
    </div>
    <div className="infoGrid">
      {costRows.length > 0 && <Info title="Стоимость и размер" rows={costRows} />}
      {admissionRows.length > 0 && <Info title="Поступление" rows={admissionRows} />}
      <article className="info"><h3>Направления</h3>{visibleProgramFields(u.programs).map((field) =>
        <p key={field}><span>{programName(field)}</span></p>)}</article>
    </div>
    {u.sourceUrl && <div className="sourceNote"><a href={u.sourceUrl} target="_blank" rel="noreferrer">
      {u.provider === "college_scorecard" ? "Данные College Scorecard ↗" : "Источник данных ↗"}
    </a></div>}
    {u.sourceStatus === "demo" && <p className="demoNote">Демонстрационные данные — проверьте факты перед использованием.</p>}
  </section>;
}
function Info({ title, rows }: { title: string; rows: [string, string][] }) {
  return <article className="info"><h3>{title}</h3>{rows.map(([name, value], index) =>
    <p key={`${name}-${index}`}><span>{name}</span><b>{value}</b></p>)}</article>;
}

function Compare({ rows, comparisons, go, toggle, load, busy }: { rows: Recommendation[]; comparisons: Comparison[] | null; go: (path: string) => void; toggle: (id: string) => void; load: () => Promise<void>; busy: boolean }) {
  if (rows.length < 2) return <Empty title="Добавьте ещё университеты" text="Для сравнения нужны минимум два варианта." action="Открыть подбор" onClick={() => go("/discover")} />;
  const showNetPrice = rows.some((row) => row.university.averageNetPriceUsd !== undefined);
  const showAdmissionRate = rows.some((row) => row.university.admissionRate !== undefined);
  const showRequirements = comparisons?.some((item) => item.requirementsStatus === "reported" && item.requirements.length > 0) ?? false;
  const columnRows = `72px repeat(${4 + Number(showNetPrice) + Number(showAdmissionRate)}, minmax(55px, auto))${showRequirements ? " minmax(110px, auto)" : ""}`;
  return <section>
    <PageHead eyebrow="Сравнение" title="Сравните условия" text="Сопоставьте программы, стоимость и конкурс в выбранных университетах." />
    <div className="compareToolbar">
      <span>Выбрано: {rows.length} из 3</span>
      {showRequirements && <Action secondary onClick={() => void load()} disabled={busy}>{busy ? "Загружаем…" : "Обновить данные"}</Action>}
    </div>
    <div className="compareTable" style={{ gridTemplateColumns: `165px repeat(${rows.length}, minmax(220px, 1fr))` }}>
      <div className="compareRows" style={{ gridTemplateRows: columnRows }}>
        <b>Университет</b><b>Соответствие</b><b>Штат</b><b>Обучение</b>
        {showNetPrice && <b>Средняя чистая стоимость</b>}
        {showAdmissionRate && <b>Доля поступивших</b>}
        <b>Направления</b>
        {showRequirements && <b>Требования</b>}
      </div>
      {rows.map((row) => {
        const u = row.university;
        const facts = comparisons?.find((item) => item.university.id === u.id);
        return <div className="compareCol" key={u.id} style={{ gridTemplateRows: columnRows }}>
          <div><button className="iconButton" onClick={() => toggle(u.id)} aria-label="Убрать из сравнения">×</button><button className="tableLink" onClick={() => go(`/universities/${encodeURIComponent(u.id)}`)}>{u.name}</button></div>
          <b>{facts?.recommendation?.fitScore ?? row.fitScore}/100</b>
          <span>{u.state ? stateNames[u.state] ?? u.state : "Нет данных"}</span>
          <span>{money(u.tuitionOutOfStateUsd)}</span>
          {showNetPrice && <span>{money(u.averageNetPriceUsd)}</span>}
          {showAdmissionRate && <span>{u.admissionRate === undefined ? "Нет данных" : `${Math.round(u.admissionRate * 100)}%`}</span>}
          <span>{visibleProgramFields(u.programs).map(programName).join(", ")}</span>
          {showRequirements && <div className="requirementList">{facts?.requirementsStatus === "reported" && facts.requirements.length > 0
            ? facts.requirements.map((requirement) => <div key={requirement.id}>
              <b>{requirementNames[requirement.kind]}</b>
              <span>{requirement.valueText}</span>
              {requirement.date && <span>{date(requirement.date)}</span>}
              {requirement.sourceUrl && <a href={requirement.sourceUrl} target="_blank" rel="noreferrer">Проверить ↗</a>}
            </div>)
            : <span>Нет данных</span>}</div>}
        </div>;
      })}
    </div>
  </section>;
}

function PlanPage({ plan, setTask, busy, go }: { plan: Plan | null; setTask: (id: string, status: RoadmapStatus) => Promise<void>; busy: boolean; go: (path: string) => void }) {
  if (!plan) return <Empty title="План ещё не создан" text="Заполните профиль, чтобы получить персональный план подготовки." action="Заполнить профиль" onClick={() => go("/profile")} />;
  const universities = plan.recommendationRun.recommendations.filter((item) => plan.roadmap.selectedUniversityIds.includes(item.universityId)).map((item) => item.university);
  const next = plan.roadmap.items.find((item) => item.id === plan.roadmap.nextActionId);
  const done = plan.roadmap.items.filter((item) => item.status === "done").length;
  return <section>
    <PageHead eyebrow="План поступления" title="Подготовка по шагам" text="План составлен по наиболее подходящим рекомендациям. Выполненные задачи сохраняются при пересчёте, если условия не изменились." />
    <div className="planOverview">
      <div><span className="eyebrow">Следующее действие</span><h2>{next ? roadmapTitle(next, universities) : "Все доступные задачи выполнены"}</h2><p>{done} из {plan.roadmap.items.length} задач выполнено</p></div>
      <Action secondary onClick={() => go("/profile")}>Обновить профиль</Action>
    </div>
    <div className="selectedSchools"><b>Университеты в плане:</b>{universities.map((u) =>
      <button key={u.id} onClick={() => go(`/universities/${encodeURIComponent(u.id)}`)}>{u.name} ↗</button>)}</div>
    <div className="applicationList roadmapList">{plan.roadmap.items.map((item) => <article key={item.id} className={item.isNextAction ? "nextTask" : ""}>
      <div>
        <span className="badge">{item.isNextAction ? "Следующий шаг" : statuses[item.status]}</span>
        <h3>{roadmapTitle(item, universities)}</h3>
        {item.dueDate && <p>Срок: {date(item.dueDate)}</p>}
        {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Проверить источник ↗</a>}
      </div>
      <label>Статус<select value={item.status} disabled={busy} onChange={(event) => void setTask(item.id, event.target.value as RoadmapStatus)}>
        {Object.entries(statuses).map(([key, value]) => <option value={key} key={key}>{value}</option>)}
      </select></label>
    </article>)}</div>
  </section>;
}
