"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import "./apoio.css";

const UF_OPTIONS = ["","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const REGIOES_OPTIONS = ["","Centro","Norte","Sul","Leste","Oeste","Noroeste","Nordeste","Sudoeste","Sudeste","Rural"];

type RuntimeConfig = { url: string; key: string };
type PublicForm = {
  partner: { name: string; kind: "apoiador" | "lideranca"; city?: string | null; region?: string | null; neighborhood?: string | null };
  survey: { id: string; title: string; description?: string | null; consent_text?: string | null; intro_video_url?: string | null; video_url?: string | null };
  videos?: Array<{ id: string; title: string; description?: string | null; video_url: string; placement?: "gallery" | "middle" | "before_end" }>;
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

async function submitReliable<T>(body: Record<string, unknown>) {
  const requestId = crypto.randomUUID();
  const response = await fetch("/api/mobilization/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    cache: "no-store",
    body: JSON.stringify({ ...body, request_id: requestId }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value?.message || value?.error || "Não foi possível registrar sua resposta.");
  return value as T;
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+() -]/g, "").slice(0, 22);
}

function isValidBRPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    const ddd = parseInt(digits.slice(0, 2), 10);
    return ddd >= 11 && ddd <= 99;
  }
  if (digits.length === 11) {
    const ddd = parseInt(digits.slice(0, 2), 10);
    const firstNine = digits[2];
    return ddd >= 11 && ddd <= 99 && firstNine === "9";
  }
  return false;
}

function storageKey(surveyId: string) {
  return `nortep:share:${surveyId}`;
}

