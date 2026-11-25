// @ts-check
/**
 * The staff app's camera QR reader (loyalty cards, ADR-0013 §7). It uses the phone's own
 * reader when the browser has one (BarcodeDetector, e.g. Chrome on Android) and otherwise
 * loads /admin/scan.js (jsQR) on first use. Nothing is recorded or sent: frames stay on the
 * device and only the text read is returned.
 */

/**
 * @typedef {object} ScanTexts
 * @property {string} title
 * @property {string} hint
 * @property {string} cancel
 * @property {string} denied
 */

/**
 * Opens the camera full screen until a QR code is read or staff cancel.
 * @param {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @param {ScanTexts} texts
 * @returns {Promise<string | null>}  the text read, or null (cancelled, or no camera)
 */
export function scanQr(h, texts) {
  return new Promise((resolve) => {
    /** @type {MediaStream | null} */
    let stream = null;
    let done = false;
    const video = /** @type {HTMLVideoElement} */ (
      h('video', { class: 'a-scan-video', playsinline: true, muted: true, autoplay: true })
    );
    const status = h('p', { class: 'a-scan-hint', role: 'status' }, texts.hint);
    const overlay = h(
      'div',
      { class: 'a-scan', role: 'dialog', 'aria-modal': 'true', 'aria-label': texts.title },
      video,
      h('div', { class: 'a-scan-frame', 'aria-hidden': 'true' }),
      status,
      h(
        'button',
        { type: 'button', class: 'a-btn a-scan-cancel', onclick: () => finish(null) },
        texts.cancel,
      ),
    );
    document.body.append(overlay);
    const onKey = (/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && finish(null);
    document.addEventListener('keydown', onKey);

    /** @param {string | null} value */
    function finish(value) {
      if (done) return;
      done = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        status.textContent = texts.denied;
        return;
      }
      if (done) return finish(null);
      video.srcObject = stream;
      await video.play().catch(() => {});
      const read = await reader();
      const tick = async () => {
        if (done) return;
        const text = video.readyState >= 2 ? await read(video).catch(() => null) : null;
        if (text) {
          if (navigator.vibrate) navigator.vibrate(80);
          return finish(text);
        }
        setTimeout(tick, 200);
      };
      tick();
    })();
  });
}

/** The fastest reader this browser has. */
async function reader() {
  const Detector = /** @type {any} */ (globalThis).BarcodeDetector;
  if (Detector) {
    try {
      const formats = await Detector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detector = new Detector({ formats: ['qr_code'] });
        return async (/** @type {HTMLVideoElement} */ video) =>
          /** @type {string | null} */ ((await detector.detect(video))[0]?.rawValue ?? null);
      }
    } catch {
      /* fall through to jsQR */
    }
  }
  // Not a bundled import: /admin/scan.js is a separate file, loaded only here.
  const { default: jsQR } = await import(new URL('scan.js', import.meta.url).href);
  const canvas = document.createElement('canvas');
  const g = /** @type {CanvasRenderingContext2D} */ (
    canvas.getContext('2d', { willReadFrequently: true })
  );
  return async (/** @type {HTMLVideoElement} */ video) => {
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    g.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = g.getImageData(0, 0, canvas.width, canvas.height);
    return (
      jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null
    );
  };
}
