import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InterviewFormModal from "../../src/components/InterviewFormModal";
import { INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS, type Interview } from "../../src/api/interviewsApi";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

const interviewWithLinkedIn: Interview = {
  roundId: "round-5",
  jobId: 1,
  company: "Acme",
  role: "Backend Engineer",
  stage: "INTERVIEW_STAGE",
  interviewDateTime: "2026-08-01T18:00:00.000Z",
  interviewType: "SYSTEM_DESIGN",
  meetingLink: "https://meet.example/abc",
  location: null,
  interviewers: [{ name: "Jordan Lee", linkedInUrl: "https://linkedin.com/in/jordanlee" }],
};

describe("InterviewFormModal", () => {
  // Driven off the type list so a type added later is covered without touching this test.
  it("offers every interview type in the dropdown, including the panel ones", () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse(200, []));

    render(
      <MemoryRouter>
        <InterviewFormModal
          mode={{ kind: "edit", interview: interviewWithLinkedIn }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    for (const type of INTERVIEW_TYPES) {
      expect(screen.getByRole("option", { name: INTERVIEW_TYPE_LABELS[type] })).toBeInTheDocument();
    }
  });

  it("create mode fetches jobs for the picker and does not submit without one selected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [{ id: 1, company: "Acme", role: "Engineer" }]),
    );

    render(
      <MemoryRouter>
        <InterviewFormModal
          mode={{ kind: "create", date: new Date(2026, 7, 10) }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
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
      <MemoryRouter>
        <InterviewFormModal
          mode={{ kind: "create", date: new Date(2026, 7, 10) }}
          onClose={vi.fn()}
          onSaved={onSaved}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    await screen.findByText("Acme — Engineer");
    fireEvent.change(screen.getByLabelText("Job"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "SYSTEM_DESIGN" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { roundId: "round-9" }));
    fireEvent.click(screen.getByRole("button", { name: "Add interview" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/interviews", expect.objectContaining({ method: "POST" })),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("edit mode prefills interviewers from the passed interview, including the LinkedIn link", () => {
    render(
      <MemoryRouter>
        <InterviewFormModal
          mode={{ kind: "edit", interview: interviewWithLinkedIn }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Interviewer name")).toHaveValue("Jordan Lee");
    expect(screen.getByLabelText("Meeting link")).toHaveValue("https://meet.example/abc");
    expect(screen.getByLabelText("Type")).toHaveValue("SYSTEM_DESIGN");
    expect(screen.getByRole("link", { name: "View ↗" })).toHaveAttribute(
      "href",
      "https://linkedin.com/in/jordanlee",
    );
  });

  it("edit mode shows a link to the calendar page; create mode does not", () => {
    render(
      <MemoryRouter>
        <InterviewFormModal
          mode={{ kind: "edit", interview: interviewWithLinkedIn }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "See all interviews on the calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    );
  });

  it("does not show a LinkedIn link for an interviewer with none", () => {
    render(
      <MemoryRouter>
        <InterviewFormModal
          mode={{
            kind: "edit",
            interview: { ...interviewWithLinkedIn, interviewers: [{ name: "Jordan Lee", linkedInUrl: null }] },
          }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "View ↗" })).not.toBeInTheDocument();
  });

  it("does not render a javascript: interviewer URL as a link", () => {
    render(
      <MemoryRouter>
        <InterviewFormModal
          mode={{
            kind: "edit",
            interview: {
              ...interviewWithLinkedIn,
              interviewers: [{ name: "Jordan Lee", linkedInUrl: "javascript:alert(1)" }],
            },
          }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "View ↗" })).not.toBeInTheDocument();
  });

  it("supports adding and removing additional interviewers", () => {
    render(
      <MemoryRouter>
        <InterviewFormModal
          mode={{ kind: "edit", interview: interviewWithLinkedIn }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
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
      <MemoryRouter>
        <InterviewFormModal
          mode={{ kind: "edit", interview: interviewWithLinkedIn }}
          onClose={vi.fn()}
          onSaved={onSaved}
          onDeleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Interviewer name"), { target: { value: "New Name" } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { roundId: "round-5" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/interviews/round-5",
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
      <MemoryRouter>
        <InterviewFormModal
          mode={{ kind: "edit", interview: interviewWithLinkedIn }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onDeleted={onDeleted}
        />
      </MemoryRouter>,
    );

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { deleted: true }));
    fireEvent.click(screen.getByRole("button", { name: "Delete interview" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/interviews/round-5", expect.objectContaining({ method: "DELETE" })),
    );
    expect(onDeleted).toHaveBeenCalled();
  });
});
