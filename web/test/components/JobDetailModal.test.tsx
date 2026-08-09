import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import JobDetailModal from "../../src/components/JobDetailModal";
import type { JobSummary } from "../../src/api/jobsApi";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

const baseJob: JobSummary = {
  id: 5,
  company: "Acme",
  role: "Backend Engineer",
  sourceCategory: "SELF_APPLIED",
  currentStage: "RESUME_CHECK",
  outcome: "ACTIVE",
  url: null,
  location: null,
  compMin: null,
  compMax: null,
  createdAt: "2026-01-01T00:00:00Z",
  latestInterview: null,
};

describe("JobDetailModal", () => {
  it("loads the JD text, interview notes, and notes from the detail document", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "we are hiring", interviewNotes: "asked leetcode", notes: "great team" }),
    );

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByLabelText("Job description")).toHaveValue("we are hiring");
    expect(screen.getByLabelText("Interview notes")).toHaveValue("asked leetcode");
    expect(screen.getByLabelText("Notes")).toHaveValue("great team");
    expect(screen.getByText("Acme — Backend Engineer")).toBeInTheDocument();
  });

  it("shows an unavailable message with a link to the posting when the JD text is empty", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );
    const jobWithUrl = { ...baseJob, url: "https://acme.com/jobs/1" };

    render(<JobDetailModal job={jobWithUrl} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText("Job Description Details Unavailable")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open original posting/ });
    expect(link).toHaveAttribute("href", "https://acme.com/jobs/1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not show the unavailable message once JD text is present", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "we are hiring", interviewNotes: "" }),
    );

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByLabelText("Job description");
    expect(screen.queryByText("Job Description Details Unavailable")).not.toBeInTheDocument();
  });

  it("disables Rejected reason unless the outcome is Rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByLabelText("Job description");
    expect(screen.getByLabelText("Rejected reason")).toBeDisabled();
  });

  it("shows an editable Rejected reason when the outcome is Rejected", async () => {
    const rejectedJob = { ...baseJob, outcome: "REJECTED" as const };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "", rejectedReason: "low experience" }),
    );

    render(<JobDetailModal job={rejectedJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByLabelText("Job description");
    expect(screen.getByLabelText("Rejected reason")).toBeEnabled();
    expect(screen.getByLabelText("Rejected reason")).toHaveValue("low experience");
  });

  it("saves everything the modal edits in one call, then calls onSaved and onClose", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<JobDetailModal job={baseJob} onClose={onClose} onSaved={onSaved} />);

    await screen.findByLabelText("Job description");
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "updated notes" } });
    fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "updated jd" } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "updated jd", interviewNotes: "", notes: "updated notes" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Notes and the JD now live on the same document, so this is one PUT, not a two-store write.
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/5/detail",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"notes":"updated notes"'),
        }),
      ),
    );
    expect(fetch).not.toHaveBeenCalledWith("/jobs/5", expect.objectContaining({ method: "PATCH" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the completed interview rounds for this job as a history", async () => {
    // Fetch order: detail doc, then interviews filtered to this job.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "jd", interviewNotes: "" }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [
        {
          roundId: "round-11", jobId: 5, company: "Acme", role: "Backend",
          stage: "INTERVIEW_STAGE", interviewDateTime: "2026-08-01T18:00:00.000Z",
          interviewType: "SYSTEM_DESIGN", meetingLink: null, location: null,
          interviewers: [{ name: "Jane Doe", linkedInUrl: null }],
        },
        {
          roundId: "round-22", jobId: 99, company: "Other", role: "X",
          stage: "INTERVIEW_STAGE", interviewDateTime: "2026-08-02T18:00:00.000Z",
          interviewType: "BEHAVIOR", meetingLink: null, location: null, interviewers: [],
        },
      ]),
    );

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText(/Round 1:/)).toBeInTheDocument();
    expect(screen.getByText(/System Design/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    // A round belonging to a different job must not appear.
    expect(screen.queryByText(/Behavior/)).not.toBeInTheDocument();
  });

  it("shows the recommended resume saved from the add-job flow", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "", recommendedResume: "Akhilesh_Backend.pdf" }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEvents: [] }));

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText("Recommended resume:")).toBeInTheDocument();
    expect(screen.getByText("Akhilesh_Backend.pdf")).toBeInTheDocument();
  });

  it("shows the stages the job has passed through", async () => {
    // Fetch order: job detail, interviews, then stage history (GET /jobs/:id).
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, {
        stageEvents: [
          { stage: "RESUME_CHECK", enteredAt: "2026-07-01T12:00:00.000Z", note: null },
          { stage: "INTERVIEW_REQUEST", enteredAt: "2026-07-05T12:00:00.000Z", note: null },
        ],
      }),
    );

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText("Stage history")).toBeInTheDocument();
    expect(screen.getByText("Resume Check")).toBeInTheDocument();
    expect(screen.getByText("Interview Request")).toBeInTheDocument();
  });

  it("collapses consecutive duplicate stages in the history", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, {
        stageEvents: [
          { stage: "RESUME_CHECK", enteredAt: "2026-07-29T22:43:00.000Z", note: null },
          { stage: "INTERVIEW_STAGE", enteredAt: "2026-07-29T22:43:30.000Z", note: null },
          { stage: "INTERVIEW_STAGE", enteredAt: "2026-07-29T22:45:00.000Z", note: null },
        ],
      }),
    );

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText("Stage history")).toBeInTheDocument();
    // The two back-to-back Interview Stage entries collapse into one.
    expect(screen.getAllByText("Interview Stage")).toHaveLength(1);
  });

  it("shows an empty round history when the job has no interviews", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "jd", interviewNotes: "" }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText("No interview rounds yet.")).toBeInTheDocument();
  });

  it("does not request a resume recommendation from the job detail view", async () => {
    // The detail view is post-apply, so it must never fire the AI recommendation call.
    // Answer per URL: one body for every call masked a real crash in the stage-history load.
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/jobs/5/detail") {
        return Promise.resolve(fakeResponse(200, { jobId: 5, jdText: "we are hiring", interviewNotes: "" }));
      }
      if (url === "/jobs/5") {
        return Promise.resolve(fakeResponse(200, { id: 5, stageEvents: [] }));
      }
      return Promise.resolve(fakeResponse(200, []));
    });

    render(<JobDetailModal job={baseJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByLabelText("Job description");
    expect(screen.queryByText(/Rule-based:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI \(Claude\):/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      "/jobs/5/resume-recommendation",
      expect.anything(),
    );
  });

  it("does not overwrite a newer job's detail with a stale response from a previous job", async () => {
    // Hand-resolved promises keyed by URL, so we can force job A's response to land after switching to B.
    const resolvers: Record<string, (value: unknown) => void> = {};
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (url: string) => new Promise(resolve => { resolvers[url] = resolve; }),
    );

    const jobA = baseJob; // id 5
    const jobB = { ...baseJob, id: 7, company: "Beta", role: "Frontend Engineer", notes: "B notes" };

    const { rerender } = render(<JobDetailModal job={jobA} onClose={vi.fn()} onSaved={vi.fn()} />);
    // Switch to B before A's slow load comes back.
    rerender(<JobDetailModal job={jobB} onClose={vi.fn()} onSaved={vi.fn()} />);

    await act(async () => {
      resolvers["/jobs/7/detail"](fakeResponse(200, { jobId: 7, jdText: "B jd", interviewNotes: "B interview" }));
    });
    expect(await screen.findByLabelText("Job description")).toHaveValue("B jd");

    // A's late response must be ignored, not written into B's open modal.
    await act(async () => {
      resolvers["/jobs/5/detail"](fakeResponse(200, { jobId: 5, jdText: "A jd", interviewNotes: "A interview" }));
    });
    expect(screen.getByLabelText("Job description")).toHaveValue("B jd");
    expect(screen.getByLabelText("Interview notes")).toHaveValue("B interview");
  });

  it("does not render a javascript: URL as a clickable posting link", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );
    const jobWithJsUrl = { ...baseJob, url: "javascript:alert(1)" };

    render(<JobDetailModal job={jobWithJsUrl} onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByText("Job Description Details Unavailable");
    expect(screen.queryByRole("link", { name: /Open original posting/ })).not.toBeInTheDocument();
  });

  it("does not render form fields when no job is selected", () => {
    render(<JobDetailModal job={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText("Job description")).not.toBeInTheDocument();
  });
});
