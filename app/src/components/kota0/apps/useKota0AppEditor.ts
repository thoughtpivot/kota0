/**
 * Inline rename editing for app-rail rows — one concern.
 *
 * Owns the "double-click to rename" edit buffer + commit/cancel. `renameApp`
 * (from `useKota0Apps`) does the persistence; this just manages edit UI state.
 */
import { ref } from "vue";
import type { Kota0AppRowVm } from "@/components/kota0/apps/kota0AppTypes";

export function useKota0AppEditor(renameApp: (appId: string, name: string) => Promise<boolean>) {
  const editingAppId = ref<string | null>(null);
  const editingNameDraft = ref("");

  function beginEdit(a: Kota0AppRowVm): void {
    if (a.pending) return;
    editingAppId.value = a.app_id;
    editingNameDraft.value = a.name;
  }

  function cancelEdit(): void {
    editingAppId.value = null;
    editingNameDraft.value = "";
  }

  async function commitEdit(a: Kota0AppRowVm): Promise<void> {
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
