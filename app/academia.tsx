"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import curriculumSource from "./academia-v51-content.json";
import { AcademyContentEditor, AcademyInstructorPanel, type EditableAcademyLesson } from "./academia-management";
import { loadAcademyCertificate, loadAcademyPractice, loadAcademyProgress, loadAcademyTeamSummary, loadPublishedAcademyContent, requestAcademyRecertification, saveAcademyLessonProgress, submitAcademyPractice, type AcademyCertificate, type AcademyLessonProgress, type AcademyPractice, type AcademyTeamSummary, type Profile, type Session } from "./supabase";

type AcademyRole = "pesquisador" | "supervisor";
type AcademyTab = "formacao" | "biblioteca" | "acompanhamento" | "certificado";
type InstructorTab = "planos" | "praticas" | "editor";

type AcademyQuiz = {
  question: string;
  options: string[];
  feedback: string;
};

type AcademyLesson = {
  id: string;
  title: string;
  duration: number;
  objective: string;
  context?: string;
  content: string[];
  video?: { label: string; url: string };
  speak?: string;
  example: string;
  activity: string;
  quiz: AcademyQuiz;
  instructor?: {
    opening?: string;
    demonstration?: string;
    guidingQuestions?: string[];
    expectedResponse?: string;
    rubric?: string[];
    notes?: string;
  };
};

type AcademyPresentationSlide = {
  lessonId: string;
  moduleTitle: string;
  kind: "abertura" | "conceito" | "caso" | "pratica";
  eyebrow: string;
  title: string;
  text?: string;
  bullets?: string[];
  image: string;
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
  correctness: Record<string, boolean>;
  drafts: Record<string, string>;
  pending: string[];
  updatedAt?: string;
};

type AcademySyncState = "loading" | "synced" | "syncing" | "local" | "error";

const curriculum = curriculumSource as AcademyCurriculum;
const emptyProgress: AcademyProgress = { completed: [], answers: {}, correctness: {}, drafts: {}, pending: [] };

const academyRoleLabels: Record<AcademyRole, string> = {
  pesquisador: "Pesquisador(a)",
  supervisor: "Supervisor(a)",
};

function progressKey(profileId: string, role: AcademyRole) {
  return `nortep-academia-preview-${curriculum.version}-${profileId}-${role}`;
}

function readProgress(profileId: string, role: AcademyRole): AcademyProgress {
  if (typeof window === "undefined") return emptyProgress;
  try {
    const parsed = JSON.parse(localStorage.getItem(progressKey(profileId, role)) || "null") as AcademyProgress | null;
    if (!parsed || !Array.isArray(parsed.completed)) return emptyProgress;
    return { completed: parsed.completed, answers: parsed.answers || {}, correctness: parsed.correctness || {}, drafts: parsed.drafts || {}, pending: parsed.pending || [], updatedAt: parsed.updatedAt };
  } catch {
    return emptyProgress;
  }
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
  return <section className="academy-exercise"><small>EXERCÍCIO · PRÁTICA GUIADA</small><h4>{lesson.activity}</h4><p>Responda uma etapa de cada vez. Você pode salvar uma parte, sair e continuar depois.</p><textarea value={draft} onChange={event => { setDraft(event.target.value); setSaved(false); }} onBlur={save} placeholder="Escreva sua resposta em tópicos curtos. Exemplo: 1. O que observei; 2. O que faria; 3. Como registraria." /><div className="academy-exercise-actions"><span>{saved ? "✓ Exercício salvo" : draft.trim() ? "Há alterações para salvar." : "Você pode começar quando quiser."}</span><button type="button" onClick={save} disabled={!draft.trim() || saved}>{saved ? "Salvo" : "Salvar exercício"}</button></div></section>;
}

function presentationImage(audience: AcademyRole, kind: AcademyPresentationSlide["kind"]) {
  if (audience === "supervisor") return "/academia/mist-supervisao.jpg";
  if (kind === "caso" || kind === "pratica") return "/academia/mist-escuta.jpg";
  return "/academia/mist-pesquisa.jpg";
}

