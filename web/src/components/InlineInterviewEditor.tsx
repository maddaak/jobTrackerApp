import { useState } from "react";
import { safeHref } from "../safeHref";
import { useInterviewerDraft } from "../hooks/useInterviewerDraft";
import {
  googleMapsUrl,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  type InterviewType,
  type InterviewerInput,
} from "../api/interviewsApi";

// Empty `interviewDateTime` means the user saved a blank editor; the caller treats that as a cancel (see JobsTable.saveInterview).
export interface InlineInterviewDraft {
  interviewDateTime: string;
  interviewType: InterviewType | "";
  meetingLink: string;
  location: string;
  interviewers: InterviewerInput[];
}

interface InlineInterviewEditorProps {
  // Passed in so the editor matches the input styling of the surrounding table cells.
  inputClass: string;
  onSave: (draft: InlineInterviewDraft) => void;
  onCancel: () => void;
}

// Owns its own draft state so typing re-renders only this editor, not the whole memoized table.
export default function InlineInterviewEditor({ inputClass, onSave, onCancel }: InlineInterviewEditorProps) {
  const [interviewDateTime, setInterviewDateTime] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType | "">("");
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const { interviewers, addInterviewer, removeInterviewer, updateInterviewer, toInterviewerInputs } = useInterviewerDraft();

  function handleSave() {
    onSave({
      interviewDateTime,
      interviewType,
      meetingLink,
      location,
      interviewers: toInterviewerInputs(),
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        aria-label="Interview date and time"
        type="datetime-local"
        autoFocus
        className={inputClass}
        value={interviewDateTime}
        onChange={e => setInterviewDateTime(e.target.value)}
      />
      <select
        aria-label="Interview type"
        className={inputClass}
        value={interviewType}
        onChange={e => setInterviewType(e.target.value as InterviewType | "")}
      >
        <option value="">Select type</option>
        {INTERVIEW_TYPES.map(type => (
          <option key={type} value={type}>{INTERVIEW_TYPE_LABELS[type]}</option>
        ))}
      </select>
      <input
        aria-label="Meeting link"
        placeholder="Meeting link"
        className={inputClass}
        value={meetingLink}
        onChange={e => setMeetingLink(e.target.value)}
      />
      {safeHref(meetingLink) && (
        <a
          href={safeHref(meetingLink)}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          Join meeting ↗
        </a>
      )}
      <input
        aria-label="Interview location"
        placeholder="Location (if in person)"
        className={inputClass}
        value={location}
        onChange={e => setLocation(e.target.value)}
      />
      {location && (
        <a
          href={googleMapsUrl(location)}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          Open in Google Maps ↗
        </a>
      )}
      {interviewers.map((interviewer, index) => (
        <div key={interviewer.key} className="flex items-center gap-1">
          <input
            aria-label="Interviewer name"
            placeholder="Interviewer name"
            className={inputClass}
            value={interviewer.name}
            onChange={e => updateInterviewer(index, "name", e.target.value)}
          />
          <input
            aria-label="Interviewer LinkedIn URL"
            placeholder="LinkedIn URL"
            className={inputClass}
            value={interviewer.linkedInUrl}
            onChange={e => updateInterviewer(index, "linkedInUrl", e.target.value)}
          />
          <button
            type="button"
            aria-label="Remove interviewer"
            onClick={() => removeInterviewer(index)}
            className="shrink-0 text-red-600 hover:underline dark:text-red-400"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addInterviewer}
        className="text-left text-xs text-blue-600 hover:underline dark:text-blue-400"
      >
        + Add interviewer
      </button>
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={handleSave}
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-neutral-500 hover:underline dark:text-neutral-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
