"use client";

import { useState } from "react";
import type { StudentProfile, StudyField } from "@/lib/api";
import { fields, stateNames } from "@/lib/russian";

type Props = {
  initial: StudentProfile;
  save: (profile: StudentProfile) => Promise<void>;
  busy: boolean;
};

const pages = ["Цель", "Результаты", "Бюджет"] as const;

export function Onboarding({ initial, save, busy }: Props) {
  const [draft, setDraft] = useState<StudentProfile>(initial);
  const [step, setStep] = useState(0);
  const [stateToAdd, setStateToAdd] = useState("");
  const update = (values: Partial<StudentProfile>) => setDraft((current) => ({ ...current, ...values }));
  const english = draft.englishExam ?? { type: "IELTS" as const, status: "not_planned" as const };
  const sat = draft.sat ?? { status: "not_planned" as const };

  return <section className="onboard apiOnboard">
    <div className="progress"><span>Настройка профиля</span><b>{step + 1} / {pages.length}</b><div><i style={{ width: `${(step + 1) / pages.length * 100}%` }} /></div></div>
    <div className="onboardPage" key={step}>
      {step === 0 && <>
        <h1>Что ты хочешь изучать?</h1>
        <p>Admitly подбирает программы бакалавриата в США. Направление и год начала обучения влияют на рекомендации и план.</p>
        <div className="choiceRow" role="group" aria-label="Направление обучения">
          {Object.entries(fields).map(([key, label]) => <button type="button" key={key} className={draft.targetField === key ? "selected" : ""} aria-pressed={draft.targetField === key} onClick={() => update({ targetField: key as StudyField })}>{label}</button>)}
        </div>
        <div className="fieldGrid"><label>Год начала обучения<input type="number" min="2020" max="2100" value={draft.targetIntakeYear} onChange={(event) => update({ targetIntakeYear: Number(event.target.value) })} /></label></div>
      </>}
      {step === 1 && <>
        <h1>Какие у тебя результаты?</h1>
        <p>Укажи оценки и экзамены. Если экзамен ещё не сдан, результата можно не вводить.</p>
        <div className="fieldGrid">
          <label>Средний балл (GPA)<input type="number" min="0" max={draft.gpaScale} step="0.01" value={draft.gpaValue} onChange={(event) => update({ gpaValue: Number(event.target.value) })} /></label>
          <label>Шкала GPA<select value={draft.gpaScale} onChange={(event) => update({ gpaScale: Number(event.target.value) as StudentProfile["gpaScale"] })}>{[4, 5, 10, 100].map((scale) => <option key={scale} value={scale}>{scale} баллов</option>)}</select></label>
          <label>Экзамен по английскому<select value={english.type} onChange={(event) => update({ englishExam: { type: event.target.value as typeof english.type, status: english.status } })}><option value="IELTS">IELTS</option><option value="TOEFL">TOEFL</option><option value="DUOLINGO">Duolingo</option></select></label>
          <label>Статус экзамена<select value={english.status} onChange={(event) => update({ englishExam: { type: english.type, status: event.target.value as typeof english.status } })}><option value="not_planned">Не запланирован</option><option value="planned">Запланирован</option><option value="taken">Сдан</option></select></label>
          {english.status === "taken" && <label>Результат {english.type}<input type="number" min={english.type === "DUOLINGO" ? 10 : 0} max={english.type === "IELTS" ? 9 : english.type === "TOEFL" ? 120 : 160} step={english.type === "IELTS" ? "0.5" : "1"} value={english.score ?? ""} onChange={(event) => update({ englishExam: { ...english, score: event.target.value ? Number(event.target.value) : undefined } })} /></label>}
          <label>SAT<select value={sat.status} onChange={(event) => update({ sat: { status: event.target.value as typeof sat.status } })}><option value="not_planned">Не запланирован</option><option value="planned">Запланирован</option><option value="taken">Сдан</option></select></label>
          {sat.status === "taken" && <label>Результат SAT<input type="number" min="400" max="1600" value={sat.score ?? ""} onChange={(event) => update({ sat: { ...sat, score: event.target.value ? Number(event.target.value) : undefined } })} /></label>}
        </div>
      </>}
      {step === 2 && <>
        <h1>Какой бюджет тебе подходит?</h1>
        <p>Укажи годовой бюджет в долларах США. Штаты и размер кампуса можно оставить без предпочтений.</p>
        <div className="fieldGrid">
          <label>Годовой бюджет, USD<input type="number" min="0" step="1" value={draft.annualBudgetUsd} onChange={(event) => update({ annualBudgetUsd: Number(event.target.value) })} /></label>
          <label>Размер кампуса<select value={draft.campusSize ?? "any"} onChange={(event) => update({ campusSize: event.target.value as StudentProfile["campusSize"] })}><option value="any">Любой</option><option value="small">Небольшой</option><option value="medium">Средний</option><option value="large">Крупный</option></select></label>
        </div>
        <div className="onboardStates"><label>Предпочтительный штат<select value={stateToAdd} onChange={(event) => setStateToAdd(event.target.value)}><option value="">Выберите штат</option>{Object.entries(stateNames).map(([code, name]) => <option key={code} value={code} disabled={draft.preferredStates?.includes(code)}>{name}</option>)}</select></label><button type="button" className="ghost" disabled={!stateToAdd || (draft.preferredStates?.length ?? 0) >= 10} onClick={() => { update({ preferredStates: [...(draft.preferredStates ?? []), stateToAdd] }); setStateToAdd(""); }}>Добавить</button></div>
        <div className="choiceRow stateChoices">{draft.preferredStates?.map((code) => <button type="button" key={code} className="selected" onClick={() => update({ preferredStates: draft.preferredStates?.filter((item) => item !== code) })}>{stateNames[code] ?? code} ×</button>)}</div>
      </>}
    </div>
    <footer><button type="button" className="back" disabled={step === 0} onClick={() => setStep(step - 1)}>Назад</button><button type="button" className="primary" disabled={busy} onClick={() => step === pages.length - 1 ? void save(draft) : setStep(step + 1)}>{busy ? "Сохраняем…" : step === pages.length - 1 ? "Показать университеты →" : "Продолжить →"}</button></footer>
  </section>;
}
