"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import curriculumSource from "./academia-content.json";
import { loadAcademyCertificate, loadAcademyProgress, loadAcademyTeamSummary, saveAcademyLessonProgress, type AcademyCertificate, type AcademyLessonProgress, type AcademyTeamSummary, type Profile, type Session } from "./supabase";

type AcademyRole = "pesquisador" | "supervisor" | "mobilizador" | "coordenador" | "administrador" | "analista" | "observador" | "fundadora" | "instrutor";
type AcademyTab = "formacao" | "biblioteca" | "acompanhamento" | "certificado";

type AcademyQuiz = {
  question: string;
  options: string[];
  answer: number;
  feedback: string;
};

type AcademyLesson = {
  id: string;
  title: string;
  duration: number;
  objective: string;
  content: string[];
  speak?: string;
  example: string;
  activity: string;
  quiz: AcademyQuiz;
};

type AcademyModule = {
  id: string;
  title: string;
  icon?: string;
  notice?: string;
  lessons: AcademyLesson[];
};

type AcademyTrack = {
  title: string;
  description: string;
  modules: AcademyModule[];
};

type AcademyCurriculum = {
  version: string;
  title: string;
  subtitle: string;
  commonModules: AcademyModule[];
  roles: Record<AcademyRole, AcademyTrack>;
  certification: { minimumScore: number; requirements: string[] };
};

type AcademyProgress = {
  completed: string[];
  answers: Record<string, number>;
  drafts: Record<string, string>;
  pending: string[];
  updatedAt?: string;
};

type AcademySyncState = "loading" | "synced" | "syncing" | "local" | "error";

const curriculum = curriculumSource as AcademyCurriculum;
const emptyProgress: AcademyProgress = { completed: [], answers: {}, drafts: {}, pending: [] };

const academyRoleLabels: Record<AcademyRole, string> = {
  pesquisador: "Pesquisador(a)",
  supervisor: "Supervisor(a)",
  mobilizador: "Mobilizador(a)",
  coordenador: "Coordenador(a)",
  administrador: "Administrador(a)",
  analista: "Analista",
  observador: "Observador(a)",
  fundadora: "Administração principal",
  instrutor: "Instrutor(a)",
};

function academyRole(profile: Profile): AcademyRole {
  if (profile.is_primary_admin) return "fundadora";
  if (profile.role === "admin") return "administrador";
  return profile.role;
}

function progressKey(profileId: string, role: AcademyRole) {
  return `nortep-academia-preview-${curriculum.version}-${profileId}-${role}`;
}

function readProgress(profileId: string, role: AcademyRole): AcademyProgress {
  if (typeof window === "undefined") return emptyProgress;
  try {
    const parsed = JSON.parse(localStorage.getItem(progressKey(profileId, role)) || "null") as AcademyProgress | null;
    if (!parsed || !Array.isArray(parsed.completed)) return emptyProgress;
    return { completed: parsed.completed, answers: parsed.answers || {}, drafts: parsed.drafts || {}, pending: parsed.pending || [], updatedAt: parsed.updatedAt };
  } catch {
    return emptyProgress;
  }
}

function totalLessons(modules: AcademyModule[]) {
  return modules.reduce((total, module) => total + module.lessons.length, 0);
}

function roleLabel(role: Profile["role"]) {
  return role === "admin" ? "Administração" : role === "coordenador" ? "Coordenação" : role === "supervisor" ? "Supervisão" : role === "observador" ? "Observação" : "Pesquisa de campo";
}

