import { useEffect, useRef } from "react";
import { bookmarkletFor } from "../postingMessage";

// React refuses javascript: links in markup, so the bookmarklet's address is set on the element itself.
export default function SaveToJobTrackerButton() {
  const link = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    link.current?.setAttribute("href", bookmarkletFor(window.location.origin));
  }, []);

  return (
    <a
      ref={link}
      onClick={e => e.preventDefault()}
      title="Drag this to your bookmarks bar"
      className="inline-block cursor-grab rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
    >
      Save to Job Tracker
    </a>
  );
}
