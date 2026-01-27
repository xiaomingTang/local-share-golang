import { useEffect, useMemo, useState } from "react";
import type { DirectoryItem } from "../types";

export function useSelection(params: {
  currentPath: string;
  items: DirectoryItem[];
  buildFilePath: (currentPath: string, fileName: string) => string;
}) {
  const { currentPath, items, buildFilePath } = params;

  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [currentPath]);

  useEffect(() => {
    const existing = new Set(
      items.map((it) => buildFilePath(currentPath, it.name)),
    );
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const p of Array.from(next)) {
        if (!existing.has(p)) next.delete(p);
      }
      return next;
    });
  }, [currentPath, items, buildFilePath]);

  const selectedInThisFolder = useMemo(() => {
    const total = items.length;
    let selectedCount = 0;
    for (const it of items) {
      const p = buildFilePath(currentPath, it.name);
      if (selected.has(p)) selectedCount++;
    }
    return { total, selectedCount };
  }, [currentPath, items, selected, buildFilePath]);

  function onToggleSelect(fileName: string, checked: boolean) {
    const relPath = buildFilePath(currentPath, fileName);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(relPath);
      else next.delete(relPath);
      return next;
    });
  }

  function onSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of items) {
        const p = buildFilePath(currentPath, it.name);
        if (checked) next.add(p);
        else next.delete(p);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return {
    selected,
    selectedInThisFolder,
    onToggleSelect,
    onSelectAll,
    clearSelection,
    setSelected,
  };
}