function AcademyExercise({ lesson, initialValue, onSave }: { lesson: AcademyLesson; initialValue: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(initialValue);
  const [saved, setSaved] = useState(Boolean(initialValue.trim()));
  const save = () => {
    onSave(draft);
    setSaved(Boolean(draft.trim()));
  };
  return <section className="academy-exercise"><small>EXERCÍCIO</small><h4>{lesson.activity}</h4><textarea value={draft} onChange={event => { setDraft(event.target.value); setSaved(false); }} onBlur={save} placeholder="Escreva sua resposta. O rascunho será salvo neste aparelho." /><span>{saved ? "Rascunho salvo neste aparelho" : draft.trim() ? "Toque fora do campo para salvar o rascunho." : "A atividade prática é necessária para concluir a aula."}</span></section>;
}

function progressFromRows(rows: AcademyLessonProgress[]): AcademyProgress {
  return rows.reduce<AcademyProgress>((result, row) => {
    if (row.answer_index !== null && row.answer_index !== undefined) result.answers[row.lesson_id] = row.answer_index;
    if (row.draft_text) result.drafts[row.lesson_id] = row.draft_text;
    if (row.completed_at) result.completed.push(row.lesson_id);
    if (!result.updatedAt || row.updated_at > result.updatedAt) result.updatedAt = row.updated_at;
    return result;
  }, { completed: [], answers: {}, drafts: {}, pending: [] });
}

function mergeRemoteWithPending(remote: AcademyProgress, local: AcademyProgress) {
  const merged: AcademyProgress = { ...remote, completed: [...remote.completed], answers: { ...remote.answers }, drafts: { ...remote.drafts }, pending: [...local.pending] };
  for (const lessonId of local.pending) {
    if (local.answers[lessonId] !== undefined) merged.answers[lessonId] = local.answers[lessonId];
    else delete merged.answers[lessonId];
    if (local.drafts[lessonId] !== undefined) merged.drafts[lessonId] = local.drafts[lessonId];
    if (local.completed.includes(lessonId) && !merged.completed.includes(lessonId)) merged.completed.push(lessonId);
  }
  return merged;
}

export default function AcademiaNorteP({ profile, profiles = [], session }: { profile: Profile; profiles?: Profile[]; session?: Session | null }) {
  const role = academyRole(profile);
  const track = curriculum.roles[role];
  const modules = useMemo(() => [...curriculum.commonModules, ...track.modules], [track]);
  const lessons = useMemo(() => modules.flatMap(module => module.lessons), [modules]);
  const [tab, setTab] = useState<AcademyTab>("formacao");
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0]?.id || "");
  const [progress, setProgress] = useState<AcademyProgress>(emptyProgress);
  const [syncState, setSyncState] = useState<AcademySyncState>(session ? "loading" : "local");
  const [teamSummary, setTeamSummary] = useState<AcademyTeamSummary[]>([]);
  const [certificate, setCertificate] = useState<AcademyCertificate | null>(null);
  const selectedLesson = lessons.find(lesson => lesson.id === selectedLessonId) || lessons[0];
  const selectedModule = modules.find(module => module.lessons.some(lesson => lesson.id === selectedLesson?.id));
  const managers = profile.role === "admin" || profile.role === "coordenador" || profile.role === "supervisor";
  const completedCount = lessons.filter(lesson => progress.completed.includes(lesson.id)).length;
  const progressPercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  const correctAnswers = lessons.filter(lesson => progress.answers[lesson.id] === lesson.quiz.answer).length;
  const score = lessons.length ? Math.round((correctAnswers / lessons.length) * 100) : 0;
  const eligible = completedCount === lessons.length && score >= curriculum.certification.minimumScore;

  const storeProgress = (next: AcademyProgress) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setProgress(updated);
    try { localStorage.setItem(progressKey(profile.id, role), JSON.stringify(updated)); } catch { /* O banco continua sendo a fonte principal quando o cache local não está disponível. */ }
    return updated;
  };

  const syncLesson = async (lessonId: string, snapshot: AcademyProgress) => {
    if (!session) return false;
    setSyncState("syncing");
    try {
      const result = await saveAcademyLessonProgress(session, {
        curriculumVersion: curriculum.version,
        lessonId,
        answerIndex: snapshot.answers[lessonId] ?? null,
        draftText: snapshot.drafts[lessonId] || "",
        completed: snapshot.completed.includes(lessonId),
      });
      if (result?.certificate_issued) setCertificate(await loadAcademyCertificate(session, curriculum.version));
      setProgress(current => {
        const unchanged = current.answers[lessonId] === snapshot.answers[lessonId]
          && (current.drafts[lessonId] || "") === (snapshot.drafts[lessonId] || "")
          && current.completed.includes(lessonId) === snapshot.completed.includes(lessonId);
        if (!unchanged) return current;
        const next = { ...current, pending: current.pending.filter(id => id !== lessonId), updatedAt: new Date().toISOString() };
        try { localStorage.setItem(progressKey(profile.id, role), JSON.stringify(next)); } catch { /* Cache opcional. */ }
        return next;
      });
      setSyncState("synced");
      return true;
    } catch {
      setSyncState("error");
      return false;
    }
  };

  const commitProgress = (next: AcademyProgress, lessonId: string) => {
    const staged = storeProgress({ ...next, pending: session ? Array.from(new Set([...next.pending, lessonId])) : next.pending });
    if (session) void syncLesson(lessonId, staged);
  };

  const syncPending = async () => {
    if (!session || !progress.pending.length) return;
    const snapshot = progress;
    for (const lessonId of snapshot.pending) await syncLesson(lessonId, snapshot);
  };

  useEffect(() => {
    let active = true;
    const local = readProgress(profile.id, role);
    setProgress(local);
    if (!session) { setSyncState("local"); return () => { active = false; }; }
    setSyncState("loading");
    Promise.all([
      loadAcademyProgress(session, curriculum.version),
      loadAcademyCertificate(session, curriculum.version),
      managers ? loadAcademyTeamSummary(session, curriculum.version) : Promise.resolve([] as AcademyTeamSummary[]),
    ]).then(([rows, ownCertificate, summary]) => {
      if (!active) return;
      const merged = mergeRemoteWithPending(progressFromRows(rows), local);
      setProgress(merged);
      setCertificate(ownCertificate);
      setTeamSummary(summary);
      setSyncState(merged.pending.length ? "error" : "synced");
      try { localStorage.setItem(progressKey(profile.id, role), JSON.stringify(merged)); } catch { /* Cache opcional. */ }
    }).catch(() => {
      if (active) setSyncState("error");
    });
    return () => { active = false; };
  }, [profile.id, role, session, managers]);

  const updateDraft = (lessonId: string, value: string) => commitProgress({ ...progress, drafts: { ...progress.drafts, [lessonId]: value } }, lessonId);
  const answerQuiz = (lessonId: string, answer: number) => commitProgress({ ...progress, answers: { ...progress.answers, [lessonId]: answer } }, lessonId);
  const completeLesson = (lesson: AcademyLesson) => {
    if (progress.answers[lesson.id] !== lesson.quiz.answer || !(progress.drafts[lesson.id] || "").trim()) return;
    if (progress.completed.includes(lesson.id)) return;
    commitProgress({ ...progress, completed: [...progress.completed, lesson.id] }, lesson.id);
  };
  const openLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setTab("formacao");
    if (typeof window !== "undefined") window.requestAnimationFrame(() => document.querySelector(".academy-lesson")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const profileCounts = profiles.reduce<Record<string, number>>((counts, item) => {
    const key = item.is_primary_admin ? "fundadora" : item.role === "admin" ? "administrador" : item.role;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const summaryPeople = teamSummary.reduce((total, item) => total + Number(item.people), 0);
  const summaryStarted = teamSummary.reduce((total, item) => total + Number(item.started), 0);
  const summaryCompleted = teamSummary.reduce((total, item) => total + Number(item.completed), 0);
  const summaryAverage = summaryPeople
    ? Math.round(teamSummary.reduce((total, item) => total + Number(item.average_progress) * Number(item.people), 0) / summaryPeople)
    : 0;
  const distribution = teamSummary.length
    ? teamSummary.map(item => ({ key: item.role_key, count: Number(item.people), progress: Number(item.average_progress) }))
    : Object.entries(profileCounts).map(([key, count]) => ({ key, count, progress: 0 }));
  const distributionPeople = Math.max(teamSummary.length ? summaryPeople : profiles.length, 1);
  const syncCopy = syncState === "loading"
    ? { title: "Carregando sua formação", detail: "Buscando o progresso protegido da sua conta." }
    : syncState === "syncing"
      ? { title: "Salvando com segurança", detail: "A atualização está sendo registrada no NorteP." }
      : syncState === "synced" && !progress.pending.length
        ? { title: "Progresso protegido", detail: "Aulas, exercícios e avaliações estão sincronizados entre seus aparelhos." }
        : syncState === "local"
          ? { title: "Modo local", detail: "Entre na sua conta para sincronizar a formação entre aparelhos." }
          : { title: "Sincronização pendente", detail: `${progress.pending.length || 1} atualização(ões) protegida(s) neste aparelho aguardam conexão.` };

  return <section className="academy-shell" aria-label="Formação NorteP">
    <div className="academy-hero">
      <div>
        <small>ECOSSISTEMA NORTEP · FORMAÇÃO</small>
        <h2><span>N</span>orteP <b>Academia</b></h2>
        <p>{curriculum.subtitle}</p>
        <div className="academy-tags"><span>Trilha: {track.title}</span><span>{lessons.length} aulas</span><span>{modules.length} módulos</span></div>
      </div>
      <div className="academy-progress-card">
        <div className="academy-progress-ring" style={{ "--academy-progress": `${progressPercent * 3.6}deg` } as CSSProperties}><b>{progressPercent}%</b><small>concluído</small></div>
        <span><b>{profile.name.split(" ")[0]}</b><small>{academyRoleLabels[role]}</small><em>{completedCount} de {lessons.length} aulas</em></span>
      </div>
    </div>

    <div className={`academy-preview-note academy-sync-${syncState}`} role="status">
      <i>{syncState === "synced" && !progress.pending.length ? "✓" : syncState === "syncing" || syncState === "loading" ? "↻" : "i"}</i><span><b>{syncCopy.title}</b><small>{syncCopy.detail}</small></span>
      {session && progress.pending.length > 0 && <button type="button" onClick={() => void syncPending()} disabled={syncState === "syncing"}>Sincronizar agora</button>}
    </div>

    <nav className="academy-tabs" aria-label="Áreas da Formação NorteP">
      <button className={tab === "formacao" ? "active" : ""} onClick={() => setTab("formacao")}>Minha formação</button>
      <button className={tab === "biblioteca" ? "active" : ""} onClick={() => setTab("biblioteca")}>Biblioteca</button>
      {managers && <button className={tab === "acompanhamento" ? "active" : ""} onClick={() => setTab("acompanhamento")}>Acompanhamento</button>}
      <button className={tab === "certificado" ? "active" : ""} onClick={() => setTab("certificado")}>Certificação</button>
    </nav>

    {tab === "formacao" && <div className="academy-learning-grid">
      <aside className="academy-modules">
        <header><small>TRILHA ATUAL</small><h3>{track.title}</h3><p>{track.description}</p></header>
        {modules.map((module, index) => {
          const completedInModule = module.lessons.filter(lesson => progress.completed.includes(lesson.id)).length;
          return <details key={module.id} open={module.lessons.some(lesson => lesson.id === selectedLesson?.id) || index === 0}>
            <summary><i>{module.icon || "NP"}</i><span><b>{module.title}</b><small>{completedInModule}/{module.lessons.length} aulas</small></span></summary>
            {module.notice && <p className="academy-module-notice">{module.notice}</p>}
            <div>{module.lessons.map(lesson => <button key={lesson.id} className={lesson.id === selectedLesson?.id ? "active" : ""} onClick={() => openLesson(lesson.id)}><i>{progress.completed.includes(lesson.id) ? "✓" : "○"}</i><span>{lesson.title}<small>{lesson.duration} min</small></span></button>)}</div>
          </details>;
        })}
      </aside>

      {selectedLesson && <article className="academy-lesson">
        <header><span><small>{selectedModule?.title}</small><h3>{selectedLesson.title}</h3><p>{selectedLesson.objective}</p></span><em>{selectedLesson.duration} min</em></header>
        <section className="academy-content-block"><h4>O que você vai aprender</h4><ul>{selectedLesson.content.map((item, index) => <li key={`${selectedLesson.id}-content-${index}`}>{item}</li>)}</ul></section>
        {selectedLesson.example && <section className="academy-example"><i>✦</i><span><b>Exemplo prático</b><p>{selectedLesson.example}</p></span></section>}
        {selectedLesson.speak && (role === "instrutor" || profile.role === "admin" || profile.role === "coordenador" || profile.role === "supervisor") && <section className="academy-instructor"><b>Orientação para quem acompanha a formação</b><p>{selectedLesson.speak}</p></section>}
        <AcademyExercise key={selectedLesson.id} lesson={selectedLesson} initialValue={progress.drafts[selectedLesson.id] || ""} onSave={value => updateDraft(selectedLesson.id, value)} />
        <section className="academy-quiz"><small>AVALIAÇÃO RÁPIDA</small><h4>{selectedLesson.quiz.question}</h4><div>{selectedLesson.quiz.options.map((option, index) => {
          const chosen = progress.answers[selectedLesson.id] === index;
          const answered = progress.answers[selectedLesson.id] !== undefined;
          const correct = index === selectedLesson.quiz.answer;
          const className = chosen ? answered && correct ? "selected correct" : "selected incorrect" : "";
          return <button className={className} key={`${selectedLesson.id}-quiz-${index}`} disabled={progress.completed.includes(selectedLesson.id)} onClick={() => answerQuiz(selectedLesson.id, index)}><i>{chosen ? correct ? "✓" : "×" : String.fromCharCode(65 + index)}</i>{option}</button>;
        })}</div>{progress.answers[selectedLesson.id] !== undefined && <p className={progress.answers[selectedLesson.id] === selectedLesson.quiz.answer ? "quiz-ok" : "quiz-try"}>{progress.answers[selectedLesson.id] === selectedLesson.quiz.answer ? selectedLesson.quiz.feedback : "Revise a aula e tente novamente."}</p>}</section>
        <footer><span><b>{progress.completed.includes(selectedLesson.id) ? "Aula concluída" : "Para concluir"}</b><small>Responda corretamente e registre o exercício.</small></span><button className="primary" disabled={progress.completed.includes(selectedLesson.id) || progress.answers[selectedLesson.id] !== selectedLesson.quiz.answer || !(progress.drafts[selectedLesson.id] || "").trim()} onClick={() => completeLesson(selectedLesson)}>{progress.completed.includes(selectedLesson.id) ? "✓ Concluída" : "Concluir aula"}</button></footer>
      </article>}
    </div>}

    {tab === "biblioteca" && <div className="academy-library">
      <div className="academy-section-title"><small>BIBLIOTECA DE APRENDIZAGEM</small><h3>Materiais organizados por tema</h3><p>Os conteúdos do kit foram incorporados às trilhas. Abra um módulo para estudar, praticar e responder à avaliação.</p></div>
      <div className="academy-library-grid">{modules.map(module => <article key={module.id}><i>{module.icon || "NP"}</i><span><small>{module.lessons.length} AULAS</small><h4>{module.title}</h4><p>{module.lessons.map(lesson => lesson.title).slice(0, 3).join(" · ")}</p><button onClick={() => openLesson(module.lessons[0].id)}>Estudar módulo →</button></span></article>)}</div>
      {(profile.role === "admin" || profile.role === "coordenador") && <section className="academy-catalog"><small>CATÁLOGO DE TRILHAS</small><h3>Formação por responsabilidade</h3><div>{(Object.entries(curriculum.roles) as Array<[AcademyRole, AcademyTrack]>).map(([key, item]) => <span key={key}><b>{academyRoleLabels[key]}</b><small>{totalLessons(item.modules)} aulas específicas</small></span>)}</div></section>}
    </div>}

    {tab === "acompanhamento" && managers && <div className="academy-dashboard">
      <div className="academy-section-title"><small>PAINEL DE ACOMPANHAMENTO</small><h3>Prontidão da equipe visível para este perfil</h3><p>Os totais respeitam a equipe e o território já devolvidos pelo NorteP. Nenhum contato pessoal é exibido aqui.</p></div>
      <div className="academy-manager-metrics"><article><small>PESSOAS VISÍVEIS</small><b>{teamSummary.length ? summaryPeople : profiles.length}</b><span>conforme a permissão atual</span></article><article><small>FORMAÇÃO INICIADA</small><b>{teamSummary.length ? summaryStarted : 0}</b><span>pessoas com atividade registrada</span></article><article><small>TRILHA CONCLUÍDA</small><b>{teamSummary.length ? summaryCompleted : 0}</b><span>{summaryAverage}% de progresso médio</span></article><article><small>VERSÃO DO CONTEÚDO</small><b>{curriculum.version}</b><span>{Object.keys(curriculum.roles).length} trilhas por função</span></article></div>
      <section className="academy-role-distribution"><header><span><small>DISTRIBUIÇÃO</small><h3>Perfis da equipe</h3></span><em>Dados agregados</em></header><div>{distribution.length ? distribution.map(item => <article key={item.key}><span><b>{academyRoleLabels[item.key as AcademyRole] || roleLabel(item.key as Profile["role"])}</b><small>{item.count} pessoa(s){teamSummary.length ? ` · ${item.progress}% concluído` : ""}</small></span><div><i style={{ width: `${Math.max(8, Math.round((item.count / distributionPeople) * 100))}%` }} /></div><strong>{Math.round((item.count / distributionPeople) * 100)}%</strong></article>) : <p>Nenhuma pessoa da equipe foi carregada para este perfil.</p>}</div></section>
      <section className="academy-sync-plan"><i>✓</i><span><b>Acompanhamento central ativado</b><p>Os indicadores usam somente dados agregados da equipe que este perfil tem permissão para acompanhar. Contatos pessoais não aparecem aqui.</p></span></section>
    </div>}

    {tab === "certificado" && <div className="academy-certificate-area">
      <div className="academy-certificate">
        <small>ACADEMIA NORTEP · CERTIFICAÇÃO</small><i><b>N</b>P</i><h3>{certificate?.status === "active" ? "Certificado emitido" : eligible ? "Validando conclusão" : "Certificação em andamento"}</h3><p>Trilha de {track.title} para <b>{profile.name}</b>.</p><div><span><b>{progressPercent}%</b><small>aulas concluídas</small></span><span><b>{score}%</b><small>aproveitamento</small></span><span><b>{curriculum.certification.minimumScore}%</b><small>nota mínima</small></span></div><ul>{curriculum.certification.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul><button disabled={certificate?.status !== "active"} onClick={() => window.print()}>{certificate?.status === "active" ? "Imprimir certificado" : eligible ? "Sincronizando certificado…" : "Conclua a trilha para liberar"}</button><em>{certificate?.status === "active" ? `Emitido em ${new Date(certificate.issued_at).toLocaleDateString("pt-BR")} e validado pela Academia NorteP.` : "O certificado oficial é liberado depois que todos os requisitos forem validados no NorteP."}</em>
      </div>
    </div>}
  </section>;
}
