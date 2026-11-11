import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContactsSection from "../../src/components/job/ContactsSection";
import type { Contact } from "../../src/api/jobsApi";

const DANA: Contact = {
  name: "Dana Kim", role: "RECRUITER", email: "dana@example.com", linkedInUrl: "https://www.linkedin.com/in/example",
  lastContactedOn: null, notes: null, followUpOn: null,
};

let sent: { contacts: Contact[] }[] = [];

beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    sent.push(body);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ contacts: body.contacts }) });
  }));
});

describe("ContactsSection", () => {
  it("adds a person and saves the whole list", async () => {
    const onContactsChange = vi.fn();
    render(<ContactsSection jobId={7} contacts={[DANA]} onContactsChange={onContactsChange} onError={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add person" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam Lee" } });
    fireEvent.change(screen.getByLabelText("Their role"), { target: { value: "REFERRER" } });
    fireEvent.click(screen.getByRole("button", { name: "Save person" }));

    await waitFor(() => expect(onContactsChange).toHaveBeenCalled());
    expect(sent[0].contacts.map(contact => [contact.name, contact.role])).toEqual([["Dana Kim", "RECRUITER"], ["Sam Lee", "REFERRER"]]);
  });

  it("records talking to someone today, and removes a person", async () => {
    render(<ContactsSection jobId={7} contacts={[DANA]} onContactsChange={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByRole("link", { name: "dana@example.com" })).toHaveAttribute("href", "mailto:dana@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Spoke to Dana Kim today" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].contacts[0].lastContactedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    fireEvent.click(screen.getByRole("button", { name: "Remove Dana Kim" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].contacts).toEqual([]);
  });

  it("sets a follow-up day and flags one that has come", async () => {
    render(
      <ContactsSection jobId={7} contacts={[DANA, { ...DANA, name: "Sam Lee", followUpOn: "2020-01-01" }]}
        onContactsChange={vi.fn()} onError={vi.fn()} />,
    );
    expect(screen.getByText(/follow-up due/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Dana Kim" }));
    fireEvent.change(screen.getByLabelText("Follow up by"), { target: { value: "2099-03-04" } });
    fireEvent.click(screen.getByRole("button", { name: "Save person" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].contacts[0].followUpOn).toBe("2099-03-04");
  });
});
