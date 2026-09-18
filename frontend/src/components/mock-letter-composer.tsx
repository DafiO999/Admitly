"use client";

import { useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";

type Purpose = "admissions_inquiry" | "application_follow_up" | "document_submission" | "achievement_update" | "program_question" | "general";
type VariantKind = "concise" | "balanced" | "detailed";
type Variant = { id: string; variant: VariantKind; subject: string; body: string };

const purposes: Record<Purpose, string> = {
  admissions_inquiry: "Вопрос о поступлении",
  application_follow_up: "Уточнение по заявке",
  document_submission: "Отправка документов",
  achievement_update: "Обновление достижений",
  program_question: "Вопрос о программе",
  general: "Другой вопрос",
};

const variantNames: Record<VariantKind, { title: string; note: string }> = {
  concise: { title: "Краткое", note: "Только главное" },
  balanced: { title: "Сбалансированное", note: "Оптимальная детализация" },
  detailed: { title: "Подробное", note: "Больше контекста" },
};

export function MockLetterComposer({ profileId, universityId }: {
  profileId: string; universityId: string;
}) {
  const [senderName, setSenderName] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("admissions_inquiry");
  const [context, setContext] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function selectVariant(variant: Variant) {
    setSelectedId(variant.id);
    setSubject(variant.subject);
    setBody(variant.body);
    setSent(false);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSent(false);
    try {
      const result = await apiRequest<{ variants: Variant[] }>("/letters/mock-drafts", "POST", {
        profileId, universityId, senderName: senderName.trim(), purpose,
        ...(context.trim() ? { additionalContext: context.trim() } : {}),
      });
      setVariants(result.variants);
      selectVariant(result.variants.find((item) => item.variant === "balanced") ?? result.variants[0]!);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function send() {
    setBusy(true); setError(""); setSent(false);
    try {
      await apiRequest("/letters/mock-send", "POST", {
        profileId, universityId, senderName: senderName.trim(),
        subject: subject.trim(), body: body.trim(),
      });
      setSent(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="letterStack preparedLetters">
    <form className="letterPanel letterSetup" onSubmit={(event) => void generate(event)}>
      <div className="letterPanelHead"><div><span className="stepNumber">01</span><h2>О чём хотите спросить?</h2></div><p>Gemini подготовит три варианта на основе вашего профиля.</p></div>
      <div className="letterFields letterSetupGrid">
        <label>Имя и фамилия<input required minLength={2} maxLength={120} value={senderName} onChange={(event) => setSenderName(event.target.value)} placeholder="Имя Фамилия" /></label>
        <label>Тема обращения<select value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose)}>{Object.entries(purposes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="letterContext">Дополнительный контекст <span>необязательно</span><textarea maxLength={1000} rows={3} value={context} onChange={(event) => setContext(event.target.value)} placeholder="Например: хочу уточнить требования к портфолио" /></label>
      </div>
      <button className="primary" type="submit" disabled={busy || senderName.trim().length < 2}>{busy && variants.length === 0 ? "Готовим варианты…" : variants.length ? "Подготовить заново" : "Подготовить 3 варианта →"}</button>
    </form>

    {error && <div className="alert" role="alert">{error}</div>}

    {variants.length > 0 && <>
      <section className="letterPanel variantSection">
        <div className="letterPanelHead"><div><span className="stepNumber">02</span><h2>Выберите вариант</h2></div><p>Можно отредактировать письмо перед отправкой.</p></div>
        <div className="letterVariantGrid">{variants.map((variant) => {
          const meta = variantNames[variant.variant];
          return <button type="button" key={variant.id} className={`letterVariantCard ${selectedId === variant.id ? "selected" : ""}`} aria-pressed={selectedId === variant.id} onClick={() => selectVariant(variant)}>
            <span className="variantCheck" aria-hidden="true">{selectedId === variant.id ? "✓" : ""}</span>
            <strong>{meta.title}</strong><small>{meta.note}</small><p>{variant.subject}</p>
          </button>;
        })}</div>
      </section>

      <section className="letterPanel letterPreview">
        <div className="letterPanelHead"><div><span className="stepNumber">03</span><h2>Проверьте письмо</h2></div></div>
        <div className="letterFields">
          <label>Тема<input maxLength={200} value={subject} onChange={(event) => { setSubject(event.target.value); setSent(false); }} /></label>
          <label>Текст<textarea maxLength={5000} rows={12} value={body} onChange={(event) => { setBody(event.target.value); setSent(false); }} /></label>
        </div>
        <div className="letterSendRow">
          <button className="primary" type="button" disabled={busy || !subject.trim() || !body.trim()} onClick={() => void send()}>{busy ? "Подождите…" : "Отправить письмо →"}</button>
          <span className="mailNotice"><i aria-hidden="true" /> Письмо не будет отправлено</span>
        </div>
        {sent && <p className="letterReady" role="status">Готово — письмо подготовлено.</p>}
      </section>
    </>}
  </div>;
}
