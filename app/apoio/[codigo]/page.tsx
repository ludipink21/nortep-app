"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import "./apoio.css";

const CANDIDATE_NAME = "Maria Vanuzia";

type RuntimeConfig = { url: string; key: string };
type PublicForm = {
  partner: { name: string; kind: "apoiador" | "lideranca"; city?: string | null; region?: string | null; neighborhood?: string | null };
  survey: { id: string; title: string; description?: string | null; consent_text?: string | null; video_url?: string | null };
  questions: unknown[];
};
type SubmitResult = {
  code: string;
  share_code: string;
  origin_code?: string | null;
  video_url?: string | null;
  linked_to_previous_share?: boolean;
  already_registered?: boolean;
};
type StoredShare = {
  result: SubmitResult;
  firstName: string;
  surveyId: string;
};

let runtimeConfig: RuntimeConfig | null = null;

async function config() {
  if (runtimeConfig?.url && runtimeConfig.key) return runtimeConfig;
  const response = await fetch("/api/runtime-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Configuração indisponível.");
  const value = (await response.json()) as RuntimeConfig;
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

function normalizePhone(value: string) {
  return value.replace(/[^0-9+() -]/g, "").slice(0, 22);
}

function storageKey(surveyId: string) {
  return `nortep:share:${surveyId}`;
}

export default function SupporterInvitePage() {
  const params = useParams<{ codigo: string }>();
  const search = useSearchParams();
  const code = decodeURIComponent(params.codigo || "").trim();
  const incomingShare = search.get("s")?.trim().toUpperCase() || "";

  const [form, setForm] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storedShare, setStoredShare] = useState<StoredShare | null>(null);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("MG");
  const [neighborhood, setNeighborhood] = useState("");

  const [wantContent, setWantContent] = useState(false);
  const [wantVideos, setWantVideos] = useState(false);
  const [wantMaterial, setWantMaterial] = useState(false);
  const [wantMeeting, setWantMeeting] = useState(false);
  const [offerHome, setOfferHome] = useState(false);
  const [wantParticipate, setWantParticipate] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const [result, setResult] = useState<SubmitResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const loaded = await publicRpc<PublicForm | null>("get_public_mobilization_form", { p_code: code });
        if (!active) return;
        setForm(loaded);
        if (loaded?.survey?.id) {
          try {
            const saved = localStorage.getItem(storageKey(loaded.survey.id));
            if (saved) {
              const parsed = JSON.parse(saved) as StoredShare;
              if (parsed?.result?.share_code && parsed?.surveyId === loaded.survey.id) setStoredShare(parsed);
            }
          } catch {
            localStorage.removeItem(storageKey(loaded.survey.id));
          }
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Este link não está disponível.");
      } finally {
        if (active) setLoading(false);
      }
    };
    if (code) void load();
    else setLoading(false);
    return () => { active = false; };
  }, [code]);

  const canSubmit = useMemo(
    () => name.trim().length >= 2 && whatsapp.trim().length >= 8 && city.trim().length >= 2 && state.trim().length === 2 && neighborhood.trim().length >= 2 && privacyConsent,
    [name, whatsapp, city, state, neighborhood, privacyConsent],
  );

  const shareUrl = useMemo(() => {
    if (!result?.share_code || typeof window === "undefined") return "";
    const originCode = result.origin_code || code;
    return `${window.location.origin}/apoio/${encodeURIComponent(originCode)}?s=${encodeURIComponent(result.share_code)}`;
  }, [code, result?.origin_code, result?.share_code]);

  const rememberShare = (saved: SubmitResult, firstName: string) => {
    if (!form?.survey?.id || !saved.share_code) return;
    const stored: StoredShare = { result: saved, firstName, surveyId: form.survey.id };
    localStorage.setItem(storageKey(form.survey.id), JSON.stringify(stored));
    setStoredShare(stored);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      const answers = {
        candidata: CANDIDATE_NAME,
        finalidade_contato: `Conteúdos e comunicações relacionados à candidata ${CANDIDATE_NAME}, conforme opções marcadas no formulário.`,
        receber_conteudos: wantContent ? "Sim" : "Não",
        receber_dois_videos: wantVideos ? "Sim" : "Não",
        receber_material: wantMaterial ? "Sim" : "Não",
        participar_reuniao: wantMeeting ? "Sim" : "Não",
        ceder_casa_espaco: offerHome ? "Sim" : "Não",
        participar_atividades: wantParticipate ? "Sim" : "Não",
        uf: state.trim().toUpperCase(),
      };
      const saved = await publicRpc<SubmitResult>("submit_public_mobilization_response_v2", {
        p_code: code,
        p_answers: answers,
        p_name: name.trim(),
        p_whatsapp: whatsapp.trim(),
        p_contact_consent: privacyConsent,
        p_content_opt_in: wantContent || wantVideos || wantMaterial,
        p_meetings_opt_in: wantMeeting || offerHome,
        p_volunteer_opt_in: wantParticipate,
        p_city: city.trim(),
        p_state: state.trim().toUpperCase(),
        p_region: null,
        p_neighborhood: neighborhood.trim(),
        p_referrer_share_code: incomingShare || null,
      });
      const firstName = name.trim().split(" ")[0] || "participante";
      rememberShare(saved, firstName);
      setResult(saved);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar agora.");
    } finally {
      setBusy(false);
    }
  };

  const reopenShare = () => {
    if (!storedShare) return;
    setName(storedShare.firstName);
    setResult(storedShare.result);
    setCopied(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const switchPerson = () => {
    if (form?.survey?.id) localStorage.removeItem(storageKey(form.survey.id));
    setStoredShare(null);
    setResult(null);
    setName("");
    setWhatsapp("");
    setCity("");
    setNeighborhood("");
    setPrivacyConsent(false);
  };

  const share = async () => {
    if (!shareUrl) return;
    const text = `Estou te enviando o formulário da candidata ${CANDIDATE_NAME} para quem quiser conhecer os conteúdos e escolher se deseja receber informações.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${CANDIDATE_NAME} · Conteúdos e participação`, text, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      await navigator.clipboard.writeText(shareUrl).catch(() => undefined);
      setCopied(true);
    }
  };

  if (loading) return <main className="support-shell support-center"><div className="support-loader" /><h1>Preparando o formulário…</h1></main>;
  if (!form) return <main className="support-shell support-center"><div className="support-logo">NP</div><h1>Este link não está disponível.</h1><p>{error || "Fale com a pessoa que enviou o convite."}</p></main>;

  if (result) {
    return <main className="support-shell support-center">
      <section className="support-card support-success">
        <div className="support-check">✓</div>
        <small>{result.already_registered ? "CADASTRO JÁ REALIZADO" : "CADASTRO CONCLUÍDO"}</small>
        <h1>{result.already_registered ? "Você já respondeu este formulário." : `Pronto, ${name.split(" ")[0]}.`}</h1>
        <p>{result.already_registered ? "Seu cadastro anterior foi mantido. Você pode continuar compartilhando pelo mesmo link." : <>Seu cadastro foi registrado. Código: <b>{result.code}</b>.</>}</p>

        {!result.already_registered && (wantContent || wantVideos || wantMaterial) && <div className="support-confirm"><b>Comunicações autorizadas</b><span>Seu contato poderá ser usado para conteúdos de {CANDIDATE_NAME} somente conforme as opções que você marcou.</span></div>}

        <div className="support-share-box">
          <small>COMPARTILHAR</small>
          <h2>Enviar para outras pessoas</h2>
          <p>Você pode usar este mesmo botão sempre que quiser compartilhar novamente.</p>
          <button type="button" className="support-primary" onClick={() => void share()}>{copied ? "Link copiado ✓" : "Compartilhar convite"}</button>
          {shareUrl && <input className="support-share-url" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} />}
        </div>

        <p className="support-privacy-note">Você pode pedir a interrupção dos contatos e a retirada dos dados vinculados a essa finalidade.</p>
        <button type="button" className="support-secondary" onClick={switchPerson}>Outra pessoa vai responder neste aparelho</button>
      </section>
    </main>;
  }

  return <main className="support-shell">
    <section className="support-card">
      <div className="support-cover-wrap">
        <img className="support-cover" src="/maria-vanuzia-cover.jpg" alt="Maria Vanuzia" />
        <div className="support-cover-caption"><small>CANDIDATA</small><strong>{CANDIDATE_NAME}</strong></div>
      </div>

      <header className="support-header">
        <div className="support-logo">NP</div>
        <span><small>CONTEÚDOS E PARTICIPAÇÃO</small><h1>Receber informações desta candidata</h1></span>
      </header>

      <div className="support-origin">
        <small>CONVITE COMPARTILHADO POR</small>
        <b>{form.partner.name}</b>
      </div>

      {storedShare && <section className="support-returning">
        <small>VOCÊ JÁ RESPONDEU NESTE APARELHO</small>
        <h2>Seu link está disponível.</h2>
        <p>Você não precisa preencher o formulário novamente.</p>
        <button type="button" className="support-primary" onClick={reopenShare}>Compartilhar novamente</button>
        <button type="button" className="support-secondary" onClick={switchPerson}>Outra pessoa vai responder neste aparelho</button>
      </section>}

      {!storedShare && <form onSubmit={submit}>
        <section className="support-fields">
          <label>Nome completo<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required /></label>
          <label>WhatsApp<input value={whatsapp} onChange={event => setWhatsapp(normalizePhone(event.target.value))} inputMode="tel" autoComplete="tel" placeholder="(31) 99999-9999" required /></label>
          <div className="support-location">
            <label>Cidade<input value={city} onChange={event => setCity(event.target.value)} autoComplete="address-level2" required /></label>
            <label className="support-uf">UF<input value={state} onChange={event => setState(event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase())} maxLength={2} required /></label>
          </div>
          <label>Bairro<input value={neighborhood} onChange={event => setNeighborhood(event.target.value)} autoComplete="address-level3" required /></label>
        </section>

        <section className="support-options">
          <h2>O que você gostaria de receber ou fazer?</h2>
          <p>Marque somente as opções que você autoriza.</p>
          <Choice checked={wantContent} setChecked={setWantContent} title="Quero receber conteúdos e informações desta candidata" />
          <Choice checked={wantVideos} setChecked={setWantVideos} title="Quero receber os dois vídeos de apresentação" text="Trajetória, origem, experiências e projetos." />
          <Choice checked={wantMaterial} setChecked={setWantMaterial} title="Quero receber materiais desta candidata" />
          <Choice checked={wantMeeting} setChecked={setWantMeeting} title="Quero participar de encontros ou reuniões" />
          <Choice checked={offerHome} setChecked={setOfferHome} title="Posso disponibilizar minha casa ou um espaço para reunião" />
          <Choice checked={wantParticipate} setChecked={setWantParticipate} title="Quero participar de atividades" />
        </section>

        <label className="support-consent">
          <input type="checkbox" checked={privacyConsent} onChange={event => setPrivacyConsent(event.target.checked)} />
          <span>
            <b>Autorizo o armazenamento e o uso dos meus dados para esta finalidade.</b>
            <small>Autorizo que meu nome, WhatsApp, cidade, UF e bairro sejam armazenados para comunicações relacionadas à candidata {CANDIDATE_NAME} e às opções que marquei. A origem do convite pode ser registrada para organização interna. Posso solicitar a interrupção dos contatos e a retirada dos dados vinculados a essa finalidade.</small>
          </span>
        </label>

        {error && <div className="support-error">{error}</div>}
        <button type="submit" className="support-primary" disabled={!canSubmit || busy}>{busy ? "Enviando…" : "Enviar"}</button>
      </form>}

      <footer>Sem e-mail · sem criação de conta · participação voluntária · não é pesquisa eleitoral nem registro de voto</footer>
    </section>
  </main>;
}

function Choice({ checked, setChecked, title, text }: { checked: boolean; setChecked: (value: boolean) => void; title: string; text?: string }) {
  return <label className={checked ? "support-choice checked" : "support-choice"}>
    <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />
    <i>{checked ? "✓" : ""}</i>
    <span><b>{title}</b>{text && <small>{text}</small>}</span>
  </label>;
}
