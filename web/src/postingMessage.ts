// What the bookmarklet sends from a job page to a newly opened app tab, and the reply that stops it resending.
export const POSTING_MESSAGE = "job-tracker-posting";
export const POSTING_RECEIVED = "job-tracker-posting-received";
// Matches the paste box's limit, which the bff enforces on the description too.
export const MAX_POSTING_CHARS = 50_000;

export interface SavedPosting {
  url: string;
  text: string;
  // The page's main heading, which job boards give the job title; the page text starts with their menus.
  title: string;
}

// Anything can post a message to this window, so only the exact shape the bookmarklet sends is taken.
export function readPosting(data: unknown): SavedPosting | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, url, text, title } = data as Record<string, unknown>;
  if (type !== POSTING_MESSAGE || typeof url !== "string" || typeof text !== "string") return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url: url.slice(0, 2000),
    text: text.slice(0, MAX_POSTING_CHARS).trim(),
    title: typeof title === "string" ? title.trim().slice(0, 200) : "",
  };
}

// Runs on the job page: opens the app and sends it the address and the selected text, or else the text of
// the scrolling panel the title sits in, since some boards put the list and the job side by side.
// Posted to the app's origin only, so a page's text never goes anywhere else. It resends until the app,
// which may still be loading or asking for a login, says it has it.
export function bookmarkletFor(origin: string): string {
  const code = `(()=>{const a=${JSON.stringify(origin)};`
    + `const w=window.open(a+"/","_blank");`
    + `if(!w){alert("Allow pop-ups on this site to save the posting to Job Tracker.");return}`
    + `const s=String(getSelection()).trim();`
    + `const h=[...document.querySelectorAll("h1")].find(e=>e.getClientRects().length);`
    + `let p=h;while(p&&p!==document.body&&!/auto|scroll/.test(getComputedStyle(p).overflowY))p=p.parentElement;`
    + `const d={type:${JSON.stringify(POSTING_MESSAGE)},url:location.href,title:h?h.innerText:"",text:(s||(p||document.body).innerText).slice(0,${MAX_POSTING_CHARS})};`
    + `const i=setInterval(()=>w.postMessage(d,a),500);`
    + `addEventListener("message",e=>{if(e.origin===a&&e.data===${JSON.stringify(POSTING_RECEIVED)})clearInterval(i)});`
    + `setTimeout(()=>clearInterval(i),120000)})()`;
  return `javascript:${encodeURIComponent(code)}`;
}
