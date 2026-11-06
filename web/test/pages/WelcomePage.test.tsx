import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import WelcomePage from "../../src/pages/WelcomePage";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const SETTINGS = {
  emailConfigured: false, emailEnabled: false, email: "pat@example.com", timeZone: null,
  digest: true, digestHour: 8, interviewSoon: true, offerDeadline: true, followUp: false,
};

let uploads: string[];

function stubFetch(aiConfigured: boolean) {
  uploads = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (url === "/auth/me") return Promise.resolve(fakeResponse(200, { username: "pat" }));
    if (url === "/ai-status") return Promise.resolve(fakeResponse(200, { aiConfigured }));
    if (url === "/reminders/settings") return Promise.resolve(fakeResponse(200, SETTINGS));
    if (url === "/resumes" && init?.method === "POST") {
      uploads.push(((init.body as FormData).get("file") as File).name);
      return Promise.resolve(fakeResponse(200, { id: "r1", fileName: "x" }));
    }
    return Promise.resolve(fakeResponse(200, {}));
  }));
}

function renderPage() {
  return render(<MemoryRouter><AuthProvider><WelcomePage /></AuthProvider></MemoryRouter>);
}

describe("WelcomePage", () => {
  it("uploads resumes, skipping a file type it can't read", async () => {
    stubFetch(true);
    renderPage();

    const input = (await screen.findByText("Choose resume files")).querySelector("input")!;
    fireEvent.change(input, { target: { files: [
      new File(["resume"], "resume.pdf", { type: "application/pdf" }),
      new File(["x"], "photo.png", { type: "image/png" }),
    ] } });

    expect(await screen.findByRole("list", { name: "Uploaded resumes" })).toHaveTextContent("resume.pdf");
    expect(screen.getByRole("alert")).toHaveTextContent("photo.png");
    expect(uploads).toEqual(["resume.pdf"]);
  });

  it("offers notifications with the sign-up address, then checks setup with the lines to add", async () => {
    stubFetch(false);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByLabelText("Email address")).toHaveValue("pat@example.com");
    expect(screen.getByLabelText(/Email me notifications/)).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText(/AI features: not set up/)).toBeInTheDocument());
    expect(screen.getByText(/Email: not set up/)).toBeInTheDocument();
    expect(screen.getByText(/SMTP_HOST=smtp.gmail.com/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the board" })).toHaveAttribute("href", "/");
  });
});
