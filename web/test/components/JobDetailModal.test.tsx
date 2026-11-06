import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import JobDetailModal from "../../src/components/JobDetailModal";
import { OUTCOMES, type JobSummary } from "../../src/api/jobsApi";

// AI off: the AI panels have their own tests.
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ aiConfigured: false }) }));

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
  interviewPhase: null,
  boardPhase: null,
  outcome: "ACTIVE",
  url: null,
  location: null,
  compMin: null,
  compMax: null,
  createdAt: "2026-01-01T00:00:00Z",
  latestInterview: null,
  needsScheduling: false,
  links: [],
  city: null,
  seasonId: 1,
};

describe("JobDetailModal", () => {
  it("loads the JD text, interview notes, and notes from the detail document", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "we are hiring", interviewNotes: "asked leetcode", notes: "great team" }),
    );

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

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

    render(<JobDetailModal job={jobWithUrl} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    expect(await screen.findByText("Job Description Details Unavailable")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open original posting/ });
    expect(link).toHaveAttribute("href", "https://acme.com/jobs/1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not show the unavailable message once JD text is present", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "we are hiring", interviewNotes: "" }),
    );

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByLabelText("Job description");
    expect(screen.queryByText("Job Description Details Unavailable")).not.toBeInTheDocument();
  });

  it("disables Rejected reason unless the outcome is Rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByLabelText("Job description");
    expect(screen.getByLabelText("Rejected reason")).toBeDisabled();
  });

  it("shows an editable Rejected reason when the outcome is Rejected", async () => {
    const rejectedJob = { ...baseJob, outcome: "REJECTED" as const };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "", rejectedReason: "low experience" }),
    );

    render(<JobDetailModal job={rejectedJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

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
    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={onClose} onSaved={onSaved} />, { wrapper: MemoryRouter });

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
          interviewEndDateTime: "2026-08-01T19:00:00.000Z",
          interviewType: "SYSTEM_DESIGN", meetingLink: null, location: null,
          interviewers: [{ name: "Jane Doe", linkedInUrl: null }],
        },
        {
          roundId: "round-22", jobId: 99, company: "Other", role: "X",
          stage: "INTERVIEW_STAGE", interviewDateTime: "2026-08-02T18:00:00.000Z",
          interviewEndDateTime: null,
          interviewType: "BEHAVIOR", meetingLink: null, location: null, interviewers: [],
        },
      ]),
    );

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

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

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

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

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    expect(await screen.findByText("Stage history")).toBeInTheDocument();
    // History rows only: the Stage picker names its options the same way.
    expect(screen.getByText("Resume Check", { selector: "li span" })).toBeInTheDocument();
    expect(screen.getByText("Interview Request", { selector: "li span" })).toBeInTheDocument();
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

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    expect(await screen.findByText("Stage history")).toBeInTheDocument();
    // The two back-to-back Interview Stage entries collapse into one.
    expect(screen.getAllByText("Interview Stage")).toHaveLength(1);
  });

  it("shows an empty round history when the job has no interviews", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "jd", interviewNotes: "" }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    expect(await screen.findByText("No interview rounds yet.")).toBeInTheDocument();
  });

  it("does not overwrite a newer job's detail with a stale response from a previous job", async () => {
    // Hand-resolved promises keyed by URL, so we can force job A's response to land after switching to B.
    const resolvers: Record<string, (value: unknown) => void> = {};
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (url: string) => new Promise(resolve => { resolvers[url] = resolve; }),
    );

    const jobA = baseJob; // id 5
    const jobB = { ...baseJob, id: 7, company: "Beta", role: "Frontend Engineer", notes: "B notes" };

    const { rerender } = render(<JobDetailModal job={jobA} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });
    // Switch to B before A's slow load comes back.
    rerender(<JobDetailModal job={jobB} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

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

    render(<JobDetailModal job={jobWithJsUrl} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByText("Job Description Details Unavailable");
    expect(screen.queryByRole("link", { name: /Open original posting/ })).not.toBeInTheDocument();
  });

  it("does not render form fields when no job is selected", () => {
    render(<JobDetailModal job={null} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.queryByLabelText("Job description")).not.toBeInTheDocument();
  });
});

