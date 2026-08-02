import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ResumesPage from "../../src/pages/ResumesPage";
import { useAuth } from "../../src/context/AuthContext";

vi.mock("../../src/context/AuthContext", () => ({ useAuth: vi.fn() }));

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ aiConfigured: true } as ReturnType<typeof useAuth>);
});

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function renderResumesPage(path = "/resumes") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/resumes" element={<ResumesPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResumesPage", () => {
  it("hides the Summarize with AI button and shows a disclaimer when no key is configured", async () => {
    vi.mocked(useAuth).mockReturnValue({ aiConfigured: false } as ReturnType<typeof useAuth>);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(200, [
      { id: "1", fileName: "r.pdf", uploadedAt: "2026-01-01", analysisStatus: "pending", analysisSource: null, summary: null, skills: null, seniority: null, roles: null },
    ]))));

    renderResumesPage();

    await screen.findByText("r.pdf");
    expect(screen.queryByText("Summarize with AI")).not.toBeInTheDocument();
    expect(screen.getByText(/AI summaries are disabled/)).toBeInTheDocument();
  });

  it("shows the onboarding banner only when the query param is present", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(200, []))));

    renderResumesPage("/resumes?onboarding=1");

    expect(await screen.findByText(/Skip for now/)).toBeInTheDocument();
  });

  it("switches the onboarding banner to a 'Continue' CTA once a resume has been uploaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, [
            { id: "1", fileName: "resume.pdf", uploadedAt: "2026-01-01", analysisStatus: "ok", summary: "Great fit", skills: [], seniority: "senior", roles: [] },
          ]),
        ),
      ),
    );

    renderResumesPage("/resumes?onboarding=1");

    expect(await screen.findByText("Continue → Home")).toBeInTheDocument();
    expect(screen.queryByText(/Skip for now/)).not.toBeInTheDocument();
  });

  it("does not show the onboarding banner on a normal visit", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(200, []))));

    renderResumesPage("/resumes");

    await screen.findByText("No resumes uploaded yet.");
    expect(screen.queryByText(/Skip for now/)).not.toBeInTheDocument();
  });

  it("renders each analysisStatus variant with the right copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, [
            { id: "1", fileName: "ok.pdf", uploadedAt: "2026-01-01", analysisStatus: "ok", analysisSource: "ai", summary: "Great fit", skills: [], seniority: "senior", roles: [] },
            { id: "2", fileName: "pending.pdf", uploadedAt: "2026-01-01", analysisStatus: "pending", analysisSource: null, summary: null, skills: null, seniority: null, roles: null },
            { id: "3", fileName: "unconfigured.pdf", uploadedAt: "2026-01-01", analysisStatus: "not_configured", analysisSource: null, summary: null, skills: null, seniority: null, roles: null },
            { id: "4", fileName: "failed.pdf", uploadedAt: "2026-01-01", analysisStatus: "unavailable", analysisSource: null, summary: null, skills: null, seniority: null, roles: null },
          ]),
        ),
      ),
    );

    renderResumesPage();

    expect(await screen.findByText("Great fit", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/AI-generated/)).toBeInTheDocument();
    expect(screen.getByText("Summarize with AI")).toBeInTheDocument();
    expect(screen.getByLabelText("Custom summary for pending.pdf")).toBeInTheDocument();
    expect(screen.getByText("Add an Anthropic API key to enable AI summaries")).toBeInTheDocument();
    expect(screen.getByText("AI summary failed — try again or write your own below")).toBeInTheDocument();
  });

  it("summarizes a pending resume with AI when the button is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, [
            { id: "1", fileName: "pending.pdf", uploadedAt: "2026-01-01", analysisStatus: "pending", analysisSource: null, summary: null, skills: null, seniority: null, roles: null },
          ]),
        ),
      ),
    );

    renderResumesPage();
    await screen.findByText("Summarize with AI");

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { id: "1", fileName: "pending.pdf", uploadedAt: "2026-01-01", analysisStatus: "ok", analysisSource: "ai", summary: "Great fit", skills: [], seniority: "senior", roles: [] }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [
        { id: "1", fileName: "pending.pdf", uploadedAt: "2026-01-01", analysisStatus: "ok", analysisSource: "ai", summary: "Great fit", skills: [], seniority: "senior", roles: [] },
      ]),
    );
    fireEvent.click(screen.getByText("Summarize with AI"));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/resumes/1/summarize", expect.objectContaining({ method: "POST" })),
    );
    expect(await screen.findByText(/Great fit/)).toBeInTheDocument();
  });

  it("saves a custom summary for a pending resume", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, [
            { id: "1", fileName: "pending.pdf", uploadedAt: "2026-01-01", analysisStatus: "pending", analysisSource: null, summary: null, skills: null, seniority: null, roles: null },
          ]),
        ),
      ),
    );

    renderResumesPage();
    const textarea = await screen.findByLabelText("Custom summary for pending.pdf");
    fireEvent.change(textarea, { target: { value: "Wrote this myself." } });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, { id: "1", fileName: "pending.pdf", uploadedAt: "2026-01-01", analysisStatus: "ok", analysisSource: "custom", summary: "Wrote this myself.", skills: [], seniority: null, roles: [] }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [
        { id: "1", fileName: "pending.pdf", uploadedAt: "2026-01-01", analysisStatus: "ok", analysisSource: "custom", summary: "Wrote this myself.", skills: [], seniority: null, roles: [] },
      ]),
    );
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/resumes/1/custom-summary",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ summary: "Wrote this myself." }) }),
      ),
    );
    expect(await screen.findByText(/Wrote this myself\./)).toBeInTheDocument();
  });

  it("offers a retry button and a custom-summary box for a resume whose AI summary failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, [
            { id: "1", fileName: "failed.pdf", uploadedAt: "2026-01-01", analysisStatus: "unavailable", analysisSource: null, summary: null, skills: null, seniority: null, roles: null },
          ]),
        ),
      ),
    );

    renderResumesPage();

    expect(await screen.findByText("AI summary failed — try again or write your own below")).toBeInTheDocument();
    expect(screen.getByText("Retry with AI")).toBeInTheDocument();
    expect(screen.getByLabelText("Custom summary for failed.pdf")).toBeInTheDocument();
  });

  it("offers only the custom-summary box (no AI button) when no API key is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, [
            { id: "1", fileName: "unconfigured.pdf", uploadedAt: "2026-01-01", analysisStatus: "not_configured", analysisSource: null, summary: null, skills: null, seniority: null, roles: null },
          ]),
        ),
      ),
    );

    renderResumesPage();

    expect(await screen.findByText("Add an Anthropic API key to enable AI summaries")).toBeInTheDocument();
    expect(screen.queryByText("Summarize with AI")).not.toBeInTheDocument();
    expect(screen.queryByText("Retry with AI")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Custom summary for unconfigured.pdf")).toBeInTheDocument();
  });

  it("uploads a file selected via the hidden input and refreshes the list", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(200, []))));

    renderResumesPage();
    await screen.findByText("No resumes uploaded yet.");

    const file = new File(["hello"], "resume.txt", { type: "text/plain" });
    const input = screen.getByLabelText("Resume file") as HTMLInputElement;

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: "1", fileName: "resume.txt" }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [{ id: "1", fileName: "resume.txt", uploadedAt: "2026-01-01", analysisStatus: "pending", summary: null, skills: null, seniority: null, roles: null }]),
    );
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/resumes", expect.objectContaining({ method: "POST" })),
    );
    expect(await screen.findByText("resume.txt")).toBeInTheDocument();
  });

  it("uploads a file dropped onto the dropzone", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(200, []))));

    renderResumesPage();
    await screen.findByText("No resumes uploaded yet.");

    const file = new File(["hello"], "dropped.pdf", { type: "application/pdf" });
    const dropzone = screen.getByRole("button", { name: "Upload resume" });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { id: "1", fileName: "dropped.pdf" }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [{ id: "1", fileName: "dropped.pdf", uploadedAt: "2026-01-01", analysisStatus: "pending", summary: null, skills: null, seniority: null, roles: null }]),
    );
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/resumes", expect.objectContaining({ method: "POST" })),
    );
    expect(await screen.findByText("dropped.pdf")).toBeInTheDocument();
  });

  it("deletes a resume after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, [
            { id: "1", fileName: "resume.txt", uploadedAt: "2026-01-01", analysisStatus: "ok", summary: "Great fit", skills: [], seniority: "senior", roles: [] },
          ]),
        ),
      ),
    );

    renderResumesPage();
    await screen.findByText("resume.txt");

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { deleted: true }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/resumes/1", expect.objectContaining({ method: "DELETE" })),
    );
    expect(await screen.findByText("No resumes uploaded yet.")).toBeInTheDocument();
  });
});
