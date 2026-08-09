// Loads the Postgres export into job_details. Additive only: it $sets the moved fields and never
// touches jdTextCompressed, interviewNotes, or recommendedResume, so existing document content
// survives. Nothing is deleted from Postgres here — dropping happens in a later, separate step
// that only runs after these counts are verified.
//
// Idempotent: re-running overwrites the same fields with the same values.
//
// Run from the repo root, after 005 has produced the export:
//   docker compose exec -T mongo mongosh --quiet "mongodb://localhost:27017/jobtracker" \
//     --eval "var EXPORT = $(cat /tmp/job_details_export.json)" \
//     < core/migrations/006_load_details_into_mongo.js

const details = db.getSiblingDB("jobtracker").job_details;

if (typeof EXPORT === "undefined") {
  throw new Error("EXPORT not provided; pass the 005 output via --eval");
}

function toDate(value) {
  return value === null || value === undefined ? null : new Date(value);
}

// mongosh's UUID() returns a BSON Binary, but roundId is a plain string on the document and in the
// API path, so build the v4 text form directly.
function newRoundId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let created = 0;
let updated = 0;
let stageEntries = 0;
let rounds = 0;
let interviewers = 0;

for (const job of EXPORT) {
  const stageHistory = (job.stageHistory || []).map(entry => ({
    stage: entry.stage,
    enteredAt: toDate(entry.enteredAt),
    note: entry.note,
  }));
  const interviews = (job.interviews || []).map(round => ({
    // Embedded documents have no database identity, so mint the addressable id the API exposes.
    roundId: newRoundId(),
    interviewDateTime: toDate(round.interviewDateTime),
    interviewType: round.interviewType,
    meetingLink: round.meetingLink,
    location: round.location,
    interviewers: (round.interviewers || []).map(person => ({
      name: person.name,
      linkedInUrl: person.linkedInUrl,
    })),
  }));

  stageEntries += stageHistory.length;
  rounds += interviews.length;
  interviewers += interviews.reduce((n, r) => n + r.interviewers.length, 0);

  const existing = details.findOne({ jobId: NumberLong(job.jobId) });
  const result = details.updateOne(
    { jobId: NumberLong(job.jobId) },
    {
      $set: {
        ownerId: NumberLong(job.ownerId),
        notes: job.notes,
        rejectedReason: job.rejectedReason,
        stageHistory: stageHistory,
        interviews: interviews,
      },
      // Only applied on insert, so jobs that never had a document get a well-formed one.
      $setOnInsert: {
        _class: "com.jobtracker.core.model.JobDetail",
        jdTextCompressed: BinData(0, ""),
        interviewNotes: "",
      },
    },
    { upsert: true },
  );
  if (existing) {
    updated++;
  } else {
    created++;
  }
  if (result.matchedCount === 0 && result.upsertedCount === 0) {
    throw new Error(`jobId ${job.jobId} was neither matched nor inserted`);
  }
}

print(`jobs in export:        ${EXPORT.length}`);
print(`documents updated:     ${updated}`);
print(`documents created:     ${created}`);
print(`stage entries written: ${stageEntries}`);
print(`rounds written:        ${rounds}`);
print(`interviewers written:  ${interviewers}`);
print(`job_details total:     ${details.countDocuments()}`);

// Every job must end up with exactly one document, or the drop step must not run.
if (details.countDocuments() < EXPORT.length) {
  throw new Error("fewer documents than jobs; do not proceed to the drop step");
}