function buildPresentationSlides(modules: AcademyModule[], audience: AcademyRole): AcademyPresentationSlide[] {
  return modules.flatMap(module => module.lessons.flatMap(lesson => [
    { lessonId: lesson.id, moduleTitle: module.title, kind: "abertura" as const, eyebrow: "POR QUE ESTA AULA IMPORTA", title: lesson.title, text: lesson.objective, bullets: lesson.context ? [lesson.context] : [], image: presentationImage(audience, "abertura") },
    { lessonId: lesson.id, moduleTitle: module.title, kind: "conceito" as const, eyebrow: "IDEIAS ESSENCIAIS", title: "O que precisa ficar claro", bullets: lesson.content, image: presentationImage(audience, "conceito") },
    { lessonId: lesson.id, moduleTitle: module.title, kind: "caso" as const, eyebrow: "ESTUDO DE CASO", title: "O que você faria nesta situação?", text: lesson.example, bullets: lesson.instructor?.guidingQuestions || [lesson.quiz.question], image: presentationImage(audience, "caso") },
    { lessonId: lesson.id, moduleTitle: module.title, kind: "pratica" as const, eyebrow: "DINÂMICA DA TURMA", title: "Agora é com vocês", text: lesson.activity, bullets: lesson.instructor?.rubric || ["Explique sua escolha", "Mantenha neutralidade e respeito", "Registre apenas o necessário"], image: presentationImage(audience, "pratica") },
  ]));
}

function buildLearnerPresentationSlides(lesson: AcademyLesson, moduleTitle: string, audience: AcademyRole): AcademyPresentationSlide[] {
  return [
    { lessonId: lesson.id, moduleTitle, kind: "abertura", eyebrow: "POR QUE ESTA AULA IMPORTA", title: lesson.title, text: lesson.objective, bullets: lesson.context ? [lesson.context] : [], image: presentationImage(audience, "abertura") },
    { lessonId: lesson.id, moduleTitle, kind: "conceito", eyebrow: "IDEIAS ESSENCIAIS", title: "O que você precisa compreender", bullets: lesson.content, image: presentationImage(audience, "conceito") },
    { lessonId: lesson.id, moduleTitle, kind: "caso", eyebrow: "EXEMPLO PRÁTICO", title: "Pense nesta situação", text: lesson.example, bullets: [lesson.quiz.question], image: presentationImage(audience, "caso") },
    { lessonId: lesson.id, moduleTitle, kind: "pratica", eyebrow: "PRÁTICA GUIADA", title: "Agora é com você", text: lesson.activity, bullets: ["Responda com suas próprias palavras", "Use o que aprendeu nesta aula", "Depois volte à aula para fazer o exercício e a avaliação"], image: presentationImage(audience, "pratica") },
  ];
}

function AcademyPresentation({ slides, index, setIndex, onClose }: { slides: AcademyPresentationSlide[]; index: number; setIndex: (index: number) => void; onClose: () => void }) {
  const slide = slides[index];
  if (!slide) return null;
  const previous = () => setIndex(Math.max(0, index - 1));
  const next = () => setIndex(Math.min(slides.length - 1, index + 1));
  return <section className={`academy-presentation academy-presentation-${slide.kind}`} aria-label="Apresentação da aula" tabIndex={0} onKeyDown={event => { if (event.key === "ArrowLeft") previous(); if (event.key === "ArrowRight") next(); if (event.key === "Escape") onClose(); }}>
    <header><span><small>{slide.eyebrow}</small><b>{slide.moduleTitle}</b></span><div><em>{index + 1} / {slides.length}</em><button type="button" onClick={onClose}>Fechar apresentação</button></div></header>
    <div className="academy-presentation-stage">
      <div className="academy-presentation-copy"><small>{slide.moduleTitle}</small><h3>{slide.title}</h3>{slide.text && <p>{slide.text}</p>}{slide.bullets?.length ? <ul>{slide.bullets.map(item => <li key={item}>{item}</li>)}</ul> : null}</div>
      <figure><img src={slide.image} alt="Ilustração educativa da Academia NorteP" /><figcaption>M.I.S.T. · formação prática e responsável</figcaption></figure>
    </div>
    <footer><button type="button" onClick={previous} disabled={index === 0}>← Anterior</button><span><i style={{ width: `${((index + 1) / slides.length) * 100}%` }} /></span><button type="button" onClick={next} disabled={index === slides.length - 1}>Próximo →</button></footer>
  </section>;
}

function progressFromRows(rows: AcademyLessonProgress[]): AcademyProgress {
  return rows.reduce<AcademyProgress>((result, row) => {
    if (row.answer_index !== null && row.answer_index !== undefined) result.answers[row.lesson_id] = row.answer_index;
    result.correctness[row.lesson_id] = row.answer_correct;
    if (row.draft_text) result.drafts[row.lesson_id] = row.draft_text;
    if (row.completed_at) result.completed.push(row.lesson_id);
    if (!result.updatedAt || row.updated_at > result.updatedAt) result.updatedAt = row.updated_at;
    return result;
  }, { completed: [], answers: {}, correctness: {}, drafts: {}, pending: [] });
}

