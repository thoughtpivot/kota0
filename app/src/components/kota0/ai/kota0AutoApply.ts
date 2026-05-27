/** Auto-apply is always server-driven via the chat workflow; nothing to arm client-side. */
export function shouldArmAutoApplyAfterSend(): boolean {
  return false;
}
