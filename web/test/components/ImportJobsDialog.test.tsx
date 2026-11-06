import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ImportJobsDialog from "../../src/components/ImportJobsDialog";

const CSV = [
  "Company,Job Title,Status,Date Applied,Favourite colour",
  "Initech,Engineer,Phone screen,3/2/2026,blue",
  ",Missing company,,,",
  "Globex,Designer,Rejected,,green",
].join("\n");

function csvFile(text: string) {
  return new File([text], "search.csv", { type: "text/csv" });
}

function fetchMock() {
  return fetch as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ imported: 2, skipped: 0 }) })));
});

describe("ImportJobsDialog", () => {
  it("matches the columns, previews the rows, and sends only complete ones", async () => {
    const onImported = vi.fn();
    render(<ImportJobsDialog open onClose={vi.fn()} onImported={onImported} />);

    fireEvent.change(screen.getByLabelText("Spreadsheet file"), { target: { files: [csvFile(CSV)] } });

    expect(await screen.findByLabelText("Field for Job Title")).toHaveValue("role");
    expect(screen.getByLabelText("Field for Favourite colour")).toHaveValue("skip");
    expect(screen.getByText(/2 jobs ready to import\. 1 row has no company or position/)).toBeInTheDocument();
    expect(screen.getByText("2026-03-02")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import 2 jobs" }));

    expect(await screen.findByText(/Added 2 jobs\./)).toBeInTheDocument();
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("/jobs/import");
    const sent = JSON.parse(init.body).jobs;
    expect(sent).toEqual([
      expect.objectContaining({ company: "Initech", role: "Engineer", stage: "INTERVIEW_STAGE", appliedOn: "2026-03-02" }),
      expect.objectContaining({ company: "Globex", role: "Designer", outcome: "REJECTED" }),
    ]);
    expect(onImported).toHaveBeenCalled();
  });

  it("waits for a company and a position column before it will import", async () => {
    render(<ImportJobsDialog open onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Spreadsheet file"), { target: { files: [csvFile("Employer Name,Title\nInitech,Engineer")] } });

    expect(await screen.findByText(/Choose which columns hold the company and the position/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 0 jobs" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Field for Employer Name"), { target: { value: "company" } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Import 1 job" })).toBeEnabled());
  });

  it("says when the file has nothing under its header", async () => {
    render(<ImportJobsDialog open onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Spreadsheet file"), { target: { files: [csvFile("Company,Position\n")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("no rows under its header");
  });
});
