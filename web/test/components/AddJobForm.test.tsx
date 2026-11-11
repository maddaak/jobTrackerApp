import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AddJobForm from "../../src/components/AddJobForm";
import { useAuth } from "../../src/hooks/useAuth";
import { listResumes, type ResumeSummary } from "../../src/api/resumesApi";

vi.mock("../../src/hooks/useAuth", () => ({ useAuth: vi.fn() }));
// Mocked apart from fetch, so the form's resume check doesn't shift the ordered fetch replies below.
vi.mock("../../src/api/resumesApi", async importOriginal => ({
  ...(await importOriginal<typeof import("../../src/api/resumesApi")>()),
  listResumes: vi.fn(),
}));

function resume(analysisStatus: ResumeSummary["analysisStatus"], summary: string | null): ResumeSummary {
  return {
    id: "r1", fileName: "resume.pdf", uploadedAt: "2026-01-01T00:00:00Z", analysisStatus,
    analysisSource: "ai", summary, skills: null, seniority: null, roles: null,
  };
}

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const scrapeSuccess = {
  company: "Acme", role: "Engineer", location: "REMOTE",
  compMin: 120000, compMax: 150000, raw: "job description text",
};

const applyVerdict = {
  status: "ok", fileName: "resume.pdf", recommendation: "APPLY",
  company: "", role: "", strengths: ["6 years of Go", "payments"], gaps: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(useAuth).mockReturnValue({ aiConfigured: true } as ReturnType<typeof useAuth>);
  vi.mocked(listResumes).mockResolvedValue([resume("ok", "Backend engineer")]);
});

describe("AddJobForm without a resume to match against", () => {
  it("says to upload one instead of offering a recommendation it can't give", async () => {
    vi.mocked(listResumes).mockResolvedValue([]);
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

    expect(await screen.findByText(/Upload a resume on the Resumes page/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Use AI and get a recommendation")).not.toBeInTheDocument();
  });

  it("counts a resume whose analysis failed as no resume", async () => {
    vi.mocked(listResumes).mockResolvedValue([resume("unavailable", null)]);
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

    expect(await screen.findByText(/Upload a resume on the Resumes page/)).toBeInTheDocument();
  });

  it("fetches the posting without calling the match API", async () => {
    vi.mocked(listResumes).mockResolvedValue([]);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
    await screen.findByText(/Upload a resume on the Resumes page/);

    fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.example/jobs/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

    expect(await screen.findByLabelText("Company")).toHaveValue("Acme");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Paste the job description/)).not.toBeInTheDocument();
  });

  it("keeps the option when the resume check itself fails, leaving the match call to say", async () => {
    vi.mocked(listResumes).mockRejectedValue(new Error("down"));
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

    await waitFor(() => expect(listResumes).toHaveBeenCalled());
    expect(screen.getByLabelText("Use AI and get a recommendation")).toBeChecked();
  });
});

