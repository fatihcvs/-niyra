"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { UiIcon as Icon } from "./ui-icon";
import { useAppLayer } from "./use-app-layer";

export type CourseSubject = {
  id: string;
  code: string;
  label: string;
  tone: string;
  imageUrl: string;
  noteCount: number;
  postCount: number;
};

type HubState = { scope: string | null; directory: boolean; selectedId: string | null; lastSubjectId: string | null };
const initialState = (scope: string | null): HubState => ({ scope, directory: false, selectedId: null, lastSubjectId: null });

/** Kept in Home so a route action can return to the same layer and its actual course. */
export function useCourseHubLayers({ ownerScope, subjects }: { ownerScope: string | null; subjects: CourseSubject[] }) {
  const [state, setState] = useState(() => initialState(ownerScope));
  // Do not retain a previous session's private course choice, even for one paint.
  if (state.scope !== ownerScope) setState(initialState(ownerScope));
  const currentOwner = Boolean(ownerScope && state.scope === ownerScope);
  const directoryOpen = currentOwner && state.directory;
  const selectedSubject = currentOwner ? subjects.find(subject => subject.id === state.selectedId) ?? null : null;
  const directoryId = `course.directory:${ownerScope}`;
  const detailId = `course.detail:${ownerScope}:${state.lastSubjectId}`;
  const { ref: directoryRef, close: closeDirectory } = useAppLayer({
    id: directoryId,
    open: directoryOpen,
    onClose: () => setState(value => ({ ...value, directory: false })),
    onRestore: () => {
      if (ownerScope && window.history.state?.kampiraLayer?.id === directoryId) setState(value => ({ ...value, directory: true }));
    },
  });
  const { ref: detailRef, close: closeDetail } = useAppLayer({
    id: detailId,
    open: Boolean(selectedSubject),
    onClose: () => setState(value => ({ ...value, selectedId: null })),
    onRestore: () => {
      if (ownerScope && window.history.state?.kampiraLayer?.id === detailId && subjects.some(subject => subject.id === state.lastSubjectId)) {
        setState(value => ({ ...value, selectedId: value.lastSubjectId }));
      }
    },
  });
  const setDirectoryElement = useCallback((node: HTMLElement | null) => { directoryRef.current = node; }, [directoryRef]);
  const setDetailElement = useCallback((node: HTMLElement | null) => { detailRef.current = node; }, [detailRef]);
  return {
    directoryOpen, selectedSubject, setDirectoryElement, setDetailElement, closeDirectory, closeDetail,
    openDirectory: () => { if (ownerScope) setState(value => ({ ...value, directory: true })); },
    openSubject: (subject: CourseSubject) => {
      if (ownerScope && subjects.some(item => item.id === subject.id)) setState(value => ({ ...value, selectedId: subject.id, lastSubjectId: subject.id }));
    },
    closeForNavigation: () => setState(value => ({ ...value, directory: false, selectedId: null })),
  };
}

export function CourseHubLayers({ hub, subjects, onNotes, onCompose }: {
  hub: ReturnType<typeof useCourseHubLayers>;
  subjects: CourseSubject[];
  onNotes: (subject: CourseSubject) => void;
  onCompose: (subject: CourseSubject) => void;
}) {
  const { selectedSubject: selected, directoryOpen, setDirectoryElement, setDetailElement, closeDirectory, closeDetail, openSubject, closeForNavigation } = hub;
  return <>
    {directoryOpen && <div className="feature-overlay course-hub-overlay" role="presentation" data-mobile-overlay="true" onMouseDown={event => { if (event.target === event.currentTarget) closeDirectory(); }}>
      <section ref={setDirectoryElement} className="feature-dialog course-directory-dialog" role="dialog" aria-modal="true" aria-labelledby="course-directory-title">
        <header><div><span>DERS ÇEVRELERİN</span><h2 id="course-directory-title">Bu dönemki tüm derslerin</h2></div><button type="button" onClick={closeDirectory} aria-label="Dersleri kapat"><Icon name="close" size={19}/></button></header>
        <div className="course-directory-grid">
          {subjects.map(subject => <button type="button" key={subject.id} onClick={() => openSubject(subject)}>
            <span className="course-directory-cover"><Image src={subject.imageUrl} alt="" fill unoptimized sizes="(max-width: 680px) 44vw, 250px"/></span>
            <span><strong>{subject.code}</strong><small>{subject.label}</small><em>{subject.noteCount} doğrulanmış not · {subject.postCount} paylaşım</em></span>
            <Icon name="arrow" size={17}/>
          </button>)}
        </div>
      </section>
    </div>}
    {selected && <div className="feature-overlay course-hub-overlay" role="presentation" data-mobile-overlay="true" onMouseDown={event => { if (event.target === event.currentTarget) closeDetail(); }}>
      <section ref={setDetailElement} className="feature-dialog course-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="course-detail-title">
        <header><div><span>DERS MERKEZİ</span><h2 id="course-detail-title">{selected.code} · {selected.label}</h2></div><button type="button" onClick={closeDetail} aria-label="Ders merkezini kapat"><Icon name="close" size={19}/></button></header>
        <div className="course-detail-body">
          <div className="course-detail-cover"><Image src={selected.imageUrl} alt={`${selected.code} ${selected.label} için temsili ders kapağı`} fill unoptimized sizes="(max-width: 680px) 100vw, 600px" priority/></div>
          <div className="course-detail-label"><Icon name="sparkles" size={15}/> Temsili ders kapağı</div>
          <p>Bu dersin doğrulanmış kaynaklarına ulaşabilir veya doğrudan ders çevresinde paylaşım başlatabilirsin.</p>
          <div className="course-detail-stats"><span><strong>{selected.noteCount}</strong><small>Doğrulanmış not</small></span><span><strong>{selected.postCount}</strong><small>Akış paylaşımı</small></span></div>
          <div className="course-detail-actions">
            <button className="feature-primary" type="button" onClick={() => { closeForNavigation(); onNotes(selected); }}><Icon name="notes" size={17}/> Notları gör</button>
            <button type="button" onClick={() => { closeForNavigation(); onCompose(selected); }}><Icon name="edit" size={17}/> Akışta paylaş</button>
          </div>
        </div>
      </section>
    </div>}
  </>;
}
