import { useRef, useState } from "react";
import type { InterviewerInput } from "../api/interviewsApi";

// `key` is a stable React list key so editing one row doesn't remount the others; never sent to the server.
export interface InterviewerDraft {
  key: string;
  name: string;
  linkedInUrl: string;
}

// Shared interviewer-list state + handlers, used by both the calendar's InterviewFormModal and
// the JobsTable inline interview editor.
export function useInterviewerDraft() {
  const [interviewers, setInterviewers] = useState<InterviewerDraft[]>([]);
  const nextKeyRef = useRef(0);

  function newInterviewerKey(): string {
    nextKeyRef.current += 1;
    return `new-${nextKeyRef.current}`;
  }

  function addInterviewer() {
    setInterviewers(prev => [...prev, { key: newInterviewerKey(), name: "", linkedInUrl: "" }]);
  }

  function removeInterviewer(index: number) {
    setInterviewers(prev => prev.filter((_, i) => i !== index));
  }

  function updateInterviewer(index: number, field: keyof InterviewerDraft, value: string) {
    setInterviewers(prev => prev.map((interviewer, i) => (i === index ? { ...interviewer, [field]: value } : interviewer)));
  }

  function toInterviewerInputs(): InterviewerInput[] {
    return interviewers
      .filter(i => i.name.trim())
      .map(i => ({ name: i.name, linkedInUrl: i.linkedInUrl || undefined }));
  }

  return { interviewers, setInterviewers, addInterviewer, removeInterviewer, updateInterviewer, toInterviewerInputs };
}
