// Voice notes for the evidence board. Recordings are kept in this browser's
// IndexedDB under "<caseId>:<noteId>"; they are never uploaded anywhere.

const DB = 'synapse-voice';
const STORE = 'notes';

export const voiceSupported = () => !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && window.indexedDB);

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req && req.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error); };
  });
}

export const putVoice = (key, blob) => run('readwrite', s => s.put(blob, key));
export const getVoice = key => run('readonly', s => s.get(key));
export const deleteVoice = key => run('readwrite', s => s.delete(key)).catch(() => {});

// Called when a case is reset: every recording for that case goes.
export function deleteVoices(caseId) {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return run('readwrite', s => s.delete(IDBKeyRange.bound(`${caseId}:`, `${caseId}:￿`))).catch(() => {});
}
