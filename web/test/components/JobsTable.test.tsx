import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import JobsTable from "../../src/components/JobsTable";
import type { JobSummary } from "../../src/api/jobsApi";

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
    outcome: "ACTIVE",
    url: null,
    location: "REMOTE",
    compMin: 100000,
    compMax: 120000,
    rejectedReason: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    latestInterview: null,
  },
  {
    id: 2,
    company: "Acme Co",
    role: "Frontend Engineer",
    sourceCategory: "REFERRAL_APPLIED",
    currentStage: "INTERVIEW_STAGE",
    outcome: "ACTIVE",
    url: "https://acme.com/job",
    location: "NYC_HYBRID",
    compMin: 130000,
    compMax: 150000,
    rejectedReason: null,
    notes: "great team",
    createdAt: "2026-01-02T00:00:00Z",
    latestInterview: {
      stageEventId: 99,
      interviewDateTime: "2026-08-14T18:00:00.000Z",
      interviewType: "SYSTEM_DESIGN",
      roundCount: 1,
      meetingLink: null,
      location: null,
      interviewers: [],
    },
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

    for (const header of [
      "Company", "Position", "Application", "Location", "Salary Range",
      "Stage", "Outcome",
    ]) {
      expect(screen.getByText(header)).toBeInTheDocument();
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

    fireEvent.click(screen.getByLabelText("Filter by Stage"));
    fireEvent.click(screen.getByLabelText("Interview Stage")); // uncheck, leaving Resume Check
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

  it("moves a job to the Finalized stage when its outcome is set to Rejected", async () => {
    const onSaved = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 1, jdText: "", interviewNotes: "" }),
    );
    render(<JobsTable jobs={jobs} onSaved={onSaved} onDeleted={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Outcome")[0], { target: { value: "REJECTED" } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("\"currentStage\":\"FINALIZED\""),
        }),
      ),
    );
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
    fireEvent.change(locationSelect, { target: { value: "NYC_IN_PERSON" } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/1",
        expect.objectContaining({ method: "PATCH", body: expect.stringContaining("\"location\":\"NYC_IN_PERSON\"") }),
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

  it("opens the job detail modal automatically when Outcome is changed to Rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1 }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 1, jdText: "", interviewNotes: "" }),
    );
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Outcome")[0], { target: { value: "REJECTED" } });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Zeta Co — Backend Engineer")).toBeInTheDocument();
    expect(screen.getByLabelText("Rejected reason")).toBeEnabled();
  });

  it("does not open the detail modal for other outcome changes", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Outcome")[0], { target: { value: "GHOSTED" } });

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
    // rows[0] is the header row; rows[1]/rows[2] are Zeta Co (RESUME_CHECK -> yellow) and Acme Co (INTERVIEW_STAGE -> green).
    expect(rows[1].className).toContain("bg-yellow-50");
    expect(rows[2].className).toContain("bg-green-50");
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

  it("adding an interview via the Stage cell creates a new interview and refreshes", async () => {
    const onSaved = vi.fn();
    render(<JobsTable jobs={jobs} onSaved={onSaved} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("+ Add interview"));
    fireEvent.change(screen.getByLabelText("Interview date and time"), { target: { value: "2026-08-20T14:00" } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEventId: 100 }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/interviews", expect.objectContaining({ method: "POST" })),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByLabelText("Interview date and time")).not.toBeInTheDocument();
  });

  it("cancelling the interview editor closes it without calling the API", () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("+ Add interview"));
    expect(screen.getByLabelText("Interview date and time")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Interview date and time")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("includes the location field when saving a new interview", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("+ Add interview"));
    fireEvent.change(screen.getByLabelText("Interview date and time"), { target: { value: "2026-08-20T14:00" } });
    fireEvent.change(screen.getByLabelText("Interview location"), { target: { value: "123 Main St, NYC" } });

    expect(screen.getByText("Open in Google Maps ↗")).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20NYC",
    );

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEventId: 100 }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/interviews",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("\"location\":\"123 Main St, NYC\""),
        }),
      ),
    );
  });

  it("supports adding multiple interviewers to a new interview", async () => {
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("+ Add interview"));
    fireEvent.change(screen.getByLabelText("Interview date and time"), { target: { value: "2026-08-20T14:00" } });

    fireEvent.click(screen.getByText("+ Add interviewer"));
    fireEvent.click(screen.getByText("+ Add interviewer"));
    const names = screen.getAllByLabelText("Interviewer name");
    expect(names).toHaveLength(2);
    fireEvent.change(names[0], { target: { value: "Jordan Lee" } });
    fireEvent.change(names[1], { target: { value: "Sam Rivera" } });

    fireEvent.click(screen.getAllByLabelText("Remove interviewer")[1]);
    expect(screen.getAllByLabelText("Interviewer name")).toHaveLength(1);

    fireEvent.click(screen.getByText("+ Add interviewer"));
    fireEvent.change(screen.getAllByLabelText("Interviewer name")[1], { target: { value: "Sam Rivera" } });
    fireEvent.change(screen.getAllByLabelText("Interviewer LinkedIn URL")[1], {
      target: { value: "https://linkedin.com/in/samrivera" },
    });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEventId: 100 }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/interviews",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            "\"interviewers\":[{\"name\":\"Jordan Lee\"},{\"name\":\"Sam Rivera\",\"linkedInUrl\":\"https://linkedin.com/in/samrivera\"}]",
          ),
        }),
      ),
    );
  });

  it("deletes an interview from the compact summary after confirmation", async () => {
    const onSaved = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<JobsTable jobs={jobs} onSaved={onSaved} onDeleted={vi.fn()} />);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { deleted: true }));
    fireEvent.click(screen.getByLabelText("Delete interview"));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/interviews/99", expect.objectContaining({ method: "DELETE" })),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
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

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEventId: 99 }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/interviews/99", expect.objectContaining({ method: "PATCH" })),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not delete the interview when the confirmation is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<JobsTable jobs={jobs} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Delete interview"));

    expect(fetch).not.toHaveBeenCalled();
  });
});
