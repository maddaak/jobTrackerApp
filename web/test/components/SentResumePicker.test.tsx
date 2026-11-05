import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SentResumePicker from "../../src/components/job/SentResumePicker";
import ResumeResponsesTable from "../../src/components/metrics/ResumeResponsesTable";

let saved: unknown[] = [];

function stubFetch(resumes: { fileName: string }[]) {
  saved = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (url === "/resumes") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(resumes) });
    const body = JSON.parse(init!.body as string);
    saved.push(body);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ sentResume: body.sentResume || null }) });
  }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("SentResumePicker", () => {
  it("records which uploaded resume went out", async () => {
    stubFetch([{ fileName: "backend.pdf" }, { fileName: "general.pdf" }]);
    const onChange = vi.fn();
    render(<SentResumePicker jobId={3} sentResume={null} onChange={onChange} onError={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Record it" }));
    fireEvent.change(await screen.findByLabelText("Resume sent"), { target: { value: "general.pdf" } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("general.pdf"));
    expect(saved).toEqual([{ sentResume: "general.pdf" }]);
  });

  // The file may have been deleted from Resumes since; the job still names what it was sent with.
  it("keeps a resume that has since been deleted as a choice", async () => {
    stubFetch([{ fileName: "new.pdf" }]);
    render(<SentResumePicker jobId={3} sentResume="old.pdf" onChange={vi.fn()} onError={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(await screen.findByLabelText("Resume sent")).toHaveValue("old.pdf");
    expect(screen.getByRole("option", { name: "new.pdf" })).toBeInTheDocument();
  });
});

describe("ResumeResponsesTable", () => {
  it("shows each resume's reply rate and marks a sample too small to compare", () => {
    render(<ResumeResponsesTable rows={[
      { resume: "general.pdf", applications: 10, responses: 3 },
      { resume: "backend.pdf", applications: 2, responses: 1 },
    ]} />);

    expect(screen.getByRole("row", { name: /general\.pdf 10 3 30%/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /backend\.pdf 2 1 50%\s?\*/ })).toBeInTheDocument();
    expect(screen.getByText(/too few to compare yet/)).toBeInTheDocument();
  });
});
