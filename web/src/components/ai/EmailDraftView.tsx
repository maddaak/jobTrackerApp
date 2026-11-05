import { CopyButton, TitledList } from "./AiPanel";
import type { EmailDraft } from "../../api/aiApi";

export default function EmailDraftView({ draft }: { draft: EmailDraft }) {
  return (
    <>
      <p>
        <span className="text-neutral-500 dark:text-neutral-400">Subject:</span> {draft.subject}{" "}
        <CopyButton text={draft.subject} label="Copy subject" />
      </p>
      <div>
        <CopyButton text={draft.body} label="Copy email" />
        <p className="mt-1 whitespace-pre-line rounded bg-neutral-50 p-2 dark:bg-neutral-800">{draft.body}</p>
      </div>
      <TitledList title="What it asks for" items={draft.asks} />
    </>
  );
}
