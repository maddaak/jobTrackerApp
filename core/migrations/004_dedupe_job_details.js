// Resolves duplicate jobId documents so the unique index can build.
//
// Duplicates are the lost-update race described in REVIEW_LEDGER F51/F27: with no unique index,
// two concurrent first-saves for one jobId both insert, and each holds half the edits. Rather than
// dropping either, both are merged into one document and the loser is archived, never deleted.
//
// Merge rules: scalars take the first non-empty value (survivor wins ties), arrays are unioned.
// A no-op when there are no duplicates, so it is safe to run unconditionally before the migration.
//
// Run from the repo root:
//   docker compose exec -T mongo mongosh --quiet "mongodb://localhost:27017/jobtracker" \
//     < core/migrations/004_dedupe_job_details.js

const details = db.getSiblingDB("jobtracker").job_details;
const archive = db.getSiblingDB("jobtracker").job_details_duplicates;

const dupes = details
  .aggregate([
    { $group: { _id: "$jobId", ids: { $push: "$_id" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ])
  .toArray();

if (dupes.length === 0) {
  print("no duplicate jobIds; nothing to merge");
} else {
  print(`merging ${dupes.length} duplicated jobId(s)`);
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return null;
}

for (const dupe of dupes) {
  const docs = details.find({ jobId: dupe._id }).toArray();
  // Oldest document survives so its _id stays stable for anything already referencing it.
  docs.sort((a, b) => (a._id < b._id ? -1 : 1));
  const survivor = docs[0];
  const losers = docs.slice(1);

  const merged = {
    ownerId: firstNonEmpty(docs.map(d => d.ownerId)),
    jdTextCompressed: firstNonEmpty(docs.map(d => d.jdTextCompressed)),
    interviewNotes: firstNonEmpty(docs.map(d => d.interviewNotes)),
    recommendedResume: firstNonEmpty(docs.map(d => d.recommendedResume)),
    notes: firstNonEmpty(docs.map(d => d.notes)),
    rejectedReason: firstNonEmpty(docs.map(d => d.rejectedReason)),
    stageHistory: docs.flatMap(d => d.stageHistory || []),
    interviews: docs.flatMap(d => d.interviews || []),
  };
  // Drop keys that stayed null so the merge never writes a field the document didn't have.
  for (const key of Object.keys(merged)) {
    if (merged[key] === null) {
      delete merged[key];
    }
  }

  // Archive first: if the update fails, the losing content is already preserved.
  for (const loser of losers) {
    archive.insertOne(Object.assign({}, loser, { archivedFrom: loser._id, jobId: dupe._id }));
  }

  details.updateOne({ _id: survivor._id }, { $set: merged });
  details.deleteMany({ jobId: dupe._id, _id: { $ne: survivor._id } });

  print(`  jobId ${dupe._id}: merged ${docs.length} docs into ${survivor._id}, archived ${losers.length}`);
}

const remaining = details
  .aggregate([
    { $group: { _id: "$jobId", n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ])
  .toArray();

if (remaining.length > 0) {
  throw new Error(`still ${remaining.length} duplicate jobId(s); unique index would fail`);
}
print(`archived documents retained: ${archive.countDocuments()}`);
print("job_details has one document per jobId");
