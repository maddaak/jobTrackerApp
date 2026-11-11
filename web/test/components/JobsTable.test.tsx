import { render as rtlRender, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import JobsTable from "../../src/components/jobsTable/JobsTable";
import type { JobSummary } from "../../src/api/jobsApi";
import { PIPELINE_PLACES, moveToPlace } from "../../src/jobPlacement";

// AI off: the AI panels have their own tests.
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ aiConfigured: false }) }));

// JobsTable's tree reaches InterviewFormModal, which calls useLocation(), so wrap every render in a router.
function render(ui: ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

const jobs: JobSummary[] = [
  {
    id: 1,
    company: "Zeta Co",
    role: "Backend Engineer",
    sourceCategory: "SELF_APPLIED",
    currentStage: "RESUME_CHECK",
    interviewPhase: null,
    boardPhase: null,
    outcome: "ACTIVE",
    url: null,
    location: "REMOTE",
    compMin: 100000,
    compMax: 120000,
    createdAt: "2026-01-01T00:00:00Z",
    latestInterview: null,
    needsScheduling: false,
    links: [],
    city: null,
    seasonId: 1,
  },
  {
    id: 2,
    company: "Acme Co",
    role: "Frontend Engineer",
    sourceCategory: "REFERRAL_APPLIED",
    currentStage: "INTERVIEW_STAGE",
    // Undragged: placed by its System Design round alone.
    interviewPhase: null,
    boardPhase: "MID_ROUNDS",
    outcome: "ACTIVE",
    url: "https://acme.com/job",
    location: "HYBRID",
    compMin: 130000,
    compMax: 150000,
    createdAt: "2026-01-02T00:00:00Z",
    latestInterview: {
      roundId: "round-99",
      interviewDateTime: "2026-08-14T18:00:00.000Z",
      interviewEndDateTime: null,
      interviewType: "SYSTEM_DESIGN",
      roundCount: 1,
      meetingLink: null,
      location: null,
      interviewers: [],
    },
    needsScheduling: false,
    links: [],
    city: null,
    seasonId: 1,
  },
];

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

function firstRowCompanyText(container: HTMLElement) {
  return container.querySelector("tbody tr:first-child td:first-child span")?.textContent?.trim();
}

describe("JobsTable", () => {
  it("renders all columns", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    for (const header of ["Company", "Position", "Application", "Location", "Salary Range", "Stage", "Status"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(`^${header}`) })).toBeInTheDocument();
    }
  });

  it("filters rows to a selection via the company filter popover", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByText("Zeta Co")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Filter by Company"));
    fireEvent.click(screen.getByLabelText("Zeta Co"));
    fireEvent.click(screen.getByText("OK"));

    expect(screen.queryByText("Zeta Co")).not.toBeInTheDocument();
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
  });

  // What the page's download saves, so a filtered table downloads only what it shows.
  it("hands its toolbar the rows left after filtering", () => {
    const toolbar = vi.fn(() => null);
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} toolbar={toolbar} />);
    expect(toolbar).toHaveBeenLastCalledWith(expect.arrayContaining(jobs));

    fireEvent.click(screen.getByLabelText("Filter by Company"));
    fireEvent.click(screen.getByLabelText("Zeta Co"));
    fireEvent.click(screen.getByText("OK"));

    expect(toolbar).toHaveBeenLastCalledWith([jobs.find(job => job.company === "Acme Co")]);
  });

  it("closes the filter popover with Escape and puts focus back on its button", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    const funnel = screen.getByLabelText("Filter by Company");

    fireEvent.click(funnel);
    expect(funnel).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Filter Company" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Filter Company" })).not.toBeInTheDocument();
    expect(funnel).toHaveAttribute("aria-expanded", "false");
    expect(funnel).toHaveFocus();
  });

  it("filters by typing in the popover search then clicking OK", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Filter by Company"));
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByText("OK"));

    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.queryByText("Zeta Co")).not.toBeInTheDocument();
  });

  it("filters by selecting stages in the filter popover", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    // Board terms, as the Stage picker shows them, not the raw stages.
    fireEvent.click(screen.getByLabelText("Filter by Stage"));
    fireEvent.click(screen.getByLabelText("Mid Rounds")); // uncheck, leaving Submitted
    fireEvent.click(screen.getByText("OK"));

    expect(screen.getByText("Zeta Co")).toBeInTheDocument();
    expect(screen.queryByText("Acme Co")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 2")).toBeInTheDocument();
  });

  it("shows an empty state and clears filters after deselecting everything", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Filter by Company"));
    fireEvent.click(screen.getByText("Clear"));
    fireEvent.click(screen.getByText("OK"));
    expect(screen.getByText("No jobs match your filters.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Clear filters"));
    expect(screen.getByText("Zeta Co")).toBeInTheDocument();
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
  });

  // Moving a closed job to Finalized is core's rule; the table sends the status and leaves the stage alone.
  it("sends a closing status as it is and lets core finalize the stage", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "GHOSTED" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/jobs/1", expect.objectContaining({ method: "PATCH" })));
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toMatchObject({ outcome: "GHOSTED", currentStage: "RESUME_CHECK" });
  });

  it("offers the same Stage choices as the job dialog, and none for a closed job", () => {
    const closed: JobSummary = { ...jobs[0], id: 3, company: "Closed Co", currentStage: "FINALIZED", outcome: "REJECTED" };
    render(<JobsTable jobs={[jobs[0], closed]} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    const [stage] = screen.getAllByLabelText("Stage") as HTMLSelectElement[];
    expect([...stage.options].map(option => option.textContent)).toEqual(PIPELINE_PLACES.map(place => place.label));
    // What "Interview Stage" used to be, findable under one heading.
    const interviewing = stage.querySelector("optgroup[label='Interviewing']")!;
    expect([...interviewing.querySelectorAll("option")].map(option => option.textContent))
      .toEqual(["Initial Screen", "Mid Rounds", "Panel"]);
    expect(screen.getAllByLabelText("Stage")).toHaveLength(1);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("moves a job between board columns from the Stage picker, and shows it there until the refresh lands", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    const refreshStillLoading = () => new Promise<void>(() => {});
    render(<JobsTable jobs={jobs} onSaved={refreshStillLoading} onDeleted={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Stage")[0], { target: { value: "PANEL" } });

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toMatchObject({ currentStage: "INTERVIEW_STAGE", interviewPhase: "PANEL" });
    // The save is done but the list isn't back yet: the row must not flip to its old stage in between.
    await act(async () => {});
    expect((screen.getAllByLabelText("Stage")[0] as HTMLSelectElement).value).toBe("PANEL");
  });

  it("marks an interviewing job as waiting on results", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 2 }));
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    // Only the interviewing job has the box.
    fireEvent.click(screen.getByLabelText("Waiting on results"));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/jobs/2", expect.objectContaining({ method: "PATCH" })));
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.currentStage).toBe("WAITING_INTERVIEW_RESULTS");
  });

  it("does not render a javascript: position URL as a clickable link", () => {
    const jsJob: JobSummary = { ...jobs[0], id: 3, role: "Evil Role", url: "javascript:alert(1)" };
    render(<JobsTable jobs={[jsJob]} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    expect(screen.getByText("Evil Role")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Evil Role" })).not.toBeInTheDocument();
  });

  it("sorts by clicking a column header, toggling direction on repeat click", () => {
    const { container } = render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    expect(firstRowCompanyText(container)).toBe("Zeta Co");

    const companyHeader = screen.getByText("Company");
    fireEvent.click(companyHeader);
    expect(firstRowCompanyText(container)).toBe("Acme Co");

    fireEvent.click(companyHeader);
    expect(firstRowCompanyText(container)).toBe("Zeta Co");
  });

  it("sorts the Stage column in pipeline order, not alphabetically", () => {
    // One job per place, added last place first, so neither insertion order nor the alphabet can pass this.
    const everyPlace = [...PIPELINE_PLACES].reverse().map((place, i) => {
      const moved = moveToPlace(jobs[0], place.id);
      return { ...jobs[0], ...moved, boardPhase: moved.interviewPhase, id: 100 + i, company: `Company ${place.label}` };
    });
    const { container } = render(<JobsTable jobs={everyPlace} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("Stage"));

    const companies = [...container.querySelectorAll("tbody tr")]
      .map(row => row.querySelector("td:first-child span")?.textContent?.trim());
    expect(companies).toEqual(PIPELINE_PLACES.map(place => `Company ${place.label}`));
  });

  it("does not call the API while typing in a pencil-edit field, only once Done is clicked", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit company for Zeta Co" }));
    const companyInput = screen.getByLabelText("Company");
    fireEvent.change(companyInput, { target: { value: "Zeta Corp" } });

    expect(companyInput).toHaveValue("Zeta Corp");
    expect(fetch).not.toHaveBeenCalled();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/jobs/1", expect.objectContaining({ method: "PATCH" })),
    );
  });

  it("keeps focus on the same input across consecutive keystrokes (regression: column identity must stay stable)", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit company for Zeta Co" }));
    const companyInput = screen.getByLabelText("Company");
    companyInput.focus();

    fireEvent.change(companyInput, { target: { value: "Z" } });
    fireEvent.change(companyInput, { target: { value: "Ze" } });
    fireEvent.change(companyInput, { target: { value: "Zet" } });

    expect(companyInput).toHaveValue("Zet");
    expect(document.activeElement).toBe(companyInput);
    expect(screen.getByLabelText("Company")).toBe(companyInput);
  });

  it("autosaves immediately when a dropdown value changes, with no separate submit step", async () => {
    const onSaved = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    render(<JobsTable jobs={jobs} onSaved={onSaved} onDeleted={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Stage")[0], { target: { value: "INTERVIEW_REQUEST" } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/jobs/1", expect.objectContaining({ method: "PATCH" })),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("shows Not set (not Remote) for a job with no location, and can set one", async () => {
    const jobsWithNoLocation = [{ ...jobs[0], location: null }, jobs[1]];
    const onSaved = vi.fn();
    render(<JobsTable jobs={jobsWithNoLocation} onSaved={onSaved} onDeleted={vi.fn()} />);

    const locationSelect = screen.getAllByLabelText("Location")[0] as HTMLSelectElement;
    expect(locationSelect).toHaveValue("");

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    fireEvent.change(locationSelect, { target: { value: "ON_SITE" } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/1",
        expect.objectContaining({ method: "PATCH", body: expect.stringContaining("\"location\":\"ON_SITE\"") }),
      ),
    );
  });

  it("keeps a newer pending edit when an earlier save for the same job finishes first (no lost edits)", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit company for Zeta Co" }));
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "first draft" } });

    let resolveStageSave!: () => void;
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise(resolve => { resolveStageSave = () => resolve(fakeResponse(200, { id: 1 })); }),
    );
    fireEvent.change(screen.getAllByLabelText("Stage")[0], { target: { value: "INTERVIEW_REQUEST" } });

    // A newer edit lands on the same field while the stage-triggered save is still in flight.
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "second draft" } });
    resolveStageSave();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/jobs/1",
      expect.objectContaining({ body: expect.stringContaining("\"company\":\"second draft\"") }),
    );
  });

  it("saves each row independently when edited via their own pencil icons", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit company for Zeta Co" }));
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Zeta Corp" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/jobs/1", expect.objectContaining({ method: "PATCH" })),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit company for Acme Co" }));
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme Corp" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/jobs/2", expect.objectContaining({ method: "PATCH" })),
    );

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("saves an open edit when another one is opened, rather than stranding it", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit company for Zeta Co" }));
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Zeta Corp" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));

    fireEvent.click(screen.getByRole("button", { name: "Edit company for Acme Co" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/jobs/1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining("\"company\":\"Zeta Corp\"") }),
    ));
  });

  it("shows the saved value again, with the error, when an autosave fails", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(500, { error: "boom" }));

    fireEvent.change(screen.getAllByLabelText("Location")[0], { target: { value: "HYBRID" } });

    expect(await screen.findByText(/the change was not kept/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Location")[0]).toHaveValue("REMOTE");
  });

  it("opens the job detail modal automatically when Status is changed to Rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 1, jdText: "", interviewNotes: "" }),
    );
    const { rerender } = render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "REJECTED" } });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Zeta Co — Backend Engineer")).toBeInTheDocument();
    // The modal reads the job from the list, so it follows the page's refresh rather than a copy.
    rerender(
      <MemoryRouter>
        <JobsTable jobs={[{ ...jobs[0], outcome: "REJECTED" }, jobs[1]]} onSaved={vi.fn()} onDeleted={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Rejected reason")).toBeEnabled();
  });

  it("does not open the detail modal for other status changes", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "GHOSTED" } });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the Add interview link for a job at Interview Request too", () => {
    const interviewRequestJob = { ...jobs[0], currentStage: "INTERVIEW_REQUEST" as const };
    render(<JobsTable jobs={[interviewRequestJob, jobs[1]]} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    expect(screen.getAllByText("+ Add interview")).toHaveLength(2);
  });

  it("colors rows based on outcome/stage", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    const rows = screen.getAllByRole("row");
    // rows[1]/rows[2] are Zeta Co (yellow) and Acme Co (green); rows[0] is the header.
    expect(rows[1].className).toContain("bg-yellow-50");
    expect(rows[2].className).toContain("bg-green-50");
  });

  it("gives a job waiting on interview results its own row color", () => {
    const waitingJob = { ...jobs[0], currentStage: "WAITING_INTERVIEW_RESULTS" as const };
    render(<JobsTable jobs={[waitingJob]} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    const row = screen.getAllByRole("row")[1];
    expect(row.className).toContain("bg-indigo-50");
    expect(row.className).not.toContain("bg-green-50");
  });

  it("shows the delete control as an X icon, not the word Delete", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    const deleteButton = screen.getByRole("button", { name: "Delete Zeta Co Backend Engineer" });
    expect(deleteButton).toHaveTextContent("✕");
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("does not delete when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Zeta Co Backend Engineer" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("deletes the job and notifies the parent when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeleted = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { deleted: true }));

    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Zeta Co Backend Engineer" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/jobs/1", expect.objectContaining({ method: "DELETE" }));
  });

  it("opens the job detail modal from the Details link in the actions column", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 1, jdText: "we are hiring", interviewNotes: "" }),
    );
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getAllByText("Details")[0]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Zeta Co — Backend Engineer")).toBeInTheDocument();
    expect(await screen.findByLabelText("Job description")).toHaveValue("we are hiring");
  });

  it("shows Position as a single link with a pencil icon, and expands to editable fields when clicked", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    // Zeta Co has no url, so its position renders as plain text, not a link.
    expect(screen.getByText("Backend Engineer").tagName).toBe("SPAN");
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Position URL")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit position for Zeta Co" }));

    const roleInput = screen.getByLabelText("Role");
    expect(roleInput).toHaveValue("Backend Engineer");
    fireEvent.change(roleInput, { target: { value: "Staff Engineer" } });
    fireEvent.change(screen.getByLabelText("Position URL"), { target: { value: "https://zeta.example/job" } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.getByText("Staff Engineer").tagName).toBe("A");
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/jobs/1", expect.objectContaining({ method: "PATCH" })),
    );
  });

  it("only shows interview details for the job that's at an interview stage", () => {
    const { container } = render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    // Only Acme Co (INTERVIEW_STAGE) should show the button; Zeta Co (RESUME_CHECK) should not.
    expect(screen.getAllByText("+ Add interview")).toHaveLength(1);
    const zetaRow = container.querySelector("tbody tr:first-child");
    expect(zetaRow?.textContent).not.toContain("+ Add interview");
  });

  it("shows the latest interview summary and an Add-interview button for a job at an interview stage", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    expect(screen.getByText(/System Design/)).toBeInTheDocument();
    expect(screen.getByText("+ Add interview")).toBeInTheDocument();
  });

  it("shows a round count and a link to the calendar when a job has more than one interview round", () => {
    const multiRoundJob = {
      ...jobs[1],
      latestInterview: { ...jobs[1].latestInterview!, roundCount: 3 },
    };
    render(<JobsTable jobs={[jobs[0], multiRoundJob]} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    expect(screen.getByText(/3 rounds · latest/)).toBeInTheDocument();
    expect(screen.getByText("See all rounds on calendar")).toBeInTheDocument();
  });

  it("does not show a round count or calendar link for a job with only one interview round", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    expect(screen.queryByText(/rounds · latest/)).not.toBeInTheDocument();
    expect(screen.queryByText("See all rounds on calendar")).not.toBeInTheDocument();
  });

  // The same dialog the board, calendar, and banner use, opened for this row's job.
  it("adds an interview through the shared dialog, for this job, and refreshes", async () => {
    const onSaved = vi.fn();
    render(<JobsTable jobs={jobs} onSaved={onSaved} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("+ Add interview"));

    expect(await screen.findByRole("dialog", { name: "Add interview" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Job")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Date and time"), { target: { value: "2026-08-20T14:00" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "SYSTEM_DESIGN" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { roundId: "round-100" }));
    fireEvent.click(screen.getByRole("button", { name: "Add interview" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toMatchObject({ jobId: 2, interviewType: "SYSTEM_DESIGN" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closing the add dialog saves nothing and doesn't refresh", async () => {
    const onSaved = vi.fn();
    render(<JobsTable jobs={jobs} onSaved={onSaved} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("+ Add interview"));
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("clicking the interview summary opens the edit modal prefilled with its details", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText(/System Design/));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Edit interview")).toBeInTheDocument();
    expect(screen.getByText("Acme Co — Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toHaveValue("SYSTEM_DESIGN");
  });

  it("saving from the table's interview modal refreshes the list", async () => {
    const onSaved = vi.fn();
    render(<JobsTable jobs={jobs} onSaved={onSaved} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText(/System Design/));
    await screen.findByRole("dialog");

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { roundId: "round-99" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/interviews/round-99", expect.objectContaining({ method: "PATCH" })),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("JobsTable linked jobs", () => {
  // A closed req and the role it redirected to.
  const linkedJobs: JobSummary[] = [
    { ...jobs[0], links: [{ jobId: 2, company: "Acme Co", role: "Frontend Engineer", relation: "REPLACED_BY" }] },
    { ...jobs[1], links: [{ jobId: 1, company: "Zeta Co", role: "Backend Engineer", relation: "REPLACES" }] },
  ];

  it("shows no badge on a job with no links", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    expect(screen.queryByLabelText(/linked job/)).not.toBeInTheDocument();
  });

  it("opens the linked job from the badge and scrolls to that row", () => {
    const scrollIntoView = vi.fn();
    // jsdom has no layout, so there is no real method to spy on.
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<JobsTable jobs={linkedJobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getAllByLabelText("1 linked job")[0]);

    expect(screen.getByText("replaced by")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Acme Co — Frontend Engineer/ }));

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("restarts the flash when the same linked job is opened twice", () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    render(<JobsTable jobs={linkedJobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    function jumpToAcme() {
      fireEvent.click(screen.getAllByLabelText("1 linked job")[0]);
      fireEvent.click(screen.getByRole("button", { name: /Acme Co — Frontend Engineer/ }));
    }
    const flashedCell = () => screen.getAllByTitle("Acme Co")[0].closest("td");

    jumpToAcme();
    expect(flashedCell()).toHaveClass("bg-blue-200");
    act(() => { vi.advanceTimersByTime(1000); });
    jumpToAcme();

    // Past the first jump's 1.6s window: only a restarted timer keeps the row lit here.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(flashedCell()).toHaveClass("bg-blue-200");

    act(() => { vi.advanceTimersByTime(700); });
    expect(flashedCell()).not.toHaveClass("bg-blue-200");
    vi.useRealTimers();
  });

  it("labels each end of the same link from its own row's point of view", () => {
    render(<JobsTable jobs={linkedJobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getAllByLabelText("1 linked job")[1]);

    expect(screen.getByText("replaces")).toBeInTheDocument();
  });
});
