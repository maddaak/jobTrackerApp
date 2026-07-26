import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InterviewFormModal from "../../src/components/InterviewFormModal";
import type { Interview } from "../../src/api/interviewsApi";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

const interviewWithLinkedIn: Interview = {
  stageEventId: 5,
  jobId: 1,
  company: "Acme",
  role: "Backend Engineer",
  stage: "INTERVIEW_STAGE",
  interviewDateTime: "2026-08-01T18:00:00.000Z",
  interviewType: "SYSTEM_DESIGN",
  meetingLink: "https://meet.example/abc",
  location: null,
  interviewers: [{ id: 1, name: "Jordan Lee", linkedInUrl: "https://linkedin.com/in/jordanlee" }],
};

describe("InterviewFormModal", () => {
  it("create mode fetches jobs for the picker and does not submit without one selected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [{ id: 1, company: "Acme", role: "Engineer" }]),
    );

    render(
      <InterviewFormModal
        mode={{ kind: "create", date: new Date(2026, 7, 10) }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    await screen.findByText("Acme — Engineer");
    fireEvent.change(screen.getByLabelText("Date and time"), { target: { value: "2026-08-10T14:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Add interview" }));

    expect(fetch).not.toHaveBeenCalledWith(
      "/interviews",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("create mode submits the selected job and prefilled date", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [{ id: 1, company: "Acme", role: "Engineer" }]),
    );
    const onSaved = vi.fn();

    render(
      <InterviewFormModal
        mode={{ kind: "create", date: new Date(2026, 7, 10) }}
        onClose={vi.fn()}
        onSaved={onSaved}
        onDeleted={vi.fn()}
      />,
    );

    await screen.findByText("Acme — Engineer");
    fireEvent.change(screen.getByLabelText("Job"), { target: { value: "1" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEventId: 9 }));
    fireEvent.click(screen.getByRole("button", { name: "Add interview" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/interviews", expect.objectContaining({ method: "POST" })),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("edit mode prefills interviewers from the passed interview, including the LinkedIn link", () => {
    render(
      <InterviewFormModal
        mode={{ kind: "edit", interview: interviewWithLinkedIn }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Interviewer name")).toHaveValue("Jordan Lee");
    expect(screen.getByLabelText("Meeting link")).toHaveValue("https://meet.example/abc");
    expect(screen.getByLabelText("Type")).toHaveValue("SYSTEM_DESIGN");
    expect(screen.getByRole("link", { name: "View ↗" })).toHaveAttribute(
      "href",
      "https://linkedin.com/in/jordanlee",
    );
  });

  it("does not show a LinkedIn link for an interviewer with none", () => {
    render(
      <InterviewFormModal
        mode={{
          kind: "edit",
          interview: { ...interviewWithLinkedIn, interviewers: [{ id: 1, name: "Jordan Lee", linkedInUrl: null }] },
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link", { name: "View ↗" })).not.toBeInTheDocument();
  });

  it("supports adding and removing additional interviewers", () => {
    render(
      <InterviewFormModal
        mode={{ kind: "edit", interview: interviewWithLinkedIn }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getAllByLabelText("Interviewer name")).toHaveLength(1);
    fireEvent.click(screen.getByText("+ Add interviewer"));
    expect(screen.getAllByLabelText("Interviewer name")).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText("Remove interviewer")[1]);
    expect(screen.getAllByLabelText("Interviewer name")).toHaveLength(1);
  });

  it("edit mode submits a PATCH with the current interviewer values", async () => {
    const onSaved = vi.fn();
    render(
      <InterviewFormModal
        mode={{ kind: "edit", interview: interviewWithLinkedIn }}
        onClose={vi.fn()}
        onSaved={onSaved}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Interviewer name"), { target: { value: "New Name" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { stageEventId: 5 }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/interviews/5",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("\"name\":\"New Name\""),
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("edit mode deletes the interview after confirmation", async () => {
    const onDeleted = vi.fn();
    render(
      <InterviewFormModal
        mode={{ kind: "edit", interview: interviewWithLinkedIn }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { deleted: true }));
    fireEvent.click(screen.getByRole("button", { name: "Delete interview" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/interviews/5", expect.objectContaining({ method: "DELETE" })),
    );
    expect(onDeleted).toHaveBeenCalled();
  });
});