export default function SupporterInvitePage() {
  const params = useParams<{ codigo: string; share?: string }>();
  const search = useSearchParams();
  const code = decodeURIComponent(params.codigo || "").trim();
  const incomingShare = params.share?.trim().toUpperCase() || search.get("s")?.trim().toUpperCase() || "";

  const [form, setForm] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storedShare, setStoredShare] = useState<StoredShare | null>(null);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [region, setRegion] = useState("");
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cooldown, setCooldown] = useState(0);
  const [supporterCount, setSupporterCount] = useState<number | null>(null);
  const [igLoaded, setIgLoaded] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // supporterCount disabled — RPC not available yet in backend
  // useEffect(() => {
  //   if (!form?.survey?.id) return;
  //   publicRpc<number>("get_mobilization_total", { p_code: code })
  //     .then((count) => setSupporterCount(count))
  //     .catch(() => {});
  // }, [form?.survey?.id, code]);

  const canSubmit = useMemo(
    () => name.trim().length >= 3 && isValidBRPhone(whatsapp) && city.trim().length >= 2 && state.trim().length === 2 && neighborhood.trim().length >= 2 && region.trim().length > 0 && privacyConsent && cooldown === 0,
    [name, whatsapp, city, state, neighborhood, region, privacyConsent, cooldown],
  );

  const shareUrl = useMemo(() => {
    if (!result?.share_code || typeof window === "undefined") return "";
    const originCode = result.origin_code || code;
    return `${window.location.origin}/apoio/${encodeURIComponent(originCode)}/s/${encodeURIComponent(result.share_code)}?v=5`;
  }, [code, result?.origin_code, result?.share_code]);

  const rememberShare = (saved: SubmitResult, firstName: string) => {
    if (!form?.survey?.id || !saved.share_code) return;
    const stored: StoredShare = { result: saved, firstName, surveyId: form.survey.id };
    localStorage.setItem(storageKey(form.survey.id), JSON.stringify(stored));
    setStoredShare(stored);
  };

  const validateField = (fieldName: string, value: string) => {
    const errors: Record<string, string> = { ...fieldErrors };
    switch (fieldName) {
      case "name":
        if (value.trim().length > 0 && value.trim().length < 3) errors.name = "Nome deve ter pelo menos 3 letras";
        else delete errors.name;
        break;
      case "whatsapp":
        if (value.trim().length > 0 && !isValidBRPhone(value)) errors.whatsapp = "WhatsApp deve ter 10 ou 11 digitos validos";
        else delete errors.whatsapp;
        break;
      case "state":
        if (value && !UF_OPTIONS.includes(value.toUpperCase())) errors.state = "Selecione uma UF valida";
        else delete errors.state;
        break;
      case "region":
        if (!value) errors.region = "Selecione uma regiao";
        else delete errors.region;
        break;
    }
    setFieldErrors(errors);
  };

  const shareWhatsApp = () => {
    if (!shareUrl) return;
    const candidateName = form?.partner?.name || "Maria Vanuzia";
    const text = encodeURIComponent(`Estou te enviando o formulario da candidata ${candidateName} para quem quiser conhecer os conteudos e escolher se deseja receber informacoes. ${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      const candidateName = form?.partner?.name || "Maria Vanuzia";
      const answers = {
        candidata: candidateName,
        finalidade_contato: `Conteúdos e comunicações relacionados à candidata ${candidateName}, conforme opções marcadas no formulário.`,
        receber_conteudos: wantContent ? "Sim" : "Não",
        receber_videos: wantVideos ? "Sim" : "Não",
        receber_dois_videos: wantVideos ? "Sim" : "Não",
        receber_material: wantMaterial ? "Sim" : "Não",
        participar_reuniao: wantMeeting ? "Sim" : "Não",
        ceder_casa_espaco: offerHome ? "Sim" : "Não",
        participar_atividades: wantParticipate ? "Sim" : "Não",
        uf: state.trim().toUpperCase(),
        regiao: region.trim(),
      };
      const saved = await submitReliable<SubmitResult>({
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
        p_region: region.trim() || null,
        p_neighborhood: neighborhood.trim(),
        p_referrer_share_code: incomingShare || null,
      });
      const firstName = name.trim().split(" ")[0] || "participante";
      rememberShare(saved, firstName);
      setResult(saved);
      setCooldown(30);
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

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      const input = document.createElement("textarea");
      input.value = shareUrl;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  const share = async () => {
    if (!shareUrl) return;
    const candidateName = form?.partner?.name || "Maria Vanuzia";
    const text = `Estou te enviando o formulário da candidata ${candidateName} para quem quiser conhecer os conteúdos e escolher se deseja receber informações.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${candidateName} · Conteúdos e participação`, text, url: shareUrl });
        return;
      }
      await copyLink();
    } catch {
      // Cancelar o menu nativo não deve gerar erro no formulário.
    }
  };

  if (loading) return <main className="support-shell support-center">
    <div className="support-loader" />
    <h1>Preparando o formulário…</h1>
    <noscript><div className="support-noscript"><p>Este formulário requer JavaScript habilitado.</p><p>Ative o JavaScript nas configurações do navegador.</p></div></noscript>
  </main>;
  if (!form) return <main className="support-shell support-center"><div className="support-logo">NP</div><h1>Este link não está disponível.</h1><p>{error || "Fale com a pessoa que enviou o convite."}</p></main>;

  if (result) {
    const candidateName = form?.partner?.name || "Maria Vanuzia";
    return <main className="support-shell support-center">
      <section className="support-card support-success">
        <div className="support-check">✓</div>
        <small>{result.already_registered ? "CADASTRO JÁ REALIZADO" : "CADASTRO CONCLUÍDO"}</small>
        <h1>{result.already_registered ? "Você já respondeu este formulário." : `Pronto, ${name.split(" ")[0]}.`}</h1>
        <p>{result.already_registered ? "Seu cadastro anterior foi mantido. Você pode continuar compartilhando pelo mesmo link." : <>Seu cadastro foi registrado. Código: <b>{result.code}</b>.</>}</p>

        {!result.already_registered && (wantContent || wantVideos || wantMaterial) && <div className="support-confirm"><b>Comunicações autorizadas</b><span>Seu contato poderá ser usado para conteúdos de {candidateName} somente conforme as opções que você marcou.</span></div>}

        <div className="support-share-box">
          <small>COMPARTILHAR</small>
          <h2>Enviar para outras pessoas</h2>
          <p>Este é o seu link pessoal. Você pode compartilhar ou copiar quantas vezes quiser, sem preencher o formulário novamente.</p>
          <div className="support-share-actions">
            <button type="button" className="support-whatsapp" onClick={shareWhatsApp}>Enviar pelo WhatsApp</button>
            <button type="button" className="support-primary" onClick={() => void share()}>Compartilhar</button>
            <button type="button" className="support-copy" onClick={() => void copyLink()}>{copied ? "Copiado ✓" : "Copiar link"}</button>
          </div>
          {shareUrl && <div className="support-share-link"><input className="support-share-url" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} /><button type="button" className="support-copy-inline" onClick={() => void copyLink()} aria-label="Copiar link">Copiar</button></div>}
        </div>

        <p className="support-privacy-note">Você pode pedir a interrupção dos contatos e a retirada dos dados vinculados a essa finalidade. <a href="/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a></p>
        <button type="button" className="support-secondary" onClick={switchPerson}>Outra pessoa vai responder neste aparelho</button>
      </section>
    </main>;
  }

  return <main className="support-shell">
    <section className="support-card">
      <header className="support-header">
        <div className="support-logo">NP</div>
        <span><small>CONTEÚDOS E PARTICIPAÇÃO</small><h1>Receber informações desta candidata</h1></span>
      </header>

      <div className="support-origin">
        {incomingShare ? (
          <small>LINK COMPARTILHADO</small>
        ) : (
          <>
            <small>LINK DE {form.partner.kind === "lideranca" ? "LIDERANÇA" : "APOIADOR"}</small>
            <b>{form.partner.name}</b>
          </>
        )}
      </div>

      {form.survey.intro_video_url && <section className="support-video-section">
        <small>APRESENTAÇÃO</small>
        <h2>Vídeo de abertura</h2>
        <SupportVideo title="Vídeo de abertura" url={form.survey.intro_video_url} onClickLoad={true} />
      </section>}

      {!!form.videos?.filter(video => !video.placement || video.placement === "gallery").length && <section className="support-video-section">
        <small>VÍDEOS</small>
        <h2>Conheça os conteúdos em vídeo</h2>
        <div className="support-video-grid">
          {form.videos?.filter(video => !video.placement || video.placement === "gallery").map(video => <article className="support-video-card" key={video.id}>
            <SupportVideo title={video.title} url={video.video_url} onClickLoad={igLoaded[video.id] !== false} onLoad={() => setIgLoaded(prev => ({ ...prev, [video.id]: true }))} />
            <div><b>{video.title}</b>{video.description && <small>{video.description}</small>}</div>
          </article>)}
        </div>
      </section>}

      {storedShare && <section className="support-returning">
        <small>VOCÊ JÁ RESPONDEU NESTE APARELHO</small>
        <h2>Seu link está disponível.</h2>
        <p>Você não precisa preencher o formulário novamente.</p>
        <button type="button" className="support-primary" onClick={reopenShare}>Compartilhar novamente</button>
        <button type="button" className="support-secondary" onClick={switchPerson}>Outra pessoa vai responder neste aparelho</button>
      </section>}

      {!storedShare && <form onSubmit={submit} className={busy ? "support-form-busy" : ""}>
        <div className="support-progress">
          <div className={`support-progress-step ${name.trim() && isValidBRPhone(whatsapp) ? "completed" : "active"}`}><span>1</span><small>Dados</small></div>
          <div className={`support-progress-line ${city.trim() && state.trim() && neighborhood.trim() && region.trim() ? "active" : ""}`} />
          <div className={`support-progress-step ${city.trim() && state.trim() && neighborhood.trim() && region.trim() ? "completed" : city.trim() || state.trim() ? "active" : ""}`}><span>2</span><small>Local</small></div>
          <div className={`support-progress-line ${wantContent || wantVideos || wantMaterial || wantMeeting || offerHome || wantParticipate ? "active" : ""}`} />
          <div className={`support-progress-step ${wantContent || wantVideos || wantMaterial || wantMeeting || offerHome || wantParticipate ? "completed" : ""}`}><span>3</span><small>Preferências</small></div>
          <div className={`support-progress-line ${privacyConsent ? "active" : ""}`} />
          <div className={`support-progress-step ${privacyConsent ? "completed" : ""}`}><span>4</span><small>Consentir</small></div>
        </div>

        <section className="support-fields">
          <label>
            Nome completo
            <input value={name} onChange={event => setName(event.target.value)} onBlur={() => validateField("name", name)} autoComplete="name" disabled={busy} required />
            {fieldErrors.name && <span className="support-field-error">{fieldErrors.name}</span>}
          </label>
          <label>
            WhatsApp
            <input value={whatsapp} onChange={event => setWhatsapp(normalizePhone(event.target.value))} onBlur={() => validateField("whatsapp", whatsapp)} inputMode="tel" autoComplete="tel" placeholder="(31) 99999-9999" disabled={busy} required />
            {fieldErrors.whatsapp && <span className="support-field-error">{fieldErrors.whatsapp}</span>}
          </label>
          <div className="support-location">
            <label>Cidade<input value={city} onChange={event => setCity(event.target.value)} autoComplete="address-level2" disabled={busy} required /></label>
            <label className="support-uf">UF
              <select value={state} onChange={event => { setState(event.target.value); validateField("state", event.target.value); }} disabled={busy} required>
                {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf || "Selecione"}</option>)}
              </select>
              {fieldErrors.state && <span className="support-field-error">{fieldErrors.state}</span>}
            </label>
          </div>
          <label className="support-region">Região
            <select value={region} onChange={event => { setRegion(event.target.value); validateField("region", event.target.value); }} disabled={busy} required>
              {REGIOES_OPTIONS.map(r => <option key={r} value={r}>{r || "Selecione a região"}</option>)}
            </select>
            {fieldErrors.region && <span className="support-field-error">{fieldErrors.region}</span>}
          </label>
          <label>Bairro<input value={neighborhood} onChange={event => setNeighborhood(event.target.value)} autoComplete="address-level3" disabled={busy} required /></label>
        </section>

        {!!form.videos?.filter(video => video.placement === "middle").length && <section className="support-video-section support-video-inline">
          <small>CONTEÚDO EM VÍDEO</small>
          <div className="support-video-grid">
            {form.videos?.filter(video => video.placement === "middle").map(video => <article className="support-video-card" key={video.id}>
              <SupportVideo title={video.title} url={video.video_url} onClickLoad={igLoaded[video.id] !== false} onLoad={() => setIgLoaded(prev => ({ ...prev, [video.id]: true }))} />
              <div><b>{video.title}</b>{video.description && <small>{video.description}</small>}</div>
            </article>)}
          </div>
        </section>}

        <section className="support-options">
          <h2>O que você gostaria de receber ou fazer?</h2>
          <p>Marque somente as opções que você autoriza.</p>
          <Choice checked={wantContent} setChecked={setWantContent} title="Quero receber conteúdos e informações desta candidata" />
          <Choice checked={wantVideos} setChecked={setWantVideos} title="Quero receber vídeos desta candidata" text="Vídeos de apresentação e outros conteúdos disponibilizados no NorteP." />
          <Choice checked={wantMaterial} setChecked={setWantMaterial} title="Quero receber materiais desta candidata" />
          <Choice checked={wantMeeting} setChecked={setWantMeeting} title="Quero participar de encontros ou reuniões" />
          <Choice checked={offerHome} setChecked={setOfferHome} title="Posso disponibilizar minha casa ou um espaço para reunião" />
          <Choice checked={wantParticipate} setChecked={setWantParticipate} title="Quero participar de atividades" />
        </section>

        <label className="support-consent">
          <input type="checkbox" checked={privacyConsent} onChange={event => setPrivacyConsent(event.target.checked)} disabled={busy} />
          <span>
            <b>Autorizo o armazenamento e o uso dos meus dados para esta finalidade.</b>
            <small className="support-consent-summary">Meus dados serão usados apenas para comunicações da candidata conforme minhas escolhas.</small>
            <details className="support-consent-details">
              <summary>Ver texto completo</summary>
              <small>Autorizo que meu nome, WhatsApp, cidade, UF, bairro e região sejam armazenados para comunicações relacionadas à candidata e às opções que marquei. A origem do convite pode ser registrada para organização interna. Posso solicitar a interrupção dos contatos e a retirada dos dados vinculados a essa finalidade.</small>
            </details>
          </span>
        </label>

        {!!form.videos?.filter(video => video.placement === "before_end").length && <section className="support-video-section support-video-inline support-video-before-end">
          <small>ANTES DE CONCLUIR</small>
          <div className="support-video-grid">
            {form.videos?.filter(video => video.placement === "before_end").map(video => <article className="support-video-card" key={video.id}>
              <SupportVideo title={video.title} url={video.video_url} onClickLoad={igLoaded[video.id] !== false} onLoad={() => setIgLoaded(prev => ({ ...prev, [video.id]: true }))} />
              <div><b>{video.title}</b>{video.description && <small>{video.description}</small>}</div>
              {video.video_url.includes("instagram.com/") && <a className="support-instagram-cta" href={video.video_url} target="_blank" rel="noreferrer">Ver no Instagram</a>}
            </article>)}
          </div>
        </section>}

        {error && <div className="support-error" role="alert">{error}</div>}
        <button type="submit" className="support-primary" disabled={!canSubmit || busy}>
          {busy ? <><span className="support-spinner" /> Enviando…</> : cooldown > 0 ? `Aguarde ${cooldown}s` : "Enviar"}
        </button>
      </form>}

      <footer>Sem e-mail · sem criação de conta · participação voluntária · não é pesquisa eleitoral nem registro de voto<br/><a href="/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a> · <a href="mailto:suporte@nortep.ia.br">suporte@nortep.ia.br</a></footer>
    </section>
  </main>;
}

function SupportVideo({ title, url, onClickLoad = true, onLoad }: { title: string; url: string; onClickLoad?: boolean; onLoad?: () => void }) {
  const direct = /\.(mp4|webm|ogg)(?:[?#].*)?$/i.test(url);
  if (direct) {
    return <video className="support-video-player" controls preload="metadata" playsInline aria-label={title}>
      <source src={url} />
      Seu navegador não conseguiu reproduzir este vídeo.
    </video>;
  }

  const instagram = url.match(/instagram\.com\/(?:reel|p)\/([^/?#]+)/i);
  if (instagram?.[1]) {
    if (!onClickLoad) {
      return <div className="support-instagram-block">
        <div className="support-instagram-label">▶ Vídeo no Instagram</div>
        <button type="button" className="support-instagram-placeholder" onClick={onLoad}>
          <span>Clique para carregar o vídeo do Instagram</span>
          <small>O iframe será carregado ao clicar.</small>
        </button>
        <a className="support-instagram-watch" href={url} target="_blank" rel="noreferrer">Assistir direto no Instagram</a>
      </div>;
    }
    return <div className="support-instagram-block">
      <div className="support-instagram-label">▶ Vídeo no Instagram</div>
      <div className="support-instagram-wrap">
      <iframe
        className="support-instagram-embed"
        src={`https://www.instagram.com/reel/${instagram[1]}/embed/`}
        title={title}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
      />
      </div>
      <a className="support-instagram-watch" href={url} target="_blank" rel="noreferrer">Assistir vídeo no Instagram</a>
    </div>;
  }

  return <a className="support-video-external" href={url} target="_blank" rel="noreferrer">Abrir vídeo</a>;
}

function Choice({ checked, setChecked, title, text }: { checked: boolean; setChecked: (value: boolean) => void; title: string; text?: string }) {
  return <label className={checked ? "support-choice checked" : "support-choice"}>
    <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} aria-label={title} />
    <i aria-hidden="true">{checked ? "✓" : ""}</i>
    <span><b>{title}</b>{text && <small>{text}</small>}</span>
  </label>;
}
