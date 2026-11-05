import SaveToJobTrackerButton from "../SaveToJobTrackerButton";

export default function BookmarkletSettings() {
  return (
    <div className="space-y-2 text-sm">
      <p>
        Drag this button to your browser's bookmarks bar. Then, on any job posting, including sites the link fetcher
        can't read such as LinkedIn, click it: Job Tracker opens with the posting's link and text in the add-job form,
        and the title, location, and pay filled in from it. Nothing is saved until you press Add.
      </p>
      <SaveToJobTrackerButton />
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Select just the description before clicking to leave out the rest of the page. It sends the text only to this
        app, at this address.
      </p>
    </div>
  );
}
