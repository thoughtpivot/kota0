/**
 * Inline rename editing for app-rail rows — one concern.
 *
 * Owns the "double-click to rename" edit buffer + commit/cancel. `renameApp`
 * (from `useApps`) does the persistence; this just manages edit UI state.
 */
import { ref } from "vue";
import type { AppRowVm } from "@/components/kota0/apps/data/appTypes";

export function useAppEditor(renameApp: (appId: string, name: string) => Promise<boolean>) {
  const editingAppId = ref<string | null>(null);
  const editingNameDraft = ref("");

  function beginEdit(a: AppRowVm): void {
    if (a.pending) return;
    editingAppId.value = a.app_id;
    editingNameDraft.value = a.name;
  }

  function cancelEdit(): void {
    editingAppId.value = null;
    editingNameDraft.value = "";
  }

  async function commitEdit(a: AppRowVm): Promise<void> {
    if (a.pending) return;
    if (editingAppId.value !== a.app_id) return;
    const trimmed = editingNameDraft.value.trim();
    if (trimmed === a.name || trimmed === "") {
      cancelEdit();
      return;
    }
    const ok = await renameApp(a.app_id, trimmed);
    if (ok) cancelEdit();
  }

  return { editingAppId, editingNameDraft, beginEdit, cancelEdit, commitEdit };
}
