// Scan de codes-barres : API native si dispo, sinon ZXing (WebAssembly) embarqué dans vendor/
let detector = null;

function getDetector() {
  if (detector) return detector;
  const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  const API = window.BarcodeDetectionAPI;
  if (API?.prepareZXingModule) {
    API.prepareZXingModule({
      overrides: {
        locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL('vendor/' + path, document.baseURI).href : prefix + path),
      },
    });
  }
  const Native = 'BarcodeDetector' in window ? window.BarcodeDetector : null;
  const Ctor = Native || API?.BarcodeDetector;
  if (!Ctor) throw new Error('Scanner indisponible sur ce navigateur');
  detector = new Ctor({ formats });
  return detector;
}

export class Scanner {
  constructor(video, onCode) {
    this.video = video;
    this.onCode = onCode;
    this.stream = null;
    this.running = false;
    this.last = null;
    this.hits = 0;
  }

  async start() {
    const det = getDetector();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      try {
        if (this.video.readyState >= 2) {
          const codes = await det.detect(this.video);
          const c = codes?.[0]?.rawValue;
          if (c) {
            // on attend 2 lectures identiques pour éviter les erreurs
            if (c === this.last) this.hits++; else { this.last = c; this.hits = 1; }
            if (this.hits >= 2) { this.running = false; navigator.vibrate?.(40); this.onCode(c); return; }
          }
        }
      } catch (e) { /* frame illisible, on continue */ }
      setTimeout(loop, 120);
    };
    loop();
  }

  get torchSupported() {
    const t = this.stream?.getVideoTracks?.()[0];
    return !!t?.getCapabilities?.().torch;
  }

  async torch(on) {
    const t = this.stream?.getVideoTracks?.()[0];
    try { await t.applyConstraints({ advanced: [{ torch: on }] }); } catch {}
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }
}
