"use client";

import { useEffect, useRef, useState } from "react";
import "./survey-intro-video.css";

type RuntimeConfig = { url: string; key: string };
type StoredSession = { access_token?: string };
type PublicMobilizationForm = {
  survey?: {
    title?: string;
    intro_video_url?: string | null;
  };
};

const SESSION_KEY = "nortep-sessao";
let runtimeConfig: RuntimeConfig | null = null;

function readSession(): StoredSession | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as StoredSession | null;
  } catch {
    return null;
  }
}

async function getRuntimeConfig() {
  if (runtimeConfig?.url && runtimeConfig.key) return runtimeConfig;
  const response = await fetch("/api/runtime-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Configuração indisponível.");
  const value = await response.json() as RuntimeConfig;
  runtimeConfig = { url: value.url.trim(), key: value.key.trim() };
  return runtimeConfig;
}

function youtubeId(value: string) {
  return value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/)?.[1] || "";
}

async function callRpc<T>(name: string, body: Record<string, unknown>, accessToken?: string) {
  const config = await getRuntimeConfig();
  const token = accessToken || config.key;
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return await response.json() as T;
}

export default function SurveyIntroVideo() {
  const [videoUrl, setVideoUrl] = useState("");
  const [surveyTitle, setSurveyTitle] = useState("");
  const [open, setOpen] = useState(false);
  const currentSurface = useRef("");
  const checking = useRef(false);

  useEffect(() => {
    let mounted = true;

    const inspect = async () => {
      if (checking.current) return;

      const publicCode = new URLSearchParams(window.location.search).get("mobilizacao") || "";
      const publicForm = document.querySelector(".public-mobilization:not(.public-thanks)");
      const dynamicInterview = document.querySelector(".dynamic-interview");

      if (!publicForm && !dynamicInterview) {
        currentSurface.current = "";
        if (mounted) {
          setOpen(false);
          setVideoUrl("");
          setSurveyTitle("");
        }
        return;
      }

      const title = dynamicInterview?.querySelector(".entrevista-topo h2")?.textContent?.trim() || "";
      const surface = publicForm && publicCode ? `public:${publicCode}` : title ? `research:${title}` : "";
      if (!surface || currentSurface.current === surface) return;

      currentSurface.current = surface;
      checking.current = true;
      try {
        let intro = "";
        let resolvedTitle = title;

        if (publicForm && publicCode) {
          const form = await callRpc<PublicMobilizationForm>("get_public_mobilization_form", { p_code: publicCode });
          intro = form?.survey?.intro_video_url || "";
          resolvedTitle = form?.survey?.title || "Pesquisa NorteP";
        } else if (title) {
          const session = readSession();
          if (session?.access_token) {
            intro = await callRpc<string>("get_survey_intro_video", { p_survey_title: title }, session.access_token) || "";
          }
        }

        if (!mounted) return;
        if (youtubeId(intro)) {
          setVideoUrl(intro);
          setSurveyTitle(resolvedTitle || "Pesquisa NorteP");
          setOpen(true);
        } else {
          setOpen(false);
          setVideoUrl("");
          setSurveyTitle("");
        }
      } catch {
        if (mounted) setOpen(false);
      } finally {
        checking.current = false;
      }
    };

    void inspect();
    const observer = new MutationObserver(() => void inspect());
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(() => void inspect(), 1200);
    window.addEventListener("focus", inspect);

    return () => {
      mounted = false;
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("focus", inspect);
    };
  }, []);

  const id = youtubeId(videoUrl);
  if (!open || !id) return null;

  return <div className="nortep-intro-backdrop" role="dialog" aria-modal="true" aria-label="Vídeo de apresentação da pesquisa">
    <section className="nortep-intro-card">
      <header>
        <div className="nortep-intro-logo">NP</div>
        <span><small>APRESENTAÇÃO DA PESQUISA</small><h2>{surveyTitle}</h2></span>
      </header>
      <p>Assista à apresentação antes de começar. O vídeo não inicia sozinho e pode ser ignorado quando a conexão estiver fraca.</p>
      <div className="nortep-intro-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={`Apresentação — ${surveyTitle}`}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="nortep-intro-notice"><i>i</i><span><b>Participação voluntária</b><small>O vídeo apresenta o contexto. As perguntas e o consentimento continuam aparecendo normalmente em seguida.</small></span></div>
      <button type="button" onClick={() => setOpen(false)}>Continuar para a pesquisa</button>
    </section>
  </div>;
}
