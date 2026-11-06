import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { jumpBetweenTargets } from "../components/board/jumpBetweenTargets";
import { updateJob, type JobSummary } from "../api/jobsApi";
import CloseJobDialog from "../components/CloseJobDialog";
import JobDetailModal from "../components/JobDetailModal";
import UpcomingInterviewsBanner from "../components/UpcomingInterviewsBanner";
import FollowUpsDue from "../components/FollowUpsDue";
import BoardColumn from "../components/board/BoardColumn";
import BoardDropZone from "../components/board/BoardDropZone";
import BoardStats from "../components/board/BoardStats";
import JobCard, { DraggingJobCard } from "../components/board/JobCard";
import SubmittedTray from "../components/board/SubmittedTray";
import SampleDataNotice from "../components/SampleDataNotice";
import { BOARD_COLUMNS, boardColumnOf, boardDrop, isSubmitted, type BoardDropTarget } from "../jobPlacement";
import { useJobs } from "../hooks/useJobs";

const DROP_ZONES = [
  { id: "OFFER_ZONE", label: "Got an offer", hint: "Moves to Offers", tone: "green" },
  { id: "PAUSE_ZONE", label: "Pause", hint: "Hiring freeze or on hold", tone: "slate" },
  { id: "CLOSE_ZONE", label: "Close", hint: "Rejected, ghosted, withdrawn", tone: "red" },
] as const;

// What a screen reader hears for each drop target, in place of dnd-kit's raw ids.
const TARGET_LABELS: Record<UniqueIdentifier, string> = Object.fromEntries(
  [{ id: "SUBMITTED", label: "Submitted" }, ...BOARD_COLUMNS, ...DROP_ZONES].map(target => [target.id, target.label]),
);

export default function BoardPage() {
  const { jobs, loaded, setJobs, error, setError, refresh } = useJobs();
  const [openJobId, setOpenJobId] = useState<number | null>(null);
  const [closingJob, setClosingJob] = useState<JobSummary | null>(null);
  const [interviewsVersion, setInterviewsVersion] = useState(0);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [submittedOpen, setSubmittedOpen] = useState(false);
  const justDropped = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Quick search links here with ?job=, so a job opens from anywhere in the app.
  useEffect(() => {
    const requested = Number(searchParams.get("job"));
    if (!requested) return;
    setOpenJobId(requested);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  // The distance lets a plain click through to open the card; anything further is a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space alone picks a card up, leaving Enter to open it.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
      coordinateGetter: jumpBetweenTargets,
    }),
  );
  const companyOf = (id: UniqueIdentifier) => jobs.find(job => job.id === id)?.company ?? "Card";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${companyOf(active.id)}. Arrow keys move it, Space drops it, Escape cancels.`,
    onDragOver: ({ active, over }) =>
      over ? `${companyOf(active.id)} is over ${TARGET_LABELS[over.id]}.` : `${companyOf(active.id)} is over no column.`,
    onDragEnd: ({ active, over }) =>
      over ? `${companyOf(active.id)} dropped on ${TARGET_LABELS[over.id]}.` : `${companyOf(active.id)} put back.`,
    onDragCancel: ({ active }) => `Moving ${companyOf(active.id)} cancelled.`,
  };

  // Derived from the list, so the open card shows each change the moment the list refreshes.
  const openJob = jobs.find(job => job.id === openJobId) ?? null;
  const draggingJob = jobs.find(job => job.id === draggingId) ?? null;
  const submitted = jobs.filter(isSubmitted).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Any change can move a card or touch an upcoming round, so refresh both the list and the banner.
  async function refreshAll() {
    await refresh();
    setInterviewsVersion(v => v + 1);
  }

  function openCard(job: JobSummary) {
    if (justDropped.current) return;
    setOpenJobId(job.id);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null);
    // The browser fires a click on the card a drop ends over; swallow it so a drop never also opens the card.
    justDropped.current = true;
    setTimeout(() => { justDropped.current = false; }, 0);

    const job = jobs.find(candidate => candidate.id === active.id);
    if (!job || !over) return;
    const input = boardDrop(job, over.id as BoardDropTarget);
    if (input === null) return;
    if (input === "close") {
      setClosingJob(job);
      return;
    }
    setError(null);
    // The card lands where it was dropped right away; the refresh corrects it if the save fails.
    setJobs(previous => previous.map(candidate =>
      candidate.id === job.id
        ? {
          ...candidate,
          currentStage: input.currentStage,
          interviewPhase: input.interviewPhase,
          boardPhase: input.interviewPhase ?? candidate.boardPhase,
          outcome: input.outcome,
        }
        : candidate));
    try {
      await updateJob(job.id, input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to move job");
    } finally {
      refresh();
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col p-6">
      <div className="shrink-0">
        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <SampleDataNotice onChanged={refreshAll} />
        <BoardStats jobs={jobs} loaded={loaded} />
        <UpcomingInterviewsBanner refreshSignal={interviewsVersion} onInterviewChanged={refreshAll} />
        <FollowUpsDue refreshSignal={interviewsVersion} onOpenJob={setOpenJobId} />
      </div>

      <DndContext
        sensors={sensors}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: "Press Enter to open this job. Press Space to pick it up and move it." },
        }}
        onDragStart={({ active }) => setDraggingId(Number(active.id))}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          <SubmittedTray
            jobs={submitted}
            count={loaded ? submitted.length : null}
            open={submittedOpen}
            onToggle={() => setSubmittedOpen(open => !open)}
            onOpenJob={openCard}
          />
          {BOARD_COLUMNS.map(column => {
            const columnJobs = jobs.filter(job => boardColumnOf(job) === column.id);
            return (
              <BoardColumn key={column.id} id={column.id} label={column.label} count={loaded ? columnJobs.length : null}>
                {columnJobs.map(job => <JobCard key={job.id} job={job} onOpen={openCard} />)}
              </BoardColumn>
            );
          })}
          <div className="flex w-32 shrink-0 flex-col gap-3">
            {DROP_ZONES.map(zone => <BoardDropZone key={zone.id} {...zone} />)}
          </div>
        </div>
        {/* Drawn outside the columns, so their scroll clipping can't cut the card off mid-drag. */}
        <DragOverlay>
          {draggingJob && <DraggingJobCard job={draggingJob} />}
        </DragOverlay>
      </DndContext>

      {/* Contacts save inside the dialog without onSaved, so closing it is when a settled follow-up drops off. */}
      <JobDetailModal
        job={openJob}
        allJobs={jobs}
        onClose={() => { setOpenJobId(null); setInterviewsVersion(v => v + 1); }}
        onSaved={refreshAll}
      />
      <CloseJobDialog
        job={closingJob}
        onClose={() => setClosingJob(null)}
        onClosed={warning => { setClosingJob(null); setError(warning ?? null); refreshAll(); }}
      />
    </div>
  );
}
