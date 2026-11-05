import { vi } from "vitest";

// requireAuth asks core on every request; tests run as a current session unless one says otherwise.
vi.mock("../src/services/accountClient.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../src/services/accountClient.js")>()),
  checkSession: vi.fn(async () => ({ ok: true, status: 204 })),
}));
