// Fails closed (returns false) so AI features stay hidden if the backend status can't be confirmed.
export async function getAiConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/ai-status");
    if (!res.ok) return false;
    const data = await res.json();
    return data.aiConfigured === true;
  } catch {
    return false;
  }
}
