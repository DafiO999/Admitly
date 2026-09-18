"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { MockLetterComposer } from "@/components/mock-letter-composer";

type Purpose = "admissions_inquiry" | "application_follow_up" | "document_submission" | "achievement_update" | "program_question" | "general";
type Variant = { id: string; variant: "concise" | "balanced" | "detailed"; subject: string; body: string };
type Letter = { id: string; status: string; subject: string | null; body: string | null; selectedVariantId: string | null; senderName: string; replyToEmail: string };
type Attachment = { id: string; originalName: string; sizeBytes: number };
type Detail = { letter: Letter; attachments: Attachment[]; delivery: { state: string; recipientEmail?: string } };
type Contact = { email: string; sourceUrl: string; sourceStatus: string; verifiedAt: string };

const purposes: Record<Purpose, string> = {
  admissions_inquiry: "Вопрос о поступлении", application_follow_up: "Уточнение по заявке",
  document_submission: "Отправка документов", achievement_update: "Обновление достижений",
  program_question: "Вопрос о программе", general: "Другой вопрос",
};
const variantsNames = { concise: "Кратко", balanced: "Сбалансированно", detailed: "Подробно" };
const statusNames: Record<string, string> = {
  created: "Письмо создано", drafts_generated: "Черновики готовы", draft_selected: "Текст сохранён",
  ready_to_send: "Готово к отправке", sending: "Отправка выполняется", sent: "Письмо отправлено",
  failed: "Отправка не удалась", superseded: "Черновик устарел",
};

