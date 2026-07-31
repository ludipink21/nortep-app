"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import {
  loadAcademyContentWorkflow,
  loadAcademyPracticeQueue,
  loadAcademyTrackAssignments,
  reviewAcademyPractice,
  saveAcademyContentDraft,
  setAcademyTrackAssignment,
  transitionAcademyContent,
  type AcademyContentRevision,
  type AcademyPractice,
  type AcademyTrackAssignment,
  type Profile,
  type Session,
} from "./supabase";

export type EditableAcademyLesson = {
  roleKey: string;
  moduleId: string;
  moduleTitle: string;
  lesson: {
    id: string;
    title: string;
    duration: number;
    objective: string;
    content: string[];
    speak?: string;
    example: string;
    activity: string;
    quiz: { question: string; options: string[]; feedback: string };
    instructor?: {
      opening?: string;
      demonstration?: string;
      guidingQuestions?: string[];
      expectedResponse?: string;
      rubric?: string[];
      notes?: string;
    };
  };
};

const workflowLabels: Record<AcademyContentRevision["status"], string> = {
  draft: "Rascunho",
  review: "Em revisão",
  approved: "Aprovado",
  published: "Publicado",
};

const academyTrackOptions = ["pesquisador","mobilizador","supervisor","coordenador","administrador","analista","observador","fundadora","instrutor"];

