import Modal from "./Modal";

const SHORTCUTS: [string, string][] = [
  ["/  or  Ctrl K", "Find a job"],
  ["N", "Add a job"],
  ["G then B", "Go to the board"],
  ["G then C", "Go to the calendar"],
  ["G then I", "Go to Insights"],
  ["G then A", "Go to all jobs"],
  ["Space", "Pick up a focused card on the board, arrows to move it, Space to drop"],
  ["?", "Show this list"],
];

export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys} className="contents">
            <dt><kbd className="rounded border border-neutral-300 px-1.5 py-0.5 font-mono text-xs dark:border-neutral-600">{keys}</kbd></dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">Shortcuts pause while you're typing in a field.</p>
    </Modal>
  );
}