function mergeRemoteWithPending(remote: AcademyProgress, local: AcademyProgress) {
  const merged: AcademyProgress = { ...remote, completed: [...remote.completed], answers: { ...remote.answers }, correctness: { ...remote.correctness }, drafts: { ...remote.drafts }, pending: [...local.pending] };
  for (const lessonId of local.pending) {
    if (local.answers[lessonId] !== undefined) merged.answers[lessonId] = local.answers[lessonId];
    else delete merged.answers[lessonId];
    if (local.drafts[lessonId] !== undefined) merged.drafts[lessonId] = local.drafts[lessonId];
    if (local.correctness[lessonId] !== undefined) merged.correctness[lessonId] = local.correctness[lessonId];
    if (local.completed.includes(lessonId) && !merged.completed.includes(lessonId)) merged.completed.push(lessonId);
  }
  return merged;
}

function curriculumWithPublishedContent(base: AcademyCurriculum, published: Array<{ lesson_id: string; content: Record<string, unknown> }>) {
  if (!published.length) return base;
  const overrides = new Map(published.map(item => [item.lesson_id, item.content]));
  const updateModules = (modules: AcademyModule[]) => modules.map(module => ({
    ...module,
    lessons: module.lessons.map(lesson => ({ ...lesson, ...(overrides.get(lesson.id) || {}) }) as AcademyLesson),
  }));
  return {
    ...base,
    commonModules: updateModules(base.commonModules),
    roles: Object.fromEntries(Object.entries(base.roles).map(([key, track]) => [key, { ...track, modules: updateModules(track.modules) }])) as Record<AcademyRole, AcademyTrack>,
  };
}

