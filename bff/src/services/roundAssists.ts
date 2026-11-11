import { saveRoundAi } from "./aiResultsClient.js";
import { roundTypeWords, runAndSave, type AssistOutcome } from "./aiAssists.js";
import { listInterviews } from "./interviewsClient.js";
import { dataOrError, isServiceError, serviceError } from "./outcome.js";

// The notes are kept with the answer, so they can be read and corrected for another try.
export async function debriefRound(userId: string, roundId: string, notes: string): Promise<AssistOutcome> {
  const rounds = dataOrError(await listInterviews(userId));
  if (isServiceError(rounds)) return rounds;
  const round = rounds.find(candidate => candidate.roundId === roundId);
  if (!round) return serviceError(404, "interview round not found");
  return runAndSave("debrief", {
    company: round.company,
    role: round.role,
    roundType: roundTypeWords(round.interviewType),
    interviewers: round.interviewers.map(interviewer => interviewer.name),
    notes,
  }, content => saveRoundAi(userId, roundId, "debrief", content), { notes });
}