describe("JobDetailModal linked jobs", () => {
  const otherJob: JobSummary = { ...baseJob, id: 9, company: "Globex", role: "Security Engineer II" };

  // Fetch order for every mount: job detail, interviews, stage history.
  function stubLoad(links: unknown[]) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "", links }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEvents: [] }));
  }

  it("lists an existing link with the relation read from this job's side", async () => {
    stubLoad([{ jobId: 9, company: "Globex", role: "Security Engineer II", relation: "REPLACED_BY" }]);

    render(<JobDetailModal job={baseJob} allJobs={[baseJob, otherJob]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    // Re-query: the stage-history fetch re-renders the list under us.
    await screen.findByText("Linked jobs");
    expect(screen.getByText("replaced by")).toBeInTheDocument();
    expect(screen.getByText(/Globex — Security Engineer II/)).toBeInTheDocument();
  });

  it("posts the picked job and relation, then refreshes the table", async () => {
    stubLoad([]);
    const onSaved = vi.fn();

    render(<JobDetailModal job={baseJob} allJobs={[baseJob, otherJob]} onClose={vi.fn()} onSaved={onSaved} />, { wrapper: MemoryRouter });

    await screen.findByText("No linked jobs yet.");
    fireEvent.change(screen.getByLabelText("Relation"), { target: { value: "REPLACED_BY" } });
    fireEvent.change(screen.getByLabelText("Job to link"), { target: { value: "9" } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [{ jobId: 9, company: "Globex", role: "Security Engineer II", relation: "REPLACED_BY" }]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/5/links",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ targetJobId: 9, relation: "REPLACED_BY" }),
        }),
      ),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await screen.findByText("replaced by")).toBeInTheDocument();
  });

  it("keeps the picked job selected when the link fails", async () => {
    stubLoad([]);

    render(<JobDetailModal job={baseJob} allJobs={[baseJob, otherJob]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByText("No linked jobs yet.");
    fireEvent.change(screen.getByLabelText("Job to link"), { target: { value: "9" } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(409, { error: "already linked" }));
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(await screen.findByText("already linked")).toBeInTheDocument();
    // Clearing it would force the user to re-pick before retrying.
    expect(screen.getByLabelText("Job to link")).toHaveValue("9");
  });

  it("does not offer a job that is already linked", async () => {
    stubLoad([{ jobId: 9, company: "Globex", role: "Security Engineer II", relation: "RELATED" }]);

    render(<JobDetailModal job={baseJob} allJobs={[baseJob, otherJob]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByText("related to");
    expect(screen.queryByLabelText("Job to link")).not.toBeInTheDocument();
  });

  it("unlinks a job and drops it from the list", async () => {
    stubLoad([{ jobId: 9, company: "Globex", role: "Security Engineer II", relation: "REPLACED_BY" }]);

    render(<JobDetailModal job={baseJob} allJobs={[baseJob, otherJob]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByText("replaced by");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/jobs/5/links/9", expect.objectContaining({ method: "DELETE" })),
    );
    expect(await screen.findByText("No linked jobs yet.")).toBeInTheDocument();
  });
});

describe("JobDetailModal stage history deletion", () => {
  // Forward to Interview Stage, then straight back.
  const misclickedHistory = [
    { stage: "RESUME_CHECK", enteredAt: "2026-08-25T23:00:00.000Z", note: null },
    { stage: "INTERVIEW_REQUEST", enteredAt: "2026-08-26T20:24:00.000Z", note: null },
    { stage: "INTERVIEW_STAGE", enteredAt: "2026-08-26T20:24:30.000Z", note: null },
    { stage: "INTERVIEW_REQUEST", enteredAt: "2026-08-26T20:25:00.000Z", note: null },
  ];

  function stubLoad(stageEvents: unknown[]) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "", links: [] }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEvents }));
  }

  it("deletes the mis-clicked entry by its timestamp and refreshes the table", async () => {
    stubLoad(misclickedHistory);
    const onSaved = vi.fn();

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={onSaved} />, { wrapper: MemoryRouter });

    await screen.findByText("Interview Stage");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, misclickedHistory.filter(e => e.stage !== "INTERVIEW_STAGE")),
    );
    fireEvent.click(screen.getByLabelText("Delete Interview Stage history entry"));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/5/stages?enteredAt=2026-08-26T20%3A24%3A30.000Z&stage=INTERVIEW_STAGE",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByText("Interview Stage")).not.toBeInTheDocument();
  });

  it("deletes every entry a collapsed row stands for, not just the first", async () => {
    // Two entries render as one row, so deleting one would look unchanged; the row deletes its run.
    const withARepeat = [
      misclickedHistory[0],
      { stage: "INTERVIEW_REQUEST", enteredAt: "2026-08-26T20:25:00.000Z", note: null },
      { stage: "INTERVIEW_REQUEST", enteredAt: "2026-08-26T20:26:00.000Z", note: null },
    ];
    stubLoad(withARepeat);

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByText("Interview Request", { selector: "li span" });
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, withARepeat.slice(0, 2)))
      .mockResolvedValueOnce(fakeResponse(200, [withARepeat[0]]));
    fireEvent.click(screen.getByLabelText("Delete Interview Request history entry"));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/5/stages?enteredAt=2026-08-26T20%3A26%3A00.000Z&stage=INTERVIEW_REQUEST",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/jobs/5/stages?enteredAt=2026-08-26T20%3A25%3A00.000Z&stage=INTERVIEW_REQUEST",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.queryByText("Interview Request", { selector: "li span" })).not.toBeInTheDocument();
  });

  it("offers no delete control when the whole history is one collapsed row", async () => {
    stubLoad([
      misclickedHistory[0],
      { stage: "RESUME_CHECK", enteredAt: "2026-08-25T23:05:00.000Z", note: null },
    ]);

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByText("Resume Check");
    expect(screen.queryByLabelText(/history entry/)).not.toBeInTheDocument();
  });

  it("offers no delete control when the history has a single entry to lose", async () => {
    stubLoad([misclickedHistory[0]]);

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    await screen.findByText("Resume Check");
    expect(screen.queryByLabelText(/history entry/)).not.toBeInTheDocument();
  });
});