export default function AcademiaNorteP({ profile, profiles = [], session }: { profile: Profile; profiles?: Profile[]; session?: Session | null }) {
  const [activeCurriculum, setActiveCurriculum] = useState(curriculum);
  const role: AcademyRole = profile.role === "supervisor" ? "supervisor" : "pesquisador";
  const track = activeCurriculum.roles[role];
  const modules = useMemo(() => [...activeCurriculum.commonModules, ...track.modules], [activeCurriculum, track]);
  const lessons = useMemo(() => modules.flatMap(module => module.lessons), [modules]);
  const [tab, setTab] = useState<AcademyTab>("formacao");
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0]?.id || "");
  const [learnerPresentationOpen, setLearnerPresentationOpen] = useState(false);
  const [learnerPresentationIndex, setLearnerPresentationIndex] = useState(0);
  const [progress, setProgress] = useState<AcademyProgress>(emptyProgress);
  const [syncState, setSyncState] = useState<AcademySyncState>(session ? "loading" : "local");
  const [teamSummary, setTeamSummary] = useState<AcademyTeamSummary[]>([]);
  const [certificate, setCertificate] = useState<AcademyCertificate | null>(null);
  const [practice, setPractice] = useState<AcademyPractice | null>(null);
  const [practiceText, setPracticeText] = useState("");
  const [practiceMessage, setPracticeMessage] = useState("");
  const [renderedAt] = useState(() => Date.now());
  const selectedLesson = lessons.find(lesson => lesson.id === selectedLessonId) || lessons[0];
  const selectedLessonIndex = lessons.findIndex(lesson => lesson.id === selectedLesson?.id);
  const previousLesson = selectedLessonIndex > 0 ? lessons[selectedLessonIndex - 1] : null;
  const nextLesson = selectedLessonIndex >= 0 && selectedLessonIndex < lessons.length - 1 ? lessons[selectedLessonIndex + 1] : null;
  const selectedModule = modules.find(module => module.lessons.some(lesson => lesson.id === selectedLesson?.id));
  const learnerPresentationSlides = useMemo(() => selectedLesson && selectedModule ? buildLearnerPresentationSlides(selectedLesson, selectedModule.title, role) : [], [selectedLesson, selectedModule, role]);
  const managers = profile.role === "supervisor";
  const completedCount = lessons.filter(lesson => progress.completed.includes(lesson.id)).length;
  const progressPercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  const correctAnswers = lessons.filter(lesson => progress.correctness[lesson.id]).length;
  const score = lessons.length ? Math.round((correctAnswers / lessons.length) * 100) : 0;
  const eligible = completedCount === lessons.length && score >= activeCurriculum.certification.minimumScore && practice?.status === "approved";

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
        curriculumVersion: activeCurriculum.version,
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
        const next = { ...current, correctness: { ...current.correctness, [lessonId]: Boolean(result?.answer_correct) }, pending: current.pending.filter(id => id !== lessonId), updatedAt: new Date().toISOString() };
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
    const baseTrack = curriculum.roles[role];
    const resumeLessons = [...curriculum.commonModules, ...baseTrack.modules].flatMap(module => module.lessons);
    const local = readProgress(profile.id, role);
    setProgress(local);
    const localResume = resumeLessons.find(lesson => !local.completed.includes(lesson.id));
    setSelectedLessonId(current => local.completed.includes(current) ? localResume?.id || current : current);
    if (!session) { setSyncState("local"); return () => { active = false; }; }
    setSyncState("loading");
    Promise.all([
      loadAcademyProgress(session, curriculum.version),
      loadAcademyCertificate(session, curriculum.version),
      loadAcademyPractice(session, curriculum.version),
      loadPublishedAcademyContent(session, curriculum.version),
      managers ? loadAcademyTeamSummary(session, curriculum.version) : Promise.resolve([] as AcademyTeamSummary[]),
    ]).then(([rows, ownCertificate, ownPractice, published, summary]) => {
      if (!active) return;
      const merged = mergeRemoteWithPending(progressFromRows(rows), local);
      setProgress(merged);
      const remoteResume = resumeLessons.find(lesson => !merged.completed.includes(lesson.id));
      setSelectedLessonId(current => merged.completed.includes(current) ? remoteResume?.id || current : current);
      setCertificate(ownCertificate);
      setPractice(ownPractice);
      setPracticeText(ownPractice?.response_text || "");
      setActiveCurriculum(curriculumWithPublishedContent(curriculum, published));
      setTeamSummary(summary);
      setSyncState(merged.pending.length ? "error" : "synced");
      try { localStorage.setItem(progressKey(profile.id, role), JSON.stringify(merged)); } catch { /* Cache opcional. */ }
    }).catch(() => {
      if (active) setSyncState("error");
    });
    return () => { active = false; };
  }, [profile.id, role, session, managers]);

  const updateDraft = (lessonId: string, value: string) => commitProgress({ ...progress, drafts: { ...progress.drafts, [lessonId]: value } }, lessonId);
  const answerQuiz = (lessonId: string, answer: number) => commitProgress({ ...progress, answers: { ...progress.answers, [lessonId]: answer }, correctness: { ...progress.correctness, [lessonId]: false } }, lessonId);
  const completeLesson = (lesson: AcademyLesson) => {
    const hasExercise = Boolean((progress.drafts[lesson.id] || "").trim());
    const hasQuizAnswer = progress.answers[lesson.id] !== undefined;
    if (!hasExercise || !hasQuizAnswer) return;
    if (!progress.completed.includes(lesson.id)) commitProgress({ ...progress, completed: [...progress.completed, lesson.id] }, lesson.id);
    const lessonIndex = lessons.findIndex(item => item.id === lesson.id);
    const followingLesson = lessonIndex >= 0 ? lessons[lessonIndex + 1] : null;
    if (followingLesson) openLesson(followingLesson.id);
  };

  const submitPractice = async () => {
    if (!session) { setPracticeMessage("Entre na sua conta para enviar a prática à instrutora."); return; }
    setPracticeMessage("Enviando prática…");
    try {
      await submitAcademyPractice(session, activeCurriculum.version, practiceText);
      setPractice(await loadAcademyPractice(session, activeCurriculum.version));
      setPracticeMessage("Prática enviada para avaliação da instrutora.");
    } catch (error) { setPracticeMessage(error instanceof Error ? error.message : "Não foi possível enviar a prática."); }
  };

  const requestRecertification = async () => {
    if (!session) return;
    setPracticeMessage("Abrindo recertificação…");
    try {
      await requestAcademyRecertification(session, activeCurriculum.version);
      setCertificate(await loadAcademyCertificate(session, activeCurriculum.version));
      setPractice(await loadAcademyPractice(session, activeCurriculum.version));
      setPracticeMessage("Recertificação aberta. Atualize e reenvie sua prática.");
    } catch (error) { setPracticeMessage(error instanceof Error ? error.message : "Não foi possível abrir a recertificação."); }
  };
  const openLesson = (lessonId: string) => {
    setLearnerPresentationOpen(false);
    setLearnerPresentationIndex(0);
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
  const summaryAwaitingPractice = teamSummary.reduce((total, item) => total + Number(item.awaiting_practice || 0), 0);
  const summaryCertified = teamSummary.reduce((total, item) => total + Number(item.certified || 0), 0);
  const summaryRecertification = teamSummary.reduce((total, item) => total + Number(item.recertification_due || 0), 0);
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
        <header><span><small>AULA {selectedLessonIndex + 1} DE {lessons.length} · {selectedModule?.title}</small><h3>{selectedLesson.title}</h3><p>{selectedLesson.objective}</p></span><em>{selectedLesson.duration} min</em></header>
        <div className="academy-audience-switch"><span><small>RESUMO VISUAL DA AULA</small><b>Apresentação para {academyRoleLabels[role]}</b></span><div><button className="academy-presentation-open" type="button" onClick={() => { setLearnerPresentationIndex(0); setLearnerPresentationOpen(true); }}>▣ Ver apresentação desta aula</button></div></div>
        {learnerPresentationOpen && <AcademyPresentation slides={learnerPresentationSlides} index={learnerPresentationIndex} setIndex={setLearnerPresentationIndex} onClose={() => setLearnerPresentationOpen(false)} />}
        {selectedLesson.context && <section className="academy-context"><small>CONTEXTO DA AULA</small><p>{selectedLesson.context}</p></section>}
        <section className="academy-content-block"><h4>O que você vai aprender</h4><ul>{selectedLesson.content.map((item, index) => <li key={`${selectedLesson.id}-content-${index}`}>{item}</li>)}</ul></section>
        {selectedLesson.video && <section className="academy-video-slot"><span><small>VÍDEO DA AULA</small><b>{selectedLesson.video.label}</b><p>{selectedLesson.video.url ? "Abra o material em vídeo para complementar esta aula." : "Espaço reservado para inserir o link do vídeo desta aula."}</p></span>{selectedLesson.video.url ? <a href={selectedLesson.video.url} target="_blank" rel="noreferrer">Abrir vídeo</a> : <button type="button" disabled>Link será adicionado</button>}</section>}
        {selectedLesson.example && <section className="academy-example"><i>✦</i><span><b>Exemplo prático</b><p>{selectedLesson.example}</p></span></section>}
        <AcademyExercise key={selectedLesson.id} lesson={selectedLesson} initialValue={progress.drafts[selectedLesson.id] || ""} onSave={value => updateDraft(selectedLesson.id, value)} />
        <section className="academy-quiz"><small>AVALIAÇÃO RÁPIDA</small><h4>{selectedLesson.quiz.question}</h4><div>{selectedLesson.quiz.options.map((option, index) => {
          const chosen = progress.answers[selectedLesson.id] === index;
          const correct = Boolean(progress.correctness[selectedLesson.id]);
          const validated = chosen && !progress.pending.includes(selectedLesson.id) && syncState !== "syncing";
          const className = chosen ? validated && correct ? "selected correct" : validated ? "selected incorrect" : "selected" : "";
          return <button className={className} key={`${selectedLesson.id}-quiz-${index}`} disabled={syncState === "syncing" && progress.pending.includes(selectedLesson.id)} onClick={() => answerQuiz(selectedLesson.id, index)}><i>{chosen ? validated ? correct ? "✓" : "×" : "↻" : String.fromCharCode(65 + index)}</i>{option}</button>;
        })}</div>{progress.answers[selectedLesson.id] !== undefined && <p className={progress.pending.includes(selectedLesson.id) ? "quiz-try" : progress.correctness[selectedLesson.id] ? "quiz-ok" : "quiz-try"}>{progress.pending.includes(selectedLesson.id) ? "Resposta salva e aguardando validação protegida no NorteP." : progress.correctness[selectedLesson.id] ? selectedLesson.quiz.feedback : "Você pode tentar novamente agora ou continuar e voltar depois."}</p>}</section>
        <footer><span><b>{progress.completed.includes(selectedLesson.id) ? "Aula concluída" : "Quando quiser avançar"}</b><small>Salve o exercício e marque uma resposta. Você poderá voltar e melhorar sua pontuação.</small></span><div className="academy-lesson-navigation">{previousLesson && <button type="button" className="secondary" onClick={() => openLesson(previousLesson.id)}>← Aula anterior</button>}<button className="primary" disabled={!progress.completed.includes(selectedLesson.id) && (progress.answers[selectedLesson.id] === undefined || !(progress.drafts[selectedLesson.id] || "").trim())} onClick={() => completeLesson(selectedLesson)}>{progress.completed.includes(selectedLesson.id) ? nextLesson ? "Próxima aula →" : "✓ Trilha estudada" : nextLesson ? "Concluir e continuar →" : "Concluir aula"}</button></div></footer>
      </article>}
    </div>}

    {tab === "biblioteca" && <div className="academy-library">
      <div className="academy-section-title"><small>BIBLIOTECA DE APRENDIZAGEM</small><h3>Materiais organizados por tema</h3><p>Os conteúdos do kit foram incorporados às trilhas. Abra um módulo para estudar, praticar e responder à avaliação.</p></div>
      <div className="academy-library-grid">{modules.map(module => <article key={module.id}><i>{module.icon || "NP"}</i><span><small>{module.lessons.length} AULAS</small><h4>{module.title}</h4><p>{module.lessons.map(lesson => lesson.title).slice(0, 3).join(" · ")}</p><button onClick={() => openLesson(module.lessons[0].id)}>Estudar módulo →</button></span></article>)}</div>
    </div>}

    {tab === "acompanhamento" && managers && <div className="academy-dashboard">
      <div className="academy-section-title"><small>PAINEL DE ACOMPANHAMENTO</small><h3>Prontidão da equipe visível para este perfil</h3><p>Os totais respeitam a equipe e o território já devolvidos pelo NorteP. Nenhum contato pessoal é exibido aqui.</p></div>
      <div className="academy-manager-metrics"><article><small>PESSOAS VISÍVEIS</small><b>{teamSummary.length ? summaryPeople : profiles.length}</b><span>conforme a permissão atual</span></article><article><small>FORMAÇÃO INICIADA</small><b>{teamSummary.length ? summaryStarted : 0}</b><span>pessoas com atividade registrada</span></article><article><small>TRILHA CONCLUÍDA</small><b>{teamSummary.length ? summaryCompleted : 0}</b><span>{summaryAverage}% de progresso médio</span></article><article><small>PRÁTICAS PENDENTES</small><b>{summaryAwaitingPractice}</b><span>aguardando instrutoria</span></article><article><small>CERTIFICADOS ATIVOS</small><b>{summaryCertified}</b><span>{summaryRecertification} para recertificar</span></article><article><small>VERSÃO DO CONTEÚDO</small><b>{activeCurriculum.version}</b><span>{Object.keys(activeCurriculum.roles).length} trilhas por função</span></article></div>
      <section className="academy-role-distribution"><header><span><small>DISTRIBUIÇÃO</small><h3>Perfis da equipe</h3></span><em>Dados agregados</em></header><div>{distribution.length ? distribution.map(item => <article key={item.key}><span><b>{academyRoleLabels[item.key as AcademyRole] || roleLabel(item.key as Profile["role"])}</b><small>{item.count} pessoa(s){teamSummary.length ? ` · ${item.progress}% concluído` : ""}</small></span><div><i style={{ width: `${Math.max(8, Math.round((item.count / distributionPeople) * 100))}%` }} /></div><strong>{Math.round((item.count / distributionPeople) * 100)}%</strong></article>) : <p>Nenhuma pessoa da equipe foi carregada para este perfil.</p>}</div></section>
      <section className="academy-sync-plan"><i>✓</i><span><b>Acompanhamento central ativado</b><p>Os indicadores usam somente dados agregados da equipe que este perfil tem permissão para acompanhar. Contatos pessoais não aparecem aqui.</p></span></section>
    </div>}

    {tab === "certificado" && <div className="academy-certificate-area">
      <div className="academy-certificate">
        <small>ACADEMIA NORTEP · CERTIFICAÇÃO</small><i><b>N</b>P</i><h3>{certificate?.status === "active" ? "Certificado emitido" : eligible ? "Validando conclusão" : certificate?.status === "expired" ? "Certificado vencido" : "Certificação em andamento"}</h3><p>Trilha de {track.title} para <b>{profile.name}</b>.</p><div><span><b>{progressPercent}%</b><small>aulas concluídas</small></span><span><b>{score}%</b><small>aproveitamento</small></span><span><b>{practice?.status === "approved" ? "✓" : "—"}</b><small>prática aprovada</small></span></div><ul>{activeCurriculum.certification.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul>
        <section className="academy-practice-form"><label>Prática obrigatória<textarea value={practiceText} onChange={event => setPracticeText(event.target.value)} placeholder="Descreva uma situação real ou simulação: contexto, decisão tomada, procedimento aplicado e resultado." /></label><button onClick={() => void submitPractice()} disabled={practiceText.trim().length < 20}>{practice?.status === "pending" ? "Reenviar prática" : "Enviar para a instrutora"}</button>{practice && <small>Status: {practice.status === "approved" ? "aprovada" : practice.status === "pending" ? "aguardando avaliação" : "ajustes solicitados"}{practice.reviewer_feedback ? ` · ${practice.reviewer_feedback}` : ""}</small>}{practiceMessage && <small role="status">{practiceMessage}</small>}</section>
        <button disabled={certificate?.status !== "active"} onClick={() => window.print()}>{certificate?.status === "active" ? "Imprimir certificado" : eligible ? "Sincronizando certificado…" : "Conclua a trilha e a prática"}</button><em>{certificate?.status === "active" ? `Emitido em ${new Date(certificate.issued_at).toLocaleDateString("pt-BR")}, válido até ${new Date(certificate.expires_at).toLocaleDateString("pt-BR")}.` : "O certificado oficial exige aulas, avaliações e prática aprovada."}</em>
        {certificate && (certificate.status === "expired" || new Date(certificate.expires_at).getTime() <= renderedAt + 60 * 86400000) && <button className="secondary" onClick={() => void requestRecertification()} disabled={Boolean(certificate.renewal_requested_at)}>{certificate.renewal_requested_at ? "Recertificação solicitada" : "Solicitar recertificação"}</button>}
      </div>
    </div>}
  </section>;
}

