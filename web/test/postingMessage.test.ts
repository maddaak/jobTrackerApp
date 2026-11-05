import { describe, expect, it, vi } from "vitest";
import { bookmarkletFor, POSTING_MESSAGE, POSTING_RECEIVED, readPosting } from "../src/postingMessage";

describe("readPosting", () => {
  it("takes only the bookmarklet's own message, from an http page", () => {
    expect(readPosting({ type: POSTING_MESSAGE, url: "https://jobs.example/1", text: "  Engineer  ", title: " Staff " }))
      .toEqual({ url: "https://jobs.example/1", text: "Engineer", title: "Staff" });
    expect(readPosting({ type: POSTING_MESSAGE, url: "https://jobs.example/1", text: "x" })?.title).toBe("");
    for (const other of [
      null, "hello", { type: "other", url: "https://a.example", text: "x" },
      { type: POSTING_MESSAGE, url: "javascript:alert(1)", text: "x" },
      { type: POSTING_MESSAGE, url: "https://a.example", text: 42 },
    ]) {
      expect(readPosting(other), JSON.stringify(other)).toBeNull();
    }
  });
});

// jsdom lays nothing out, so the page's elements get the text and size a browser would give them.
function render(html: string, texts: Record<string, string>) {
  document.body.innerHTML = html;
  for (const [selector, text] of Object.entries(texts)) {
    const element = selector === "body" ? document.body : document.querySelector(selector) as HTMLElement;
    Object.defineProperty(element, "innerText", { value: text, configurable: true });
  }
  for (const heading of document.querySelectorAll("h1")) {
    heading.getClientRects = () => (heading.hidden ? [] : [new DOMRect(0, 0, 100, 20)]) as unknown as DOMRectList;
  }
}

describe("bookmarkletFor", () => {
  // Run as a browser would on a job page: it opens the app and sends the page to the app's origin only.
  it("sends the selection, or the page's text, to the app until the app answers", () => {
    vi.useFakeTimers();
    const opened = { postMessage: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(opened as unknown as Window);
    render("<h1>Senior Engineer</h1>", { body: "Senior Engineer at Initech", h1: "Senior Engineer" });
    const code = decodeURIComponent(bookmarkletFor("https://tracker.local:5173").slice("javascript:".length));

    new Function(code)();
    vi.advanceTimersByTime(1100);

    expect(open).toHaveBeenCalledWith("https://tracker.local:5173/", "_blank");
    expect(opened.postMessage).toHaveBeenCalledWith(
      { type: POSTING_MESSAGE, url: window.location.href, title: "Senior Engineer", text: "Senior Engineer at Initech" },
      "https://tracker.local:5173",
    );
    const sent = opened.postMessage.mock.calls.length;
    window.dispatchEvent(new MessageEvent("message", { data: POSTING_RECEIVED, origin: "https://tracker.local:5173" }));
    vi.advanceTimersByTime(2000);
    expect(opened.postMessage).toHaveBeenCalledTimes(sent);

    open.mockRestore();
    vi.useRealTimers();
  });

  it("takes only the panel the job is in when a board shows its list beside it", () => {
    vi.useFakeTimers();
    render(
      `<h1 hidden>Search results</h1>
       <div id="list" style="overflow-y: auto"><h3>Other job</h3></div>
       <div id="job" style="overflow-y: auto"><div><h1>Senior Engineer</h1></div><p>About the job</p></div>`,
      { body: "Other job Senior Engineer About the job", "#job": "Senior Engineer About the job", "#job h1": "Senior Engineer" },
    );

    const opened = { postMessage: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(opened as unknown as Window);

    new Function(decodeURIComponent(bookmarkletFor("https://tracker.local:5173").slice("javascript:".length)))();
    vi.advanceTimersByTime(600);

    open.mockRestore();
    expect(opened.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Senior Engineer", text: "Senior Engineer About the job" }),
      "https://tracker.local:5173",
    );
    vi.useRealTimers();
  });
});