export function LetterComposer({ universityId, universityName, profileId, go }: { universityId: string; universityName: string; profileId: string; go: (path: string) => void }) {
  const [mode, setMode] = useState<"mock" | "smtp" | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [delivery, setDelivery] = useState<Detail["delivery"]>({ state: "not_sent" });
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("admissions_inquiry");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const storageKey = `admitly.letter.${profileId}.${universityId}`;

  const applyDetail = useCallback((detail: Detail) => {
    setLetter(detail.letter);
    setAttachments(detail.attachments);
    setDelivery(detail.delivery);
    setVariantId(detail.letter.selectedVariantId ?? "");
    setSubject(detail.letter.subject ?? "");
    setBody(detail.letter.body ?? "");
    setName(detail.letter.senderName);
    setEmail(detail.letter.replyToEmail);
  }, []);
  const refresh = useCallback(async (id: string) => {
    const detail = await apiRequest<Detail>(`/letters/${encodeURIComponent(id)}`);
    applyDetail(detail);
    return detail;
  }, [applyDetail]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const delivery = await apiRequest<{ mode: "mock" | "smtp" }>("/letter-delivery-mode");
        if (cancelled) return;
        setMode(delivery.mode);
        if (delivery.mode === "mock") return;
        const result = await apiRequest<{ contact: Contact }>(`/universities/${encodeURIComponent(universityId)}/admissions-contact`);
        if (cancelled) return;
        setContact(result.contact);
        const savedId = localStorage.getItem(storageKey);
        if (savedId) {
          try {
            const detail = await apiRequest<Detail>(`/letters/${encodeURIComponent(savedId)}`);
            if (!cancelled) applyDetail(detail);
          } catch (reason) {
            if (reason instanceof ApiError && reason.code === "LETTER_NOT_FOUND") localStorage.removeItem(storageKey);
            else throw reason;
          }
        }
      } catch (reason) {
        if (!cancelled) {
          if (reason instanceof ApiError && reason.code === "UNIVERSITY_EMAIL_UNAVAILABLE") setUnavailable(true);
          else setError((reason as Error).message);
        }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [universityId, storageKey, applyDetail]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  function create() {
    void run(async () => {
      const result = await apiRequest<{ letter: Letter }>(`/universities/${encodeURIComponent(universityId)}/letters`, "POST", {
        profileId, purpose, sender: { fullName: name.trim(), replyToEmail: email.trim() },
      });
      localStorage.setItem(storageKey, result.letter.id);
      setLetter(result.letter);
    });
  }
  function generate() {
    if (!letter) return;
    void run(async () => {
      const result = await apiRequest<{ variants: Variant[] }>(`/letters/${encodeURIComponent(letter.id)}/drafts`, "POST", context.trim() ? { additionalContext: context.trim() } : {});
      setVariants(result.variants);
      const preferred = result.variants.find((item) => item.variant === "balanced") ?? result.variants[0];
      if (preferred) { setVariantId(preferred.id); setSubject(preferred.subject); setBody(preferred.body); }
      await refresh(letter.id);
      if (preferred) { setVariantId(preferred.id); setSubject(preferred.subject); setBody(preferred.body); }
    });
  }
  function saveContent() {
    if (!letter || !variantId) return;
    void run(async () => {
      const result = await apiRequest<{ letter: Letter }>(`/letters/${encodeURIComponent(letter.id)}/content`, "PUT", { sourceVariantId: variantId, subject: subject.trim(), body: body.trim() });
      setLetter(result.letter);
    });
  }
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !letter) return;
    const id = letter.id;
    event.target.value = "";
    void run(async () => {
      const form = new FormData();
      form.append("file", file);
      await apiRequest(`/letters/${encodeURIComponent(id)}/attachments`, "POST", form);
      await refresh(id);
    });
  }
  function removeAttachment(id: string) {
    if (!letter) return;
    void run(async () => {
      await apiRequest(`/letters/${encodeURIComponent(letter.id)}/attachments/${encodeURIComponent(id)}`, "DELETE");
      await refresh(letter.id);
    });
  }
  function prepare() {
    if (!letter) return;
    void run(async () => { await apiRequest(`/letters/${encodeURIComponent(letter.id)}/prepare`, "POST", {}); await refresh(letter.id); });
  }
  function send() {
    if (!letter) return;
    void run(async () => {
      const keyName = `admitly.sendKey.${letter.id}`;
      const key = localStorage.getItem(keyName) ?? crypto.randomUUID();
      localStorage.setItem(keyName, key);
      try {
        await apiRequest(`/letters/${encodeURIComponent(letter.id)}/send`, "POST", {}, { "Idempotency-Key": key });
        localStorage.removeItem(keyName);
      } catch (reason) {
        const detail = await refresh(letter.id);
        if (detail.delivery.state === "failed") localStorage.removeItem(keyName);
        throw reason;
      }
      await refresh(letter.id);
    });
  }

  const canEdit = letter ? ["created", "drafts_generated", "draft_selected"].includes(letter.status) : false;
  const canEditContent = letter ? ["drafts_generated", "draft_selected"].includes(letter.status) : false;

  return <section className="letterWorkspace">
    <button className="back" onClick={() => go(`/universities/${encodeURIComponent(universityId)}`)}>← К университету</button>
    <div className="pageHead"><span className="eyebrow">Приёмная комиссия</span><h1>Письмо в {universityName}</h1><p>{mode === "mock" ? "Подготовьте обращение и выберите подходящий вариант письма." : "Адрес выбирается из проверенного контакта. Отправка доступна после выбора черновика и проверки письма."}</p></div>
    {error && <div className="alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Закрыть">×</button></div>}
    {loading && <p>Загружаем режим отправки…</p>}
    {mode === "mock" && <MockLetterComposer profileId={profileId} universityId={universityId} />}
    {unavailable && <div className="empty"><h2>Проверенный адрес пока недоступен</h2><p>Для этого университета ещё нет проверенного адреса приёмной комиссии. Письмо нельзя отправить через Admitly.</p></div>}
    {contact && <>
      <div className="sourceNote">Получатель: <b>{contact.email}</b> · {contact.sourceStatus === "official" ? "официальный" : "проверенный"} контакт · <a href={contact.sourceUrl} target="_blank" rel="noreferrer">Проверить источник ↗</a></div>
      {!letter && <div className="letterPanel"><h2>Создать письмо</h2><div className="letterFields"><label>Имя и фамилия<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Имя Фамилия" /></label><label>Адрес для ответа<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Тема обращения<select value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose)}>{Object.entries(purposes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><button className="primary" disabled={busy || !name.trim() || !email.trim()} onClick={create}>Создать письмо →</button></div>}
      {letter && <div className="letterStack">
        <div className="letterPanel"><span className="badge">{statusNames[letter.status] ?? letter.status}</span><h2>Подготовить текст</h2><p>Черновики создаются на основе сохранённого профиля и данных университета. Проверьте каждое утверждение перед отправкой.</p>{canEdit && <><label>Дополнительный вопрос или контекст<textarea maxLength={1000} value={context} onChange={(event) => setContext(event.target.value)} placeholder="Что нужно уточнить у приёмной комиссии?" /></label><button className="ghost" disabled={busy} onClick={generate}>{variants.length ? "Создать новые варианты" : "Создать варианты письма"}</button></>}</div>
        {(variants.length > 0 || letter.selectedVariantId) && <div className="letterPanel"><h2>Текст письма</h2>{variants.length > 0 && canEditContent && <div className="choiceRow">{variants.map((variant) => <button key={variant.id} className={variantId === variant.id ? "selected" : ""} aria-pressed={variantId === variant.id} onClick={() => { setVariantId(variant.id); setSubject(variant.subject); setBody(variant.body); }}>{variantsNames[variant.variant]}</button>)}</div>}<div className="letterFields"><label>Тема<input maxLength={200} value={subject} disabled={!canEditContent} onChange={(event) => setSubject(event.target.value)} /></label><label>Содержание<textarea maxLength={5000} rows={12} value={body} disabled={!canEditContent} onChange={(event) => setBody(event.target.value)} /></label></div>{canEditContent && <button className="primary" disabled={busy || !variantId || !subject.trim() || !body.trim()} onClick={saveContent}>Сохранить текст</button>}</div>}
        <div className="letterPanel"><h2>Вложения</h2><p>Поддерживаются PDF, JPEG и PNG. Вложения хранятся на сервере.</p><div className="letterAttachments">{attachments.map((item) => <div key={item.id}><span>{item.originalName} · {Math.ceil(item.sizeBytes / 1024)} КБ</span>{canEdit && <button className="textBtn" disabled={busy} onClick={() => removeAttachment(item.id)}>Удалить</button>}</div>)}</div>{canEdit && <label className="uploadControl">Добавить файл<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy} onChange={upload} /></label>}</div>
        <div className="letterPanel"><h2>Проверка и отправка</h2><p>Отправка использует выбранный сервером адрес. Статус «отправлено» означает, что почтовый сервер принял письмо.</p>{delivery.state === "accepted" || letter.status === "sent" ? <p className="positive">Письмо отправлено на {delivery.recipientEmail ?? contact.email}.</p> : <div className="letterActions"><button className="ghost" disabled={busy || !["draft_selected", "ready_to_send"].includes(letter.status)} onClick={prepare}>Проверить письмо</button><button className="primary" disabled={busy || letter.status !== "ready_to_send" || ["started", "ambiguous"].includes(delivery.state)} onClick={send}>Отправить письмо →</button><button className="textBtn" disabled={busy} onClick={() => void run(async () => { await refresh(letter.id); })}>Обновить статус</button></div>}</div>
      </div>}
    </>}
  </section>;
}