export function AcademyInstructorPanel({ session, curriculumVersion }: { session: Session; curriculumVersion: string }) {
  const [queue, setQueue] = useState<AcademyPractice[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("Carregando práticas…");

  const reload = async () => {
    try {
      const rows = await loadAcademyPracticeQueue(session, curriculumVersion);
      setQueue(rows);
      setMessage(rows.length ? "" : "Nenhuma prática enviada para revisão.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar as práticas.");
    }
  };

  useEffect(() => { void reload(); }, [session, curriculumVersion]);

  const decide = async (item: AcademyPractice, decision: "approved" | "changes_requested") => {
    setMessage("Registrando avaliação…");
    try {
      await reviewAcademyPractice(session, item.id, decision, feedback[item.id] || "");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível avaliar a prática.");
    }
  };

  return <div className="academy-instructor-area">
    <div className="academy-section-title"><small>VERSÃO DA INSTRUTORA</small><h3>Práticas, devolutivas e certificação</h3><p>Avalie a aplicação real do conteúdo. A aprovação da prática é obrigatória para emitir ou renovar o certificado.</p></div>
    {message && <p className="academy-management-message" role="status">{message}</p>}
    <div className="academy-practice-queue">{queue.map(item => <article key={item.id}>
      <header><span><small>{item.role_key}</small><h4>{item.profile_name || "Participante"}</h4></span><em className={`status-${item.status}`}>{item.status === "pending" ? "Aguardando" : item.status === "approved" ? "Aprovada" : "Revisar"}</em></header>
      <p>{item.response_text}</p>
      <label>Devolutiva da instrutora<textarea value={feedback[item.id] ?? item.reviewer_feedback} onChange={event => setFeedback(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Registre evidências, orientação e próxima ação." /></label>
      <footer><button onClick={() => void decide(item, "changes_requested")}>Solicitar ajustes</button><button className="primary" onClick={() => void decide(item, "approved")}>Aprovar prática</button></footer>
    </article>)}</div>
  </div>;
}

export function AcademyContentEditor({ session, profile, curriculumVersion, lessons }: {
  session: Session;
  profile: Profile;
  curriculumVersion: string;
  lessons: EditableAcademyLesson[];
}) {
  const [selectedId, setSelectedId] = useState(lessons[0]?.lesson.id || "");
  const selected = lessons.find(item => item.lesson.id === selectedId) || lessons[0];
  const [workflow, setWorkflow] = useState<AcademyContentRevision[]>([]);
  const [trackAssignments, setTrackAssignments] = useState<AcademyTrackAssignment[]>([]);
  const [form, setForm] = useState("");
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const role = profile.is_primary_admin ? "fundadora" : profile.role === "admin" ? "administrador" : profile.role;

  const baseForm = useMemo(() => selected ? JSON.stringify({
    ...selected.lesson,
    instructor: selected.lesson.instructor || {
      opening: selected.lesson.speak || "",
      demonstration: selected.lesson.example || "",
      guidingQuestions: [selected.lesson.quiz.question],
      expectedResponse: selected.lesson.quiz.feedback,
      rubric: ["Aplica o procedimento", "Explica a decisão", "Registra evidências"],
      notes: "",
    },
  }, null, 2) : "", [selected]);
  const editorValue = useMemo(() => {
    try { return JSON.parse(form) as EditableAcademyLesson["lesson"]; }
    catch { return null; }
  }, [form]);

  const updateLesson = (changes: Partial<EditableAcademyLesson["lesson"]>) => {
    if (!editorValue) return;
    setForm(JSON.stringify({ ...editorValue, ...changes }, null, 2));
  };
  const updateQuiz = (changes: Partial<EditableAcademyLesson["lesson"]["quiz"]>) => {
    if (!editorValue) return;
    updateLesson({ quiz: { ...editorValue.quiz, ...changes } });
  };
  const updateInstructor = (changes: NonNullable<EditableAcademyLesson["lesson"]["instructor"]>) => {
    if (!editorValue) return;
    updateLesson({ instructor: { ...(editorValue.instructor || {}), ...changes } });
  };

  useEffect(() => { setForm(baseForm); setAnswer(""); }, [baseForm]);

  const reload = async () => {
    try {
      setWorkflow(await loadAcademyContentWorkflow(session, curriculumVersion));
      if (profile.role === "admin" || profile.role === "coordenador") setTrackAssignments(await loadAcademyTrackAssignments(session));
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível carregar o fluxo editorial."); }
  };

  const assignTrack = async (profileId: string, roleKey: string) => {
    setMessage("Atualizando trilha da pessoa…");
    try { await setAcademyTrackAssignment(session, profileId, roleKey); await reload(); setMessage("Trilha atualizada. O novo conteúdo aparecerá no próximo acesso da pessoa."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a trilha."); }
  };
  useEffect(() => { void reload(); }, [session, curriculumVersion]);

  const save = async () => {
    if (!selected) return;
    setMessage("Salvando rascunho protegido…");
    try {
      const content = JSON.parse(form) as Record<string, unknown>;
      await saveAcademyContentDraft(session, {
        curriculumVersion,
        roleKey: selected.roleKey,
        moduleId: selected.moduleId,
        lessonId: selected.lesson.id,
        content,
        correctAnswer: answer === "" ? null : Number(answer),
      });
      setMessage("Rascunho salvo. Envie para revisão quando estiver pronto.");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "JSON inválido ou rascunho não salvo.");
    }
  };

  const transition = async (item: AcademyContentRevision, target: "review" | "approved" | "published") => {
    setMessage("Atualizando fluxo editorial…");
    try { await transitionAcademyContent(session, item.id, target); await reload(); setMessage(`Conteúdo movido para ${target === "review" ? "revisão" : target === "approved" ? "aprovação" : "publicação"}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Transição não permitida."); }
  };

  return <div className="academy-editor-area">
    <div className="academy-section-title"><small>EDITOR ADMINISTRATIVO</small><h3>Conteúdo sem depender do código</h3><p>Edite uma cópia versionada. O gabarito fica separado do conteúdo e somente entra em vigor na publicação.</p></div>
    {trackAssignments.length > 0 && <section className="academy-track-assignments"><header><small>PERFIS DE ALUNOS</small><h3>Trilhas por função</h3><p>A função na Academia pode ser organizada sem alterar as permissões operacionais do aplicativo.</p></header><div>{trackAssignments.map(item => <label key={item.profile_id}><span><b>{item.profile_name}</b><small>Permissão no app: {item.operational_role}</small></span><select value={item.academy_role} onChange={event => void assignTrack(item.profile_id, event.target.value)}>{academyTrackOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>)}</div></section>}
    <div className="academy-editor-grid">
      <section className="academy-editor-form">
        <label>Aula<select value={selectedId} onChange={event => setSelectedId(event.target.value)}>{lessons.map(item => <option value={item.lesson.id} key={`${item.roleKey}-${item.lesson.id}`}>{item.moduleTitle} · {item.lesson.title}</option>)}</select></label>
        {editorValue && <div className="academy-friendly-editor">
          <label>Título<input value={editorValue.title} onChange={event => updateLesson({ title: event.target.value })} /></label>
          <label>Objetivo<textarea value={editorValue.objective} onChange={event => updateLesson({ objective: event.target.value })} /></label>
          <label>Conteúdo da aula<textarea value={editorValue.content.join("\n")} onChange={event => updateLesson({ content: event.target.value.split("\n").filter(Boolean) })} /><small>Use uma linha para cada ponto.</small></label>
          <div><label>Duração (min)<input type="number" min="1" max="240" value={editorValue.duration} onChange={event => updateLesson({ duration: Number(event.target.value) })} /></label><label>Exemplo prático<textarea value={editorValue.example} onChange={event => updateLesson({ example: event.target.value })} /></label></div>
          <label>Exercício<textarea value={editorValue.activity} onChange={event => updateLesson({ activity: event.target.value })} /></label>
          <fieldset><legend>Avaliação</legend><label>Pergunta<input value={editorValue.quiz.question} onChange={event => updateQuiz({ question: event.target.value })} /></label><label>Alternativas<textarea value={editorValue.quiz.options.join("\n")} onChange={event => updateQuiz({ options: event.target.value.split("\n").filter(Boolean) })} /><small>Use uma linha para cada alternativa.</small></label><label>Feedback após acerto<textarea value={editorValue.quiz.feedback} onChange={event => updateQuiz({ feedback: event.target.value })} /></label></fieldset>
          <fieldset><legend>Versão da instrutora</legend><label>Abertura<textarea value={editorValue.instructor?.opening || editorValue.speak || ""} onChange={event => updateInstructor({ opening: event.target.value })} /></label><label>Demonstração<textarea value={editorValue.instructor?.demonstration || ""} onChange={event => updateInstructor({ demonstration: event.target.value })} /></label><label>Perguntas ao grupo<textarea value={(editorValue.instructor?.guidingQuestions || []).join("\n")} onChange={event => updateInstructor({ guidingQuestions: event.target.value.split("\n").filter(Boolean) })} /></label><label>Resposta esperada<textarea value={editorValue.instructor?.expectedResponse || ""} onChange={event => updateInstructor({ expectedResponse: event.target.value })} /></label><label>Rubrica<textarea value={(editorValue.instructor?.rubric || []).join("\n")} onChange={event => updateInstructor({ rubric: event.target.value.split("\n").filter(Boolean) })} /></label><label>Observações<textarea value={editorValue.instructor?.notes || ""} onChange={event => updateInstructor({ notes: event.target.value })} /></label></fieldset>
        </div>}
        <details className="academy-advanced-editor"><summary>Modo avançado: conteúdo estruturado</summary><textarea className="academy-json-editor" value={form} onChange={event => setForm(event.target.value)} spellCheck={false} /></details>
        <label>Gabarito protegido (opcional)<select value={answer} onChange={event => setAnswer(event.target.value)}><option value="">Manter gabarito atual</option>{selected?.lesson.quiz.options.map((option, index) => <option value={index} key={option}>{String.fromCharCode(65 + index)} · {option}</option>)}</select></label>
        <button className="primary" onClick={() => void save()}>Salvar novo rascunho</button>
        {message && <p className="academy-management-message" role="status">{message}</p>}
      </section>
      <section className="academy-workflow"><header><small>FLUXO EDITORIAL</small><h3>Rascunho → revisão → aprovação → publicação</h3></header>{workflow.length ? workflow.map(item => <article key={item.id}>
        <span><b>{String(item.content.title || item.lesson_id)}</b><small>v{item.revision} · {item.author_name} · {workflowLabels[item.status]}</small></span>
        <div>
          {item.status === "draft" && <button onClick={() => void transition(item, "review")}>Enviar à revisão</button>}
          {item.status === "review" && ["coordenador","administrador","fundadora"].includes(role) && <button onClick={() => void transition(item, "approved")}>Aprovar</button>}
          {item.status === "approved" && ["administrador","fundadora"].includes(role) && <button className="primary" onClick={() => void transition(item, "published")}>Publicar</button>}
          {item.status === "published" && <em>Disponível para alunos</em>}
        </div>
      </article>) : <p>Nenhuma revisão criada. Selecione uma aula e salve o primeiro rascunho.</p>}</section>
    </div>
  </div>;
}
