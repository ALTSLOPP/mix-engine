/** Serialize a structured-cloneable value away from the main thread when Workers are available. */
export async function stringifyAsync(value: unknown): Promise<string> {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return JSON.stringify(value);
  }

  const source = 'self.onmessage = (event) => { try { self.postMessage({ ok: true, json: JSON.stringify(event.data) }); } catch (error) { self.postMessage({ ok: false, error: String(error) }); } };';
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return await new Promise<string>((resolve, reject) => {
      const worker = new Worker(url);
      worker.onmessage = (event: MessageEvent<{ ok: boolean; json?: string; error?: string }>) => {
        worker.terminate();
        if (event.data.ok && event.data.json !== undefined) resolve(event.data.json);
        else reject(new Error(event.data.error ?? 'JSON worker failed'));
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || 'JSON worker failed'));
      };
      worker.postMessage(value);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
