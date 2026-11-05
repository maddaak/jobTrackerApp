import { once } from "node:events";
import { afterAll } from "vitest";
import supertest from "supertest";
import { app } from "../src/app.js";

// supertest(app) listens on every address but sends to 127.0.0.1, so a parallel test file bound there
// got the requests (wrong answers, "socket hang up"). Binding 127.0.0.1 ourselves avoids that.
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");

afterAll(() => {
  server.closeAllConnections();
  return new Promise<void>(resolve => server.close(() => resolve()));
});

export const request = () => supertest(server);
