// Run inside the bff container, where the internal token is:
//   docker compose exec bff node dist/scripts/resetPassword.js <username>
// Prints a temporary password to log in with; change it under Profile afterwards.
import { temporaryPassword } from "../services/authClient.js";

const username = process.argv[2];
if (!username) {
  console.error("usage: node dist/scripts/resetPassword.js <username>");
  process.exit(2);
}

const result = await temporaryPassword(username);
if (!result.ok || !result.data) {
  const reason = (result.data as { error?: string } | undefined)?.error;
  console.error(reason ?? `could not reset the password (core answered ${result.status})`);
  process.exit(1);
}
console.log(`Temporary password for ${username}: ${result.data.temporaryPassword}`);
console.log("Log in with it, then change it under Profile.");