describe("AddJobForm", () => {
  it("hides the AI option and shows a disclaimer when no AI provider is set up", () => {
    vi.mocked(useAuth).mockReturnValue({ aiConfigured: false } as ReturnType<typeof useAuth>);
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

    expect(screen.queryByText("Use AI and get a recommendation")).not.toBeInTheDocument();
    expect(screen.getByText(/AI features are off/)).toBeInTheDocument();
  });

  // Skipping the link must still leave somewhere to put the description, AI or no AI.
  it("keeps the description box on a manual add with no AI, and saves what's pasted", async () => {
    vi.mocked(useAuth).mockReturnValue({ aiConfigured: false } as ReturnType<typeof useAuth>);
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));

    fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "We need a backend engineer." } });
    expect(screen.getByText(/AI is off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Get recommendation/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Engineer" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 7 }));
    fireEvent.click(screen.getByRole("button", { name: "Add job" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body).jdText).toBe("We need a backend engineer.");
  });

  it("goes back from the form to the link, keeping what was typed", () => {
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });

    fireEvent.click(screen.getByRole("button", { name: "← Back to the link" }));
    expect(screen.getByRole("button", { name: "Fetch details" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
    expect(screen.getByLabelText("Company")).toHaveValue("Acme");
  });

  // A second Fetch overwrites only what the page provides, so a company it doesn't name stays as typed.
  it("keeps a typed company when a later fetch finds none", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { ...scrapeSuccess, company: "" }));
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Use AI and get a recommendation"));
    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "← Back to the link" }));

    fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

    await waitFor(() => expect(screen.getByLabelText("Role")).toHaveValue("Engineer"));
    expect(screen.getByLabelText("Company")).toHaveValue("Acme");
  });

  it("opens on the url-only step with both Fetch and Skip visible, and no other fields", () => {
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

    expect(screen.getByLabelText("Job Posting Link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip — enter manually" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();
  });

  it("the Use AI checkbox defaults to checked", () => {
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

    expect(screen.getByLabelText("Use AI and get a recommendation")).toBeChecked();
  });

  it("clicking Skip reveals a blank form without calling the scrape API", () => {
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));

    expect(screen.getByLabelText("Company")).toHaveValue("");
    expect(screen.getByLabelText("Role")).toHaveValue("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetching details reveals the form prefilled with the scraped fields", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { status: "no_resumes" }));

    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

    await waitFor(() => expect(screen.getByLabelText("Company")).toHaveValue("Acme"));
    expect(screen.getByLabelText("Role")).toHaveValue("Engineer");
    expect(screen.getByLabelText("Comp min")).toHaveValue(120000);
    expect(screen.getByLabelText("Comp max")).toHaveValue(150000);
  });

  it("a failed fetch still reveals a blank, editable form instead of getting stuck", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(500, {}));

    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

    expect(await screen.findByLabelText("Company")).toHaveValue("");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("submits the (possibly edited) values via createJob regardless of path taken", async () => {
    const onCreated = vi.fn();
    render(<AddJobForm onCreated={onCreated} onWarning={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Engineer" } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 1, company: "Acme" }));
    fireEvent.click(screen.getByRole("button", { name: "Add job" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("\"company\":\"Acme\""),
        }),
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("scrapes in the background to seed the JD text when a URL was typed into the manual form (Skip path)", async () => {
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Engineer" } });
    fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 7, company: "Acme" }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { jobId: 7, jdText: scrapeSuccess.raw, interviewNotes: "" }));
    fireEvent.click(screen.getByRole("button", { name: "Add job" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/scrape", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://acme.com/jobs/1" }),
      })),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/jobs/7/detail",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("\"jdText\":\"job description text\""),
        }),
      ),
    );
  });

  describe("AI recommendation", () => {
    it("unchecking Use AI still scrapes and fills the form, description included, but never calls the match API", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Use AI and get a recommendation"));
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      await waitFor(() => expect(screen.getByLabelText("Company")).toHaveValue("Acme"));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/I'd recommend/)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Job description")).toHaveValue(scrapeSuccess.raw);
    });

    it("shows an APPLY banner after a successful scrape and match", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { ...applyVerdict, gaps: ["Kafka"] }));

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText("✓ I'd recommend this job, based on 6 years of Go, payments.")).toBeInTheDocument();
      expect(screen.getByText("Gaps: Kafka.")).toBeInTheDocument();
      expect(screen.getByText("resume.pdf")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add job" })).toBeEnabled();
      expect(screen.queryByText(/couldn't be read/)).not.toBeInTheDocument();
    });

    it("says when the verdict skipped resumes it couldn't read", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { ...applyVerdict, skippedResumes: 2 }));

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText("2 of your resumes couldn't be read and weren't considered.")).toBeInTheDocument();
    });

    it("shows a DO_NOT_APPLY banner but still leaves Add job clickable", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { ...applyVerdict, recommendation: "DO_NOT_APPLY", gaps: ["needs a clearance"] }),
      );

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText("⚠ I wouldn't apply: needs a clearance.")).toBeInTheDocument();
      expect(screen.getByText("In your favor: 6 years of Go, payments.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add job" })).toBeEnabled();
    });

    it.each([
      ["no_resumes", "No analyzed resumes yet — upload one on the Resumes page."],
      ["not_configured", "Set up an AI provider to get recommendations."],
      ["unavailable", "Recommendation unavailable right now — try again."],
    ])("shows the right disclaimer for status %s", async (status, message) => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { status }));

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
    });

    it("unchecking Use AI still offers a recommendation on request after a successful scrape", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Use AI and get a recommendation"));
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      await waitFor(() => expect(screen.getByLabelText("Company")).toHaveValue("Acme"));
      expect(fetch).toHaveBeenCalledTimes(1);
      const getRecButton = screen.getByRole("button", { name: "Get recommendation" });

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, applyVerdict));
      fireEvent.click(getRecButton);

      expect(await screen.findByText(/I'd recommend/)).toBeInTheDocument();
      // Kept, so an edited description can be weighed again.
      expect(screen.getByRole("button", { name: "Get recommendation again" })).toBeInTheDocument();
    });

    it("shows the paste-real-JD box (not a do-not-apply banner) when the match comes back insufficient_jd", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { status: "insufficient_jd" }));

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/didn't include a readable job description/)).toBeInTheDocument();
      expect(screen.getByLabelText("Job description")).toBeInTheDocument();
      expect(screen.queryByText(/I wouldn't apply/)).not.toBeInTheDocument();
    });

    it("shows a manual paste box when the scrape succeeds but comes back empty (e.g. a 404 page)", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { company: "", role: "", location: "", compMin: null, compMax: null, raw: "", fetched: false, reason: "http_error" }),
      );

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      // The paste box states the reason itself, so a 404 doesn't read as a generic fetch failure.
      expect(await screen.findByText(/That page returned an error/)).toBeInTheDocument();
      expect(screen.getByLabelText("Job description")).toBeInTheDocument();
    });

    it("reports an unreachable link specifically, not as a generic fetch failure", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { company: "", role: "", location: "", compMin: null, compMax: null, raw: "", fetched: false, reason: "unreachable" }),
      );

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/Couldn't reach that page/)).toBeInTheDocument();
    });

    it("reports a page that loaded with no job description differently from a dead link", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { company: "", role: "", location: "", compMin: null, compMax: null, raw: "", fetched: true, reason: "no_job_data" }),
      );

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/didn't contain a readable job description/)).toBeInTheDocument();
      // Said once, in the box that acts on it: two wordings of one problem read as two problems.
      expect(screen.getAllByText(/readable job description/)).toHaveLength(1);
    });

    it("warns when the job saved but its description could not be attached", async () => {
      const onWarning = vi.fn();
      render(<AddJobForm onCreated={vi.fn()} onWarning={onWarning} />);
      fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
      fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
      fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Engineer" } });
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 7, company: "Acme" }));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(500, { error: "scraper down" }));
      fireEvent.click(screen.getByRole("button", { name: "Add job" }));

      // The job itself was created, so this is a warning the user can act on, not a failed save.
      await waitFor(() => expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("could not be attached")));
    });

    it("disables the submit button while a create is in flight so a double-click can't make two jobs", async () => {
      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
      fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
      fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Engineer" } });

      let release: (value: unknown) => void = () => {};
      (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(r => { release = r; }));

      fireEvent.click(screen.getByRole("button", { name: "Add job" }));

      const button = await screen.findByRole("button", { name: "Adding…" });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(fetch).toHaveBeenCalledTimes(1);

      release(fakeResponse(200, { id: 1, company: "Acme" }));
    });

    it("shows a manual paste box when the scrape fails, and getting a recommendation works from it", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(500, {}));

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/Couldn't fetch the job description automatically/)).toBeInTheDocument();
      const textarea = screen.getByLabelText("Job description");
      fireEvent.change(textarea, { target: { value: "We need a backend engineer." } });

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { ...applyVerdict, company: "Acme", role: "Backend Engineer" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Get recommendation" }));

      expect(await screen.findByText(/I'd recommend/)).toBeInTheDocument();
      // A pasted description has no page to name the company, so the recommendation does.
      expect(screen.getByLabelText("Company")).toHaveValue("Acme");
      expect(screen.getByLabelText("Role")).toHaveValue("Backend Engineer");
    });

    it("leaves a company and role already typed when the recommendation names them differently", async () => {
      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
      fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Typed Co" } });
      fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Typed role" } });
      fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "We need a backend engineer." } });

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        fakeResponse(200, { ...applyVerdict, company: "Acme", role: "Backend Engineer" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Get recommendation" }));

      await screen.findByText(/I'd recommend/);
      expect(screen.getByLabelText("Company")).toHaveValue("Typed Co");
      expect(screen.getByLabelText("Role")).toHaveValue("Typed role");
    });

    it("saves the pasted job description with the job, not just the recommendation it fed", async () => {
      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
      fireEvent.change(screen.getByLabelText("Job description"), {
        target: { value: "We need a backend engineer." },
      });
      fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
      fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Engineer" } });

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: 7 }));
      fireEvent.click(screen.getByRole("button", { name: "Add job" }));

      // Without this the user pastes the whole description and the job is created with none of it.
      // It rides on the create itself, so there is no second request to race or fail.
      await waitFor(() => {
        const createCall = (fetch as ReturnType<typeof vi.fn>).mock.calls
          .find(([url, init]) => url === "/jobs" && init?.method === "POST");
        expect(JSON.parse(createCall![1].body).jdText).toBe("We need a backend engineer.");
      });
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => url === "/jobs/7/detail")).toBe(false);
    });

    // It fills only empty fields, at answer time, so nothing should block typing while it runs.
    it("leaves the fields editable while a pasted description is weighed", async () => {
      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
      fireEvent.change(screen.getByLabelText("Job description"), {
        target: { value: "We need a backend engineer." },
      });

      let release!: (value: unknown) => void;
      (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
      fireEvent.click(screen.getByRole("button", { name: "Get recommendation" }));

      expect(await screen.findByRole("button", { name: "Getting recommendation…" })).toBeDisabled();
      expect(screen.getByLabelText("Company")).toBeEnabled();
      expect(screen.getByRole("button", { name: "Add job" })).toBeEnabled();

      release(fakeResponse(200, applyVerdict));
      await screen.findByText(/I'd recommend/);
    });

    it("leaves the fields editable while a recommendation runs on scraped text", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      let release!: (value: unknown) => void;
      (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));

      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      // The scrape already filled them, so a running recommendation must not block a correction.
      await waitFor(() => expect(screen.getByLabelText("Company")).toHaveValue("Acme"));
      expect(screen.getByLabelText("Company")).toBeEnabled();

      release(fakeResponse(200, applyVerdict));
      await screen.findByText(/I'd recommend/);
    });

    it("offers the description box on Skip with no failure warning, since nothing failed", () => {
      render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));

      expect(screen.getByLabelText("Job description")).toHaveValue("");
      expect(screen.getByRole("button", { name: "Get recommendation" })).toBeDisabled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

describe("AddJobForm filling fields from a pasted description", () => {
  function pasteAndFill(reply: unknown) {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      Promise.resolve(url === "/scrape/text" ? fakeResponse(200, reply) : fakeResponse(200, { result: null })));
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
    fireEvent.change(screen.getByLabelText("Comp max"), { target: { value: "200000" } });
    fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "Engineer\nRemote. $150k-$190k." } });
    fireEvent.click(screen.getByRole("button", { name: "Fill in title, location and pay" }));
  }

  it("fills only the fields still empty, so nothing typed is overwritten", async () => {
    pasteAndFill({ role: "Engineer", location: "REMOTE", compMin: 150000, compMax: 190000 });

    await waitFor(() => expect(screen.getByLabelText("Role")).toHaveValue("Engineer"));
    expect(screen.getByLabelText("Location")).toHaveValue("REMOTE");
    expect(screen.getByLabelText("Comp min")).toHaveValue(150000);
    expect(screen.getByLabelText("Comp max")).toHaveValue(200000);
    expect(screen.getByLabelText("Company")).toHaveValue("");
  });

  // Empty is judged when the answer lands, not at the click, so a title typed while it ran stays.
  it("keeps what's typed while the description is being read", async () => {
    let answer: (reply: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => url === "/scrape/text"
      ? new Promise(resolve => { answer = reply => resolve(fakeResponse(200, reply)); })
      : Promise.resolve(fakeResponse(200, { result: null })));
    render(<AddJobForm onCreated={vi.fn()} onWarning={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));
    fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "Engineer\nRemote." } });
    fireEvent.click(screen.getByRole("button", { name: "Fill in title, location and pay" }));

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Staff Engineer" } });
    answer({ role: "Engineer", location: "REMOTE", compMin: null, compMax: null });

    await waitFor(() => expect(screen.getByLabelText("Location")).toHaveValue("REMOTE"));
    expect(screen.getByLabelText("Role")).toHaveValue("Staff Engineer");
  });

  it("says when the text gave nothing to fill", async () => {
    pasteAndFill({ role: "", location: "", compMin: null, compMax: null });

    expect(await screen.findByText("No title, work model, or pay found in it.")).toBeInTheDocument();
  });

  it("works with the AI off, since it reads the text alone", async () => {
    vi.mocked(useAuth).mockReturnValue({ aiConfigured: false } as ReturnType<typeof useAuth>);
    pasteAndFill({ role: "Engineer", location: "", compMin: null, compMax: null });

    await waitFor(() => expect(screen.getByLabelText("Role")).toHaveValue("Engineer"));
  });
});
