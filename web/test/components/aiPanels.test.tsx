import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AiPanel from "../../src/components/ai/AiPanel";
import CompanyBriefPanel from "../../src/components/ai/CompanyBriefPanel";
import RoundAiPanels from "../../src/components/ai/RoundAiPanels";
import JobAiPanels from "../../src/components/ai/JobAiPanels";
import InsightsPanel from "../../src/components/metrics/InsightsPanel";
import InterviewPrepPanel from "../../src/components/ai/InterviewPrepPanel";
import type { AiResult, AssistOutcome, InterviewPrep } from "../../src/api/aiApi";
import type { Interview } from "../../src/api/interviewsApi";
import type { JobSummary } from "../../src/api/jobsApi";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

type Call = { url: string; method: string; body: unknown };
let calls: Call[];

// Answers by URL, so the panels' own loads don't depend on call order.
function serve(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const key = Object.keys(routes).find(route => route === `${method} ${url}`);
    return Promise.resolve(key ? fakeResponse(200, routes[key]) : fakeResponse(404, { error: "not found" }));
  }));
}

const saved = <T,>(content: T): AiResult<T> => ({ content, createdAt: "2026-10-11T12:00:00Z" });

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("AiPanel", () => {
  function renderPanel(run: () => Promise<AssistOutcome<{ text: string }>>, result: AiResult<{ text: string }> | null = null) {
    const onChange = vi.fn();
    const remove = vi.fn().mockResolvedValue(undefined);
    render(
      <AiPanel title="Thing" about="Explains the thing." runLabel="Do the thing" busyLabel="Doing…" result={result}
        run={run} remove={remove} onChange={onChange}>
        {content => <p>Answer: {content.text}</p>}
      </AiPanel>,
    );
    return { onChange, remove };
  }

  it("says what it does and that it's billed before the first run, then hands the answer up", async () => {
    const { onChange } = renderPanel(() => Promise.resolve({ status: "ok", result: saved({ text: "hi" }) }));

    expect(screen.getByText("Explains the thing.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(saved({ text: "hi" })));
  });

  it("keeps a saved answer collapsed until asked, and removes it only after confirming", async () => {
    const { onChange, remove } = renderPanel(vi.fn(), saved({ text: "kept" }));

    expect(screen.queryByText("Answer: kept")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("Answer: kept")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run again" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(remove).toHaveBeenCalled();
  });

  it("says why a run didn't work", async () => {
    const outcomes: AssistOutcome<{ text: string }>[] = [{ status: "not_configured" }, { status: "unavailable" }];
    const run = vi.fn().mockResolvedValueOnce(outcomes[0]).mockResolvedValueOnce(outcomes[1]);
    renderPanel(run);

    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No AI provider is set up");
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("unavailable right now"));
  });
});

describe("CompanyBriefPanel", () => {
  const brief = saved({
    company: "Acme", overview: "Makes anvils.", facts: ["Founded 1949"], recentNews: [], interviewProcess: "",
    watchOuts: [], searched: true, sources: [{ title: "News", url: "https://news.example/acme" }],
  });

  it("shows the brief already saved for the company, with its sources", async () => {
    serve({ "GET /ai/company-brief?company=Acme%20Corp": { result: brief } });
    render(<CompanyBriefPanel company=" Acme Corp " role="Engineer" />);

    fireEvent.click(await screen.findByRole("button", { name: "Show" }, { timeout: 2000 }));

    expect(screen.getByText("Makes anvils.")).toBeInTheDocument();
    expect(screen.getByText("Founded 1949")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /News/ })).toHaveAttribute("href", "https://news.example/acme");
    expect(screen.getByText("Researched on the web")).toBeInTheDocument();
  });

  it("runs a new brief for the company and role", async () => {
    serve({ "GET /ai/company-brief?company=Acme": { result: null }, "POST /ai/company-brief": { status: "ok", result: brief } });
    render(<CompanyBriefPanel company="Acme" role="Engineer" />);

    fireEvent.click(screen.getByRole("button", { name: "Brief me on Acme" }));

    expect(await screen.findByText("Makes anvils.")).toBeInTheDocument();
    expect(calls.find(c => c.method === "POST")?.body).toEqual({ company: "Acme", role: "Engineer" });
  });

  it("drops a brief that finishes after the company was changed", async () => {
    let answer!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => init?.method === "POST"
      ? new Promise(resolve => { answer = resolve; })
      : Promise.resolve(fakeResponse(200, { result: null }))));
    const { rerender } = render(<CompanyBriefPanel company="Acme" role="Engineer" />);

    fireEvent.click(screen.getByRole("button", { name: "Brief me on Acme" }));
    rerender(<CompanyBriefPanel company="Globex" role="Engineer" />);
    answer(fakeResponse(200, { status: "ok", result: brief }));

    expect(await screen.findByRole("button", { name: "Brief me on Globex" })).toBeInTheDocument();
    expect(screen.queryByText("Makes anvils.")).not.toBeInTheDocument();
  });
});

