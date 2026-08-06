"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./rede.css";

type RuntimeConfig = { url: string; key: string };
type Question = {
  code: string;
  section: string;
  sort_order: number;
  type: "single" | "multiple";
  prompt: string;
  help_text?: string | null;
  required: boolean;
  options: string[];
  condition?: { field?: string; operator?: "equals" | "not_equals"; value?: string } | null;
};
type PublicForm = {
  link: { channel: string; label?: string; intro_video_url?: string | null; thank_you_video_url?: string | null };
  questions: Question[];
};
type SubmitResult = { code: string; thank_you_video_url?: string | null };

type Phase = "loading" | "intro" | "quiz" | "thanks" | "unavailable";

let runtimeConfig: RuntimeConfig | null = null;

async function config() {
  if (runtimeConfig?.url && runtimeConfig.key) return runtimeConfig;
  const response = await fetch("/api/runtime-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Configuração indisponível.");
  const value = await response.json() as RuntimeConfig;
  runtimeConfig = { url: value.url.trim(), key: value.key.trim() };
  return runtimeConfig;
}

async function publicRpc<T>(name: string, body: Record<string, unknown>) {
  const current = await config();
  const response = await fetch(`${current.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: current.key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value?.message || value?.error || "Não foi possível concluir.");
  return value as T;
}

function youtubeId(url?: string | null) {
  if (!url) return "";
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return match?.[1] || "";
}

function channelLabel(value: string) {
  return ({ instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", whatsapp: "WhatsApp", youtube: "YouTube", outro: "Outra rede" } as Record<string, string>)[value] || "Redes sociais";
}

function iconFor(code: string) {
  return ({ regional: "📍", prioridade: "✨", mudanca: "⚡", participacao: "🤝", reuniao: "💬", voluntario: "🙋", formato: "🎬", resultado: "🎉" } as Record<string, string>)[code] || "★";
}

function getAnonId() {
  const key = "nortep-quiz-rede-anon";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export default function SocialQuizPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [form, setForm] = useState<PublicForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactChoices, setContactChoices] = useState<string[]>([]);
  const [contactConsent, setContactConsent] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const started = useRef(false);
  const code = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("c")?.trim().toUpperCase() || "";

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!code) { setPhase("unavailable"); return; }
      try {
        const loaded = await publicRpc<PublicForm | null>("get_social_quiz_form", { p_code: code });
        if (!active) return;
        if (!loaded?.questions?.length) { setPhase("unavailable"); return; }
        setForm(loaded);
        const anonymousId = getAnonId();
        void publicRpc<boolean>("record_social_quiz_event", { p_code: code, p_anonymous_id: anonymousId, p_event_type: "visit" }).catch(() => false);
        setPhase(youtubeId(loaded.link.intro_video_url) ? "intro" : "quiz");
      } catch {
        if (active) setPhase("unavailable");
      }
    };
    void load();
    return () => { active = false; };
  }, [code]);

  const visibleQuestions = useMemo(() => (form?.questions || []).filter(question => {
    if (!question.condition?.field) return true;
    const current = answers[question.condition.field] || "";
    return question.condition.operator === "not_equals" ? current !== question.condition.value : current === question.condition.value;
  }), [form?.questions, answers]);

  const current = visibleQuestions[Math.min(step, Math.max(visibleQuestions.length - 1, 0))];
  const progress = visibleQuestions.length ? Math.round(((step + 1) / visibleQuestions.length) * 100) : 0;
  const currentValues = current?.type === "multiple" ? (answers[current.code] || "").split("||").filter(Boolean) : [];
  const canAdvance = current ? Boolean(answers[current.code]) : false;

  const markStarted = () => {
    if (started.current) return;
    started.current = true;
    void publicRpc<boolean>("record_social_quiz_event", { p_code: code, p_anonymous_id: getAnonId(), p_event_type: "start" }).catch(() => false);
  };

  const selectSingle = (value: string) => {
    if (!current) return;
    markStarted();
    setAnswers(previous => ({ ...previous, [current.code]: value }));
    if (step < visibleQuestions.length - 1) window.setTimeout(() => setStep(previous => previous + 1), 230);
  };

  const toggleMultiple = (value: string) => {
    if (!current) return;
    markStarted();
    const selected = (answers[current.code] || "").split("||").filter(Boolean);
    const next = selected.includes(value) ? selected.filter(item => item !== value) : selected.length < 2 ? [...selected, value] : selected;
    setAnswers(previous => ({ ...previous, [current.code]: next.join("||") }));
  };

  const submit = async () => {
    if (!form || !canAdvance || busy) return;
    setBusy(true); setError("");
    try {
      const saved = await publicRpc<SubmitResult>("submit_social_quiz_response", {
        p_code: code,
        p_anonymous_id: getAnonId(),
        p_answers: answers,
      });
      setResult(saved);
      setPhase("thanks");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar agora.");
    } finally { setBusy(false); }
  };

  const saveContact = async () => {
    if (!contactChoices.length || !contactConsent || (!contactWhatsapp.trim() && !contactEmail.trim())) return;
    setBusy(true); setError("");
    try {
      await publicRpc("submit_social_quiz_contact", {
        p_code: code,
        p_name: contactName.trim() || null,
        p_whatsapp: contactWhatsapp.trim() || null,
        p_email: contactEmail.trim() || null,
        p_contact_choice: contactChoices.join(" · "),
      });
      setContactSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o contato.");
    } finally { setBusy(false); }
  };

  if (phase === "loading") return <main className="social-quiz-shell social-center"><div className="social-loader" /><h1>Preparando seu quiz…</h1><p>É rapidinho. ✨</p></main>;
  if (phase === "unavailable" || !form) return <main className="social-quiz-shell social-center"><div className="social-logo">NP</div><h1>Este quiz não está disponível.</h1><p>O link pode ter sido pausado ou substituído.</p><a href="/">Conhecer a NorteP</a></main>;

  const introId = youtubeId(form.link.intro_video_url);
  const thankId = youtubeId(result?.thank_you_video_url || form.link.thank_you_video_url);

  if (phase === "intro" && introId) return <main className="social-quiz-shell social-intro">
    <div className="social-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
    <section className="social-card intro-card"><div className="social-brand"><span className="social-logo">NP</span><div><small>QUIZ DA COMUNIDADE</small><b>NorteP nas redes</b></div></div><span className="channel-pill">{channelLabel(form.link.channel)}</span><h1>Antes de começar, uma apresentação rápida 🎬</h1><p>Assista se quiser. O vídeo não inicia sozinho e você pode seguir direto para o quiz.</p><div className="social-video"><iframe src={`https://www.youtube-nocookie.com/embed/${introId}`} title="Vídeo de abertura" allowFullScreen /></div><button className="social-primary" onClick={() => setPhase("quiz")}>Começar o quiz →</button><button className="social-skip" onClick={() => setPhase("quiz")}>Pular vídeo</button></section>
  </main>;

  if (phase === "thanks") return <main className="social-quiz-shell social-thanks">
    <div className="social-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
    <section className="social-card thanks-card"><div className="thanks-icon">✓</div><small>RESPOSTA REGISTRADA</small><h1>Valeu por participar! 🎉</h1><p>Seu código é <b>{result?.code}</b>. As respostas entram apenas em análises agrupadas.</p>{thankId && <div className="social-video"><iframe src={`https://www.youtube-nocookie.com/embed/${thankId}`} title="Vídeo de agradecimento" allowFullScreen /></div>}
      {!contactSaved ? <div className="contact-box"><span className="contact-title"><small>OPCIONAL</small><h2>Quer continuar por perto?</h2><p>Seu contato fica separado das respostas do quiz.</p></span><div className="contact-choices">{["Receber o resultado do quiz","Receber convite para conversa/reunião","Conhecer ações voluntárias","Receber conteúdos da NorteP"].map(choice => <button type="button" className={contactChoices.includes(choice) ? "selected" : ""} onClick={() => setContactChoices(previous => previous.includes(choice) ? previous.filter(item => item !== choice) : [...previous, choice])} key={choice}>{contactChoices.includes(choice) ? "✓ " : "+ "}{choice}</button>)}</div>{contactChoices.length > 0 && <><label>Como podemos te chamar? <small>(opcional)</small><input value={contactName} onChange={event => setContactName(event.target.value)} /></label><div className="contact-grid"><label>WhatsApp<input value={contactWhatsapp} onChange={event => setContactWhatsapp(event.target.value)} placeholder="(31) 99999-9999" /></label><label>E-mail<input type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} placeholder="voce@exemplo.com" /></label></div><label className="consent-check"><input type="checkbox" checked={contactConsent} onChange={event => setContactConsent(event.target.checked)} /><span><b>Autorizo contato somente para as opções que marquei.</b><small>Posso pedir a retirada do contato a qualquer momento.</small></span></label><button className="social-primary" disabled={busy || !contactConsent || (!contactWhatsapp.trim() && !contactEmail.trim())} onClick={() => void saveContact()}>{busy ? "Salvando…" : "Salvar meu contato"}</button></>}</div> : <div className="contact-saved"><i>✓</i><span><b>Contato salvo com segurança.</b><small>Ele ficou separado das respostas do quiz.</small></span></div>}
      {error && <div className="social-error">{error}</div>}
      <a className="social-finish" href="/">Concluir</a><footer>Participação espontânea · não representa amostra estatística da população · privacidade: pesquisadecamponortep@gmail.com</footer>
    </section>
  </main>;

  return <main className="social-quiz-shell">
    <div className="social-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
    <section className="social-card quiz-card">
      <header><div className="social-brand"><span className="social-logo">NP</span><div><small>QUIZ DA COMUNIDADE</small><b>2 minutinhos com você</b></div></div><span className="channel-pill">{channelLabel(form.link.channel)}</span></header>
      <div className="progress-wrap"><span><b>{step + 1}</b> de {visibleQuestions.length}</span><em><i style={{ width: `${progress}%` }} /></em><strong>{progress}%</strong></div>
      {current && <article className="question-card" key={current.code}><div className="question-icon">{iconFor(current.code)}</div><small>{current.section.toUpperCase()}</small><h1>{current.prompt}</h1>{current.help_text && <p>{current.help_text}</p>}<div className={current.type === "multiple" ? "answer-grid multiple" : "answer-grid"}>{current.options.map((option, index) => { const selected = current.type === "multiple" ? currentValues.includes(option) : answers[current.code] === option; const disabled = current.type === "multiple" && currentValues.length >= 2 && !selected; return <button type="button" disabled={disabled} className={selected ? "selected" : ""} onClick={() => current.type === "multiple" ? toggleMultiple(option) : selectSingle(option)} key={option}><i>{selected ? "✓" : String.fromCharCode(65 + index)}</i><span>{option}</span></button>; })}</div>{current.type === "multiple" && <small className="multiple-note">Escolha até 2 opções.</small>}</article>}
      <nav className="quiz-nav"><button disabled={step === 0 || busy} onClick={() => setStep(previous => Math.max(0, previous - 1))}>← Voltar</button>{step < visibleQuestions.length - 1 ? <button className="social-primary" disabled={!canAdvance || busy} onClick={() => setStep(previous => previous + 1)}>Continuar →</button> : <button className="social-primary" disabled={!canAdvance || busy} onClick={() => void submit()}>{busy ? "Enviando…" : "Enviar minhas respostas ✓"}</button>}</nav>
      {error && <div className="social-error">{error}</div>}
      <footer>Sem login · contato opcional · respostas analisadas de forma agrupada</footer>
    </section>
  </main>;
}