export function AcademiaInstrutoriaNorteP({ profile, session }: { profile: Profile; session: Session }) {
  const [activeCurriculum, setActiveCurriculum] = useState(curriculum);
  const [tab, setTab] = useState<InstructorTab>("planos");
  const [audience, setAudience] = useState<AcademyRole>("pesquisador");
  const modules = useMemo(() => [...activeCurriculum.commonModules, ...activeCurriculum.roles[audience].modules], [activeCurriculum, audience]);
  const lessons = useMemo(() => modules.flatMap(module => module.lessons), [modules]);
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0]?.id || "");
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationIndex, setPresentationIndex] = useState(0);
  const presentationSlides = useMemo(() => buildPresentationSlides(modules, audience), [modules, audience]);
  const selectedLesson = lessons.find(lesson => lesson.id === selectedLessonId) || lessons[0];
  const selectedModule = modules.find(module => module.lessons.some(lesson => lesson.id === selectedLesson?.id));
  const editableLessons = useMemo<EditableAcademyLesson[]>(() => {
    const common = activeCurriculum.commonModules.flatMap(module => module.lessons.map(lesson => ({ roleKey: "comum", moduleId: module.id, moduleTitle: `Comum · ${module.title}`, lesson })));
    const byRole = (Object.entries(activeCurriculum.roles) as Array<[AcademyRole, AcademyTrack]>).flatMap(([roleKey, roleTrack]) => roleTrack.modules.flatMap(module => module.lessons.map(lesson => ({ roleKey, moduleId: module.id, moduleTitle: `${roleTrack.title} · ${module.title}`, lesson }))));
    return [...common, ...byRole];
  }, [activeCurriculum]);

  useEffect(() => {
    let active = true;
    loadPublishedAcademyContent(session, curriculum.version)
      .then(published => { if (active) setActiveCurriculum(curriculumWithPublishedContent(curriculum, published)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!lessons.some(lesson => lesson.id === selectedLessonId)) setSelectedLessonId(lessons[0]?.id || "");
    setPresentationIndex(0);
    setPresentationOpen(false);
  }, [audience, lessons, selectedLessonId]);

  if (!(profile.role === "admin" && (profile.is_primary_admin || profile.admin_level === "founder" || profile.admin_level === "primary"))) return null;

  return <section className="academy-shell academy-instructor-shell" aria-label="Instrutoria NorteP">
    <div className="academy-hero academy-instructor-hero">
      <div><small>ACESSO · FUNDAÇÃO E ADMINISTRADOR PRIMÁRIO</small><h2><span>N</span>orteP <b>Instrutoria</b></h2><p>Prepare a formação de Pesquisa e Supervisão com um material próprio para quem conduz a aula.</p><div className="academy-tags"><span>4 aulas comuns</span><span>3 aulas de Pesquisa</span><span>2 aulas de Supervisão</span></div></div>
      <div className="academy-instructor-access"><i>✦</i><span><b>Área separada das aulas dos alunos</b><small>Planos, exemplos, demonstrações, perguntas e rubricas ficam organizados aqui.</small></span></div>
    </div>

    <nav className="academy-tabs" aria-label="Áreas da Instrutoria NorteP">
      <button className={tab === "planos" ? "active" : ""} onClick={() => setTab("planos")}>Planos de aula e aulões</button>
      <button className={tab === "praticas" ? "active" : ""} onClick={() => setTab("praticas")}>Práticas enviadas</button>
      <button className={tab === "editor" ? "active" : ""} onClick={() => setTab("editor")}>Editor de materiais</button>
    </nav>

    {tab === "planos" && <>
      <div className="academy-audience-switch" role="group" aria-label="Público da formação"><span><small>PREPARAR FORMAÇÃO PARA</small><b>{academyRoleLabels[audience]}</b></span><div><button className={audience === "pesquisador" ? "active" : ""} onClick={() => setAudience("pesquisador")}>Pesquisadores · 7 aulas</button><button className={audience === "supervisor" ? "active" : ""} onClick={() => setAudience("supervisor")}>Supervisores · 6 aulas</button><button className="academy-presentation-open" onClick={() => { setPresentationIndex(0); setPresentationOpen(true); }}>▣ Apresentação completa</button></div></div>
      {presentationOpen && <AcademyPresentation slides={presentationSlides} index={presentationIndex} setIndex={setPresentationIndex} onClose={() => setPresentationOpen(false)} />}
      <div className="academy-learning-grid academy-instructor-grid">
        <aside className="academy-modules"><header><small>MATERIAL DA INSTRUTORA</small><h3>{activeCurriculum.roles[audience].title}</h3><p>Escolha uma aula para abrir o roteiro de condução.</p></header>{modules.map((module, index) => <details key={module.id} open={module.lessons.some(lesson => lesson.id === selectedLesson?.id) || index === 0}><summary><i>{module.icon || "NP"}</i><span><b>{module.title}</b><small>{module.lessons.length} aula(s)</small></span></summary><div>{module.lessons.map(lesson => <button key={lesson.id} className={lesson.id === selectedLesson?.id ? "active" : ""} onClick={() => setSelectedLessonId(lesson.id)}><i>✦</i><span>{lesson.title}<small>{lesson.duration} min</small></span></button>)}</div></details>)}</aside>
        {selectedLesson && <article className="academy-lesson academy-instructor-plan">
          <header><span><small>PLANO DO AULÃO · {selectedModule?.title}</small><h3>{selectedLesson.title}</h3><p>Público: {academyRoleLabels[audience]} · duração sugerida de {selectedLesson.duration} minutos</p></span><em>{selectedLesson.duration} min</em></header>
          <section className="academy-context"><small>OBJETIVO E CONTEXTO</small><h4>{selectedLesson.objective}</h4><p>{selectedLesson.context}</p></section>
          <section className="academy-instructor"><b>Abertura da instrutora</b><p>{selectedLesson.instructor?.opening || selectedLesson.speak || "Apresente o objetivo da aula e combine a participação da turma."}</p></section>
          <section className="academy-content-block"><h4>Passo a passo da explicação</h4><ol>{selectedLesson.content.map((item, index) => <li key={`${selectedLesson.id}-instructor-content-${index}`}>{item}</li>)}</ol></section>
          <section className="academy-example"><i>✦</i><span><b>Estudo de caso para a turma</b><p>{selectedLesson.example}</p></span></section>
          <div className="academy-instructor-materials"><section><small>DINÂMICA / ROLEPLAY</small><p>{selectedLesson.instructor?.demonstration || selectedLesson.example}</p></section><section><small>PERGUNTAS PARA A TURMA</small><ul>{(selectedLesson.instructor?.guidingQuestions || [selectedLesson.quiz.question]).map(question => <li key={question}>{question}</li>)}</ul></section><section><small>RESPOSTA ESPERADA</small><p>{selectedLesson.instructor?.expectedResponse || selectedLesson.quiz.feedback}</p></section><section><small>O QUE OBSERVAR</small><ul>{(selectedLesson.instructor?.rubric || ["Aplica o procedimento", "Explica a decisão", "Registra evidências"]).map(item => <li key={item}>{item}</li>)}</ul></section></div>
          {selectedLesson.instructor?.notes && <section className="academy-instructor-notes"><small>OBSERVAÇÕES DA INSTRUTORA</small><p>{selectedLesson.instructor.notes}</p></section>}
          {selectedLesson.video && <section className="academy-video-slot"><span><small>APOIO EM VÍDEO</small><b>{selectedLesson.video.label}</b><p>{selectedLesson.video.url ? "Material complementar disponível para o aulão." : "O link poderá ser acrescentado no Editor de materiais."}</p></span>{selectedLesson.video.url ? <a href={selectedLesson.video.url} target="_blank" rel="noreferrer">Abrir vídeo</a> : <button type="button" onClick={() => setTab("editor")}>Adicionar no editor</button>}</section>}
        </article>}
      </div>
    </>}
    {tab === "praticas" && <AcademyInstructorPanel session={session} curriculumVersion={activeCurriculum.version} />}
    {tab === "editor" && <AcademyContentEditor session={session} profile={profile} curriculumVersion={activeCurriculum.version} lessons={editableLessons} />}
  </section>;
}