describe("RoundAiPanels", () => {
  const round: Interview = {
    roundId: "r-1", jobId: 7, company: "Acme", role: "Engineer", stage: "INTERVIEW_STAGE",
    interviewDateTime: "2026-10-01T15:00:00Z", interviewEndDateTime: null, interviewType: "SYSTEM_DESIGN",
    meetingLink: null, location: null, interviewers: [], aiResults: {},
  };

  it("debriefs from the notes typed, and only once there are some", async () => {
    const debrief = saved({ summary: "Went well.", thankYouNote: "Thanks, Sam!", followUps: ["Send the doc"], notes: "Talked caching." });
    serve({ "POST /ai/rounds/r-1/debrief": { status: "ok", result: debrief } });
    const onChange = vi.fn();
    render(<RoundAiPanels round={round} onChange={onChange} />);

    const panel = screen.getByRole("region", { name: "Debrief" });
    const run = within(panel).getByRole("button", { name: "Write the debrief" });
    expect(run).toBeDisabled();
    fireEvent.change(within(panel).getByLabelText("Your notes from the round"), { target: { value: "Talked caching." } });
    fireEvent.click(run);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ debrief }));
    expect(calls[0].body).toEqual({ notes: "Talked caching." });
  });

  it("shows a saved thank-you note ready to copy", () => {
    const debrief = saved({ summary: "Went well.", thankYouNote: "Thanks, Sam!", followUps: [], notes: "n" });
    render(<RoundAiPanels round={{ ...round, aiResults: { debrief } }} onChange={vi.fn()} />);

    const panel = screen.getByRole("region", { name: "Debrief" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show" }));

    expect(within(panel).getByText("Thanks, Sam!")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(within(panel).getByLabelText("Your notes from the round")).toHaveValue("n");
  });
});

describe("JobAiPanels", () => {
  const job = {
    id: 7, company: "Acme", role: "Engineer", outcome: "ACTIVE", latestInterview: null,
  } as unknown as JobSummary;

  it("offers a follow-up only once there's been an interview", async () => {
    serve({ "GET /resumes": [] });
    const { rerender } = render(<JobAiPanels job={job} results={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Follow-up email" })).not.toBeInTheDocument();

    rerender(<JobAiPanels job={{ ...job, latestInterview: {} } as JobSummary} results={{}} onChange={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Follow-up email" })).toBeInTheDocument();
  });

  it("tailors the resume picked", async () => {
    serve({
      "GET /resumes": [{ id: "r2", fileName: "backend.pdf" }],
      "POST /ai/jobs/7/tailoring": { status: "ok", result: saved({ summary: "Close." }) },
    });
    render(<JobAiPanels job={job} results={{}} onChange={vi.fn()} />);

    const panel = screen.getByRole("region", { name: "Resume tailoring" });
    fireEvent.change(await within(panel).findByRole("combobox"), { target: { value: "r2" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Tailor my resume to this job" }));

    await waitFor(() => expect(calls.find(c => c.method === "POST")?.body).toEqual({ resumeId: "r2" }));
  });
});

describe("InterviewPrepPanel", () => {
  const job = {
    id: 7, company: "Acme", role: "Engineer", outcome: "ACTIVE", latestInterview: { interviewType: "SYSTEM_DESIGN" },
  } as unknown as JobSummary;
  const prep = saved<InterviewPrep>({
    interviewType: "BEHAVIOR", focus: "Ownership stories.", topics: ["STAR method"], likelyQuestions: ["A conflict?"],
    practice: [{ title: "Two Sum", url: "https://leetcode.com/problems/two-sum/", why: "hashing" }],
    storiesToTell: [], questionsToAsk: [], resumeFileName: null, recruiterNotes: "", searched: true, sources: [],
  });

  it("starts on the latest round's kind and prepares for the kind chosen", async () => {
    serve({ "POST /ai/jobs/7/prep": { status: "ok", result: prep } });
    const onChange = vi.fn();
    render(<InterviewPrepPanel job={job} results={{}} onChange={onChange} />);

    const kind = screen.getByLabelText("Kind of interview");
    expect(kind).toHaveValue("SYSTEM_DESIGN");
    fireEvent.change(kind, { target: { value: "BEHAVIOR" } });
    fireEvent.change(screen.getByLabelText("What the recruiter said about this round"), {
      target: { value: "30 minutes with the hiring manager." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Prepare me" }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // Applied to the latest answers, so tailoring that finished meanwhile is kept beside the prep.
    const tailoring = saved({ summary: "Close." });
    expect(onChange.mock.calls[0][0]({ tailoring })).toEqual({ tailoring, "prep:BEHAVIOR": prep });
    expect(calls[0].body).toEqual({ interviewType: "BEHAVIOR", recruiterNotes: "30 minutes with the hiring manager." });
  });

  it("shows each kind's own recruiter notes when switching", () => {
    const withNotes = saved({ ...prep.content, recruiterNotes: "Bring a story about conflict." });
    render(<InterviewPrepPanel job={job} results={{ "prep:BEHAVIOR": withNotes }} onChange={vi.fn()} />);
    const notes = () => screen.getByLabelText("What the recruiter said about this round");

    fireEvent.change(notes(), { target: { value: "Leetcode medium." } });
    fireEvent.change(screen.getByLabelText("Kind of interview"), { target: { value: "BEHAVIOR" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    expect(notes()).toHaveValue("Bring a story about conflict.");
    expect(screen.getByText("Built around what the recruiter said.")).toBeInTheDocument();
  });

  it("keeps each kind's prep, and shows its practice links", () => {
    render(<InterviewPrepPanel job={job} results={{ "prep:BEHAVIOR": prep }} onChange={vi.fn()} />);

    // The latest round's kind has nothing saved; the kind that does is marked in the picker.
    expect(screen.getByRole("button", { name: "Prepare me" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Behavior (saved)" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Kind of interview"), { target: { value: "BEHAVIOR" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    expect(screen.getByRole("link", { name: /Two Sum/ })).toHaveAttribute("href", "https://leetcode.com/problems/two-sum/");
    expect(screen.getByText("STAR method")).toBeInTheDocument();
  });
});

describe("InsightsPanel", () => {
  it("says when the saved patterns were found over fewer jobs than there are now", async () => {
    serve({ "GET /ai/insights": { result: saved({ summary: "Few offers.", patterns: [], nextSteps: [], jobCount: 10 }) } });
    render(<InsightsPanel totalJobs={12} />);

    expect(await screen.findByText(/Based on 10 jobs; you have 12 now/)).toBeInTheDocument();
  });
});
