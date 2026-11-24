/** Files dropped on a page: folders read through, for the importers (content packs, characters). */

/** Every file in a drop, folders included (read through), with its path; and the folder's name when one was dropped. */
export async function droppedFiles(transfer: DataTransfer): Promise<{ files: File[]; folder?: string }> {
  const entries = [...transfer.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return { files: [...transfer.files] };
  const files: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) { files.push(await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail)));return; }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (!batch.length) break;
      for (const e of batch) await walk(e);
    }
  };
  for (const e of entries) await walk(e);
  const folders = entries.filter((e) => e.isDirectory);
  return { files, ...(folders.length === 1 && entries.length === 1 ? { folder: folders[0].name } : {}) };
}
