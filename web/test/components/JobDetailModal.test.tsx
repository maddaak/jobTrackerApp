import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  rejectedReason: null,
  notes: "great team",
  createdAt: "2026-01-01T00:00:00Z",
  latestInterview: null,
};

describe("JobDetailModal", () => {
  it("loads the JD text and interview notes, and shows notes straight from the job prop", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "we are hiring", interviewNotes: "asked leetcode" }),
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
    const rejectedJob = { ...baseJob, outcome: "REJECTED" as const, rejectedReason: "low experience" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );

    render(<JobDetailModal job={rejectedJob} onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByLabelText("Job description");
    expect(screen.getByLabelText("Rejected reason")).toBeEnabled();
    expect(screen.getByLabelText("Rejected reason")).toHaveValue("low experience");
  });

  it("saves both the job fields and the detail document, then calls onSaved and onClose", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "", interviewNotes: "" }),
    );
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<JobDetailModal job={baseJob} onClose={onClose} onSaved={onSaved} />);

    await screen.findByLabelText("Job description");
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "updated notes" } });
    fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "updated jd" } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 5, company: "Acme" }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { jobId: 5, jdText: "updated jd", interviewNotes: "" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/5",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("\"notes\":\"updated notes\""),
        }),
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/jobs/5/detail",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining("\"jdText\":\"updated jd\""),
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not render form fields when no job is selected", () => {
    render(<JobDetailModal job={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText("Job description")).not.toBeInTheDocument();
  });
});