describe("JobDetailModal board controls", () => {
  // Routed by URL, not call order: each section loads its own data, in an order the test shouldn't pin.
  function stubCard(onPatch?: (body: unknown) => void) {
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
      if (url === "/jobs/5/detail") return Promise.resolve(fakeResponse(200, { jobId: 5, jdText: "jd", interviewNotes: "", links: [] }));
      if (url === "/interviews") return Promise.resolve(fakeResponse(200, []));
      if (url === "/jobs/5" && options?.method === "PATCH") {
        onPatch?.(JSON.parse(options.body as string));
        return Promise.resolve(fakeResponse(200, {}));
      }
      if (url === "/jobs/5") return Promise.resolve(fakeResponse(200, { stageEvents: [] }));
      throw new Error(`unexpected fetch to ${url}`);
    }));
  }

  it("moves the job to the column picked, with the phase that column stands for", async () => {
    const patches: unknown[] = [];
    stubCard(body => patches.push(body));
    const onSaved = vi.fn();
    const contacted = { ...baseJob, currentStage: "INTERVIEW_REQUEST" as const };

    render(<JobDetailModal job={contacted} allJobs={[]} onClose={vi.fn()} onSaved={onSaved} />, { wrapper: MemoryRouter });

    fireEvent.change(await screen.findByLabelText("Stage"), { target: { value: "PANEL" } });

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patches).toEqual([expect.objectContaining({ currentStage: "INTERVIEW_STAGE", interviewPhase: "PANEL" })]);
  });

  it("marks an interviewing job as waiting on results without moving its column", async () => {
    const patches: unknown[] = [];
    stubCard(body => patches.push(body));
    const interviewing = {
      ...baseJob, currentStage: "INTERVIEW_STAGE" as const, interviewPhase: "MID_ROUNDS" as const, boardPhase: "MID_ROUNDS" as const,
    };

    render(<JobDetailModal job={interviewing} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    fireEvent.click(await screen.findByLabelText("Waiting on results"));

    await waitFor(() => expect(patches).toEqual([
      expect.objectContaining({ currentStage: "WAITING_INTERVIEW_RESULTS", interviewPhase: "MID_ROUNDS" }),
    ]));
  });

  it("adds a round for this job without asking which job it is for", async () => {
    stubCard();

    render(<JobDetailModal job={baseJob} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    fireEvent.click(await screen.findByRole("button", { name: "+ Add round" }));

    expect(await screen.findByRole("dialog", { name: "Add interview" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Job")).not.toBeInTheDocument();
  });

  it("moves a job to the offer stage from the column picker, and shows it there afterwards", async () => {
    const patches: unknown[] = [];
    stubCard(body => patches.push(body));
    const onSaved = vi.fn();
    const panel = { ...baseJob, currentStage: "INTERVIEW_STAGE" as const, interviewPhase: "PANEL" as const, boardPhase: "PANEL" as const };

    const { rerender } = render(
      <JobDetailModal job={panel} allJobs={[]} onClose={vi.fn()} onSaved={onSaved} />,
      { wrapper: MemoryRouter },
    );
    fireEvent.change(await screen.findByLabelText("Stage"), { target: { value: "OFFER" } });

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patches).toEqual([expect.objectContaining({ currentStage: "OFFER_STAGE" })]);

    rerender(<JobDetailModal job={{ ...panel, currentStage: "OFFER_STAGE" }} allJobs={[]} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByLabelText("Stage")).toHaveValue("OFFER");
  });

  it("pauses a job from the status picker without moving it, and keeps its column to resume into", async () => {
    const patches: unknown[] = [];
    stubCard(body => patches.push(body));
    const onSaved = vi.fn();
    const midRounds = {
      ...baseJob, currentStage: "INTERVIEW_STAGE" as const, interviewPhase: "MID_ROUNDS" as const, boardPhase: "MID_ROUNDS" as const,
    };

    const { rerender } = render(
      <JobDetailModal job={midRounds} allJobs={[]} onClose={vi.fn()} onSaved={onSaved} />,
      { wrapper: MemoryRouter },
    );
    fireEvent.change(await screen.findByLabelText("Status"), { target: { value: "PAUSED" } });

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patches).toEqual([
      expect.objectContaining({ outcome: "PAUSED", currentStage: "INTERVIEW_STAGE", interviewPhase: "MID_ROUNDS" }),
    ]);

    rerender(<JobDetailModal job={{ ...midRounds, outcome: "PAUSED" }} allJobs={[]} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByLabelText("Stage")).toHaveValue("MID_ROUNDS");
  });

  it("offers every status the table does, so a closed job can be reopened from its card", async () => {
    const patches: unknown[] = [];
    stubCard(body => patches.push(body));
    const rejected = { ...baseJob, outcome: "REJECTED" as const, currentStage: "FINALIZED" as const };

    render(<JobDetailModal job={rejected} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    const status = await screen.findByLabelText("Status");
    expect(Array.from((status as HTMLSelectElement).options).map(option => option.value)).toEqual(OUTCOMES);
    // A closed job has no column to show until it is reopened.
    expect(screen.queryByLabelText("Stage")).not.toBeInTheDocument();

    fireEvent.change(status, { target: { value: "ACTIVE" } });
    await waitFor(() => expect(patches).toEqual([expect.objectContaining({ outcome: "ACTIVE" })]));
  });

  it("asks for a stage when a reopened job is still at Finalized", async () => {
    stubCard();
    const reopened = { ...baseJob, outcome: "ACTIVE" as const, currentStage: "FINALIZED" as const };

    render(<JobDetailModal job={reopened} allJobs={[]} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper: MemoryRouter });

    expect(await screen.findByLabelText("Stage")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose a stage" })).toBeInTheDocument();
  });
});
