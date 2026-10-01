// Backup: export everything to a JSON file (share sheet on iPhone, download elsewhere) and import it back.

import { h, toast } from './dom.js';
import { exportData, importData, setSetting } from '../db/repo.js';
import { today, formatDay } from '../engine/index.js';

export async function exportBackup() {
  const data = await exportData();
  const name = `miles-backup-${today()}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Miles backup' });
    } else {
      const url = URL.createObjectURL(file);
      h('a', { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  } catch (err) {
    if (err.name === 'AbortError') return false; // she closed the share sheet
    toast(`The backup wasn't saved: ${err.message}`);
    return false;
  }
  await setSetting('lastExportAt', Date.now());
  toast('Backup exported. Keep the file somewhere other than this phone, e.g. iCloud Drive.');
  return true;
}

// A hidden file picker; resolves after a successful import.
export function importBackup(onDone) {
  const input = h('input', {
    type: 'file', accept: 'application/json,.json',
    onchange: async () => {
      const file = input.files[0];
      if (!file) return;
      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch {
        toast('Nothing changed: that file isn\'t a readable backup.');
        return;
      }
      const count = backup?.stores?.txns?.length ?? 0;
      const from = backup?.exportedAt ? formatDay(backup.exportedAt.slice(0, 10)) : 'an unknown date';
      if (!confirm(`Replace everything on this phone with the backup from ${from}? It has ${count} purchase${count === 1 ? '' : 's'}.`)) return;
      try {
        await importData(backup);
        toast('Imported backup');
        onDone?.();
      } catch (err) {
        toast(`Nothing changed: ${err.message}`);
      }
    },
  });
  input.click();
}
