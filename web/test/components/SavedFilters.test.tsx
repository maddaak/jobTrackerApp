import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedFilters from "../../src/components/jobsTable/SavedFilters";

const REMOTE = [{ id: "location", value: ["REMOTE"] }];

// localStorage is undefined in this test setup, so the test brings its own.
beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  });
});

describe("SavedFilters", () => {
  it("saves the filters in use under a name and applies them later", () => {
    const { unmount } = render(<SavedFilters current={REMOTE} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save these filters" }));
    fireEvent.change(screen.getByLabelText("Name for these filters"), { target: { value: "Remote only" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    unmount();

    // A later visit, with nothing filtered yet.
    const onApply = vi.fn();
    render(<SavedFilters current={[]} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Remote only" }));

    expect(onApply).toHaveBeenCalledWith(REMOTE);
  });

  it("forgets a saved view", () => {
    localStorage.setItem("jobTracker.savedFilters", JSON.stringify([{ name: "Remote only", filters: REMOTE }]));
    render(<SavedFilters current={[]} onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Forget the Remote only view" }));

    expect(screen.queryByRole("button", { name: "Remote only" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("jobTracker.savedFilters")!)).toEqual([]);
  });

  // Storage that holds something unexpected, or refuses to be read, must not take the table down.
  it("shows nothing when storage is unreadable", () => {
    localStorage.setItem("jobTracker.savedFilters", "{not json");

    const { container } = render(<SavedFilters current={[]} onApply={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
