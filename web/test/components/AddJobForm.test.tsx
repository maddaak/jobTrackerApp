import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AddJobForm from "../../src/components/AddJobForm";
import { useAuth } from "../../src/context/AuthContext";

vi.mock("../../src/context/AuthContext", () => ({ useAuth: vi.fn() }));

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const scrapeSuccess = {
  company: "Acme", role: "Engineer", location: "REMOTE",
  compMin: 120000, compMax: 150000, raw: "job description text",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(useAuth).mockReturnValue({ aiConfigured: true } as ReturnType<typeof useAuth>);
});

describe("AddJobForm", () => {
  it("hides the AI option and shows a disclaimer when no Anthropic key is configured", () => {
    vi.mocked(useAuth).mockReturnValue({ aiConfigured: false } as ReturnType<typeof useAuth>);
    render(<AddJobForm onCreated={vi.fn()} />);

    expect(screen.queryByText("Use AI and get a recommendation")).not.toBeInTheDocument();
    expect(screen.getByText(/AI features are disabled/)).toBeInTheDocument();
  });

  it("opens on the url-only step with both Fetch and Skip visible, and no other fields", () => {
    render(<AddJobForm onCreated={vi.fn()} />);

    expect(screen.getByLabelText("Job Posting Link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip — enter manually" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();
  });

  it("the Use AI checkbox defaults to checked", () => {
    render(<AddJobForm onCreated={vi.fn()} />);

    expect(screen.getByLabelText("Use AI and get a recommendation")).toBeChecked();
  });

  it("clicking Skip reveals a blank form without calling the scrape API", () => {
    render(<AddJobForm onCreated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));

    expect(screen.getByLabelText("Company")).toHaveValue("");
    expect(screen.getByLabelText("Role")).toHaveValue("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetching details reveals the form prefilled with the scraped fields", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { status: "no_resumes" }));

    render(<AddJobForm onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

    await waitFor(() => expect(screen.getByLabelText("Company")).toHaveValue("Acme"));
    expect(screen.getByLabelText("Role")).toHaveValue("Engineer");
    expect(screen.getByLabelText("Comp min")).toHaveValue(120000);
    expect(screen.getByLabelText("Comp max")).toHaveValue(150000);
  });

  it("a failed fetch still reveals a blank, editable form instead of getting stuck", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(500, {}));

    render(<AddJobForm onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

    expect(await screen.findByLabelText("Company")).toHaveValue("");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("submits the (possibly edited) values via createJob regardless of path taken", async () => {
    const onCreated = vi.fn();
    render(<AddJobForm onCreated={onCreated} />);

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
    render(<AddJobForm onCreated={vi.fn()} />);

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
    it("unchecking Use AI still scrapes and fills the form but never calls the match API or shows a panel", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));

      render(<AddJobForm onCreated={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Use AI and get a recommendation"));
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      await waitFor(() => expect(screen.getByLabelText("Company")).toHaveValue("Acme"));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/best fit/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Paste the job description")).not.toBeInTheDocument();
    });

    it("shows an APPLY banner after a successful scrape and match", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { status: "ok", fileName: "resume.pdf", recommendation: "APPLY", reasoning: "Strong match." }),
      );

      render(<AddJobForm onCreated={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/You should apply/)).toBeInTheDocument();
      expect(screen.getByText("resume.pdf")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add job" })).toBeEnabled();
    });

    it("shows a DO_NOT_APPLY banner but still leaves Add job clickable", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { status: "ok", fileName: "resume.pdf", recommendation: "DO_NOT_APPLY", reasoning: "Skills mismatch." }),
      );

      render(<AddJobForm onCreated={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/You should not apply/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add job" })).toBeEnabled();
    });

    it.each([
      ["no_resumes", "No analyzed resumes yet — upload one on the Resumes page."],
      ["not_configured", "Connect an Anthropic API key to get recommendations."],
      ["unavailable", "Recommendation unavailable right now — try again."],
    ])("shows the right disclaimer for status %s", async (status, message) => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { status }));

      render(<AddJobForm onCreated={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
    });

    it("unchecking Use AI still offers a manual 'Get AI recommendation' button after a successful scrape", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));

      render(<AddJobForm onCreated={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Use AI and get a recommendation"));
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      await waitFor(() => expect(screen.getByLabelText("Company")).toHaveValue("Acme"));
      expect(fetch).toHaveBeenCalledTimes(1);
      const getRecButton = screen.getByRole("button", { name: "Get AI recommendation" });

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { status: "ok", fileName: "resume.pdf", recommendation: "APPLY", reasoning: "Strong match." }),
      );
      fireEvent.click(getRecButton);

      expect(await screen.findByText(/You should apply/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Get AI recommendation" })).not.toBeInTheDocument();
    });

    it("shows the paste-real-JD box (not a do-not-apply banner) when the match comes back insufficient_jd", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, scrapeSuccess));
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { status: "insufficient_jd" }));

      render(<AddJobForm onCreated={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/didn't include a readable job description/)).toBeInTheDocument();
      expect(screen.getByLabelText("Paste the job description")).toBeInTheDocument();
      expect(screen.queryByText(/You should not apply/)).not.toBeInTheDocument();
    });

    it("shows a manual paste box when the scrape succeeds but comes back empty (e.g. a 404 page)", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { company: "", role: "", location: "", compMin: null, compMax: null, raw: "" }),
      );

      render(<AddJobForm onCreated={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/Couldn't fetch the job description automatically/)).toBeInTheDocument();
    });

    it("shows a manual paste box when the scrape fails, and getting a recommendation works from it", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(500, {}));

      render(<AddJobForm onCreated={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Job Posting Link"), { target: { value: "https://acme.com/jobs/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));

      expect(await screen.findByText(/Couldn't fetch the job description automatically/)).toBeInTheDocument();
      const textarea = screen.getByLabelText("Paste the job description");
      fireEvent.change(textarea, { target: { value: "We need a backend engineer." } });

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeResponse(200, { status: "ok", fileName: "resume.pdf", recommendation: "APPLY", reasoning: "Good fit." }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Get recommendation" }));

      expect(await screen.findByText(/You should apply/)).toBeInTheDocument();
    });

    it("shows the manual paste box on Skip with neutral suggestion copy, not a failure warning", () => {
      render(<AddJobForm onCreated={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Skip — enter manually" }));

      expect(screen.getByLabelText("Paste the job description")).toBeInTheDocument();
      expect(screen.getByText(/Want a job-fit recommendation\?/)).toBeInTheDocument();
      expect(screen.queryByText(/couldn't be fetched/i)).not.toBeInTheDocument();
    });
  });
});
