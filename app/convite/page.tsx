"use client";

import { useEffect, useMemo, useState } from "react";
import { loadRuntimeConfig, readSessionFromUrl, redeemAccessInvite, signIn, signUp } from "../supabase";
import "./convite.css";

type Mode = "criar" | "entrar";
type Access = "administracao" | "coordenacao" | "pesquisador" | "observador";

function accessTitle(access: Access) {
  return ({
    administracao: "Administração NorteP",
    coordenacao: "Coordenação Geral",
    pesquisador: "Pesquisador",
    observador: "Observador",
  } as const)[access];
}

function destination(access: Access) {
  return `/?acesso=${access}`;
}

export default function InvitePage() {
  const params = useMemo(() => typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search), []);
  const access = (params.get("acesso") || "pesquisador") as Access;
  const code = params.get("codigo") || "";
  const [mode, setMode] = useState<Mode>("criar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      try {
        await loadRuntimeConfig();
        const callback = await readSessionFromUrl();
        if (callback?.session) {
          if (code) {
            try { await redeemAccessInvite(callback.session, code); } catch { /* Convite pode já ter sido usado por esta conta. */ }
          }
          window.location.replace(destination(access));
          return;
        }
      } catch (error) {
        if (mounted) setMessage(error instanceof Error ? error.message : "Não foi possível preparar o convite.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void boot();
    return () => { mounted = false; };
  }, [access, code]);

  const redirectTo = () => `${window.location.origin}${window.location.pathname}${window.location.search}`;

  const finish = async (session: Awaited<ReturnType<typeof signIn>>) => {
    if (code) {
      try { await redeemAccessInvite(session, code); } catch { /* Se já foi utilizado, a conta ativa continua entrando normalmente. */ }
    }
    window.location.replace(destination(access));
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || (mode === "criar" && name.trim().length < 2)) {
      setMessage(mode === "criar" ? "Preencha nome, e-mail e senha." : "Preencha e-mail e senha.");
      return;
    }
    setBusy(true);
    setMessage("");
    setUnconfirmed(false);
    try {
      if (mode === "entrar") {
        const session = await signIn(normalizedEmail, password);
        await finish(session);
      } else {
        const result = await signUp(name.trim(), normalizedEmail, password, redirectTo());
        if (result.session) {
          await finish(result.session);
        } else {
          setConfirmationSent(true);
          setMessage("Cadastro recebido. Abra o e-mail de confirmação e depois volte por este mesmo link.");
        }
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Não foi possível concluir o acesso.";
      if (/already registered|already been registered|user already/i.test(text)) {
        setMode("entrar");
        setMessage("Este e-mail já possui uma conta. Entre com a senha criada ou reenvie a confirmação.");
      } else if (/email not confirmed|not confirmed/i.test(text)) {
        setUnconfirmed(true);
        setMessage("O e-mail ainda não foi confirmado. Reenvie a mensagem de confirmação abaixo.");
      } else {
        setMessage(text);
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage("Informe o e-mail usado no cadastro.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth-resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          path: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Não foi possível reenviar agora.");
      setConfirmationSent(true);
      setMessage("Confirmação reenviada. Confira também Spam e Lixo eletrônico.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível reenviar agora.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <main className="invite-shell"><section className="invite-card invite-loading"><div className="invite-logo">NP</div><h1>Preparando seu acesso seguro…</h1></section></main>;

  if (!code) return <main className="invite-shell"><section className="invite-card"><div className="invite-logo">NP</div><small>CONVITE INVÁLIDO</small><h1>Este endereço não contém um convite.</h1><p>Peça um novo link à administração NorteP.</p></section></main>;

  return <main className="invite-shell">
    <section className="invite-brand">
      <div className="invite-logo">NP</div>
      <small>NORTEP PESQUISA</small>
      <h1>{accessTitle(access)}</h1>
      <p>Este convite é individual, vinculado ao seu e-mail e válido por tempo limitado.</p>
      <div><span>✓ E-mail confirmado</span><span>✓ Função definida pela administração</span><span>✓ Acesso pessoal e auditável</span></div>
    </section>

    <form className="invite-card" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <small>{mode === "criar" ? "PRIMEIRO ACESSO" : "CONTA JÁ CRIADA"}</small>
      <h2>{mode === "criar" ? "Crie sua senha" : "Entre para aceitar o convite"}</h2>
      <p>{mode === "criar" ? "Use exatamente o e-mail que recebeu o convite." : "Use o mesmo e-mail e a senha já cadastrada."}</p>

      {mode === "criar" && <label>Nome completo<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></label>}
      <label>E-mail<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" /></label>
      <label>Senha<div className="invite-password"><input value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={mode === "criar" ? "new-password" : "current-password"} minLength={6} /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? "Ocultar" : "Mostrar"}</button></div></label>

      {message && <div className="invite-message" role="status">{message}</div>}
      <button className="invite-primary" type="submit" disabled={busy}>{busy ? "Processando…" : mode === "criar" ? "Criar conta e aceitar convite" : "Entrar e aceitar convite"}</button>

      {(confirmationSent || unconfirmed || mode === "entrar") && <button className="invite-resend" type="button" disabled={busy} onClick={() => void resend()}>Reenviar e-mail de confirmação</button>}
      <button className="invite-switch" type="button" onClick={() => { setMode(mode === "criar" ? "entrar" : "criar"); setMessage(""); }}>
        {mode === "criar" ? "Já criei a conta: entrar" : "Ainda não criei a conta"}
      </button>
      <small className="invite-note">Não compartilhe sua senha. Mobilizadores não usam esta tela e não recebem login.</small>
    </form>
  </main>;
}
