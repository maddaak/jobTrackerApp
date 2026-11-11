import { useState } from "react";
import Modal from "./Modal";
import { importJobs, OUTCOME_LABELS, STAGE_LABELS, type ImportJobRow } from "../api/jobsApi";
import { guessField, IMPORT_FIELD_LABELS, parseCsv, toImportRows, type ImportField } from "../csvImport";

export interface ImportJobsDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

// Matches core's cap; a bigger sheet is split rather than sent and refused.
const MAX_ROWS = 2000;
const PREVIEW_ROWS = 5;
const selectClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900";
const cellClass = "border-b border-neutral-200 px-2 py-1 text-left align-top dark:border-neutral-700";
const buttonClass =
  "rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";

function statusLabel(row: ImportJobRow): string {
  if (row.outcome) return OUTCOME_LABELS[row.outcome];
  return row.stage ? STAGE_LABELS[row.stage] : "Applied";
}

export default function ImportJobsDialog({ open, onClose, onImported }: ImportJobsDialogProps) {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][]>([]);
  const [fields, setFields] = useState<ImportField[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const headers = table[0] ?? [];
  const { rows, incomplete } = toImportRows(table, fields);
  const tooMany = rows.length > MAX_ROWS;
  const hasCompanyAndRole = fields.includes("company") && fields.includes("role");

  function reset() {
    setFileName("");
    setTable([]);
    setFields([]);
    setError(null);
    setResult(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function readFile(file: File | undefined) {
    reset();
    if (!file) return;
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setError("That file has no rows under its header. Export the sheet as CSV and try again.");
      return;
    }
    setFileName(file.name);
    setTable(parsed);
    setFields(parsed[0].map(guessField));
  }

  async function runImport() {
    setImporting(true);
    setError(null);
    try {
      setResult(await importJobs(rows));
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to import the spreadsheet");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Import from a spreadsheet" wide>
      {result ? (
        <div className="space-y-4 text-sm">
          <p role="status">
            Added {result.imported} {result.imported === 1 ? "job" : "jobs"}.
            {result.skipped > 0 && ` ${result.skipped} ${result.skipped === 1 ? "was" : "were"} already here, so ${result.skipped === 1 ? "it was" : "they were"} skipped.`}
          </p>
          <button type="button" className={buttonClass} onClick={close}>Done</button>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-neutral-600 dark:text-neutral-400">
            Save your sheet as CSV first: in Google Sheets, File, Download, CSV; in Excel, Save As, CSV. Exports
            from other trackers work too. Nothing is saved until you press Import.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Spreadsheet file"
            onChange={e => readFile(e.target.files?.[0])}
          />

          {headers.length > 0 && (
            <>
              <div>
                <p className="mb-1 font-medium">Match your columns</p>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={cellClass}>Column in {fileName}</th>
                      <th className={cellClass}>First value</th>
                      <th className={cellClass}>Goes into</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((header, i) => (
                      <tr key={i}>
                        <td className={cellClass}>{header || `Column ${i + 1}`}</td>
                        <td className={`${cellClass} max-w-[12rem] truncate text-neutral-500`} title={table[1]?.[i]}>
                          {table[1]?.[i]}
                        </td>
                        <td className={cellClass}>
                          <select
                            aria-label={`Field for ${header || `column ${i + 1}`}`}
                            className={selectClass}
                            value={fields[i]}
                            onChange={e => setFields(prev => prev.map((f, j) => (j === i ? e.target.value as ImportField : f)))}
                          >
                            {(Object.keys(IMPORT_FIELD_LABELS) as ImportField[]).map(field => (
                              <option key={field} value={field}>{IMPORT_FIELD_LABELS[field]}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rows.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">How the first rows will look</p>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className={cellClass}>Company</th>
                        <th className={cellClass}>Position</th>
                        <th className={cellClass}>Status</th>
                        <th className={cellClass}>Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                        <tr key={i}>
                          <td className={cellClass}>{row.company}</td>
                          <td className={cellClass}>{row.role}</td>
                          <td className={cellClass}>{statusLabel(row)}</td>
                          <td className={cellClass}>{row.appliedOn ?? "Today"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p role="status">
                {hasCompanyAndRole
                  ? `${rows.length} ${rows.length === 1 ? "job" : "jobs"} ready to import.`
                  : "Choose which columns hold the company and the position."}
                {incomplete > 0 && ` ${incomplete} ${incomplete === 1 ? "row has" : "rows have"} no company or position and will be left out.`}
                {" "}A job you already track under the same company and position is skipped.
              </p>
              {tooMany && (
                <p className="text-red-600 dark:text-red-400">
                  That's more than {MAX_ROWS} jobs. Split the file and import each part.
                </p>
              )}
              <button
                type="button"
                className={buttonClass}
                disabled={importing || rows.length === 0 || tooMany}
                onClick={runImport}
              >
                {importing ? "Importing…" : `Import ${rows.length} ${rows.length === 1 ? "job" : "jobs"}`}
              </button>
            </>
          )}
          {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
