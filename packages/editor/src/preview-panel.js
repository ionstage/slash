/**
 * Preview overlay: the real runtime playing the in-memory project inside
 * an iframe (packages/editor/preview.html). The iframe announces readiness
 * with a 'slash-preview-ready' message; we respond with documents + binary
 * files (Blobs transfer through postMessage's structured clone).
 */
export function createPreviewPanel(elements, store) {
  const { overlay, frameWrap, iframe, btnClose, btnMobile } = elements;
  let mobile = false;

  function payload() {
    return {
      type: 'slash-preview',
      docs: JSON.parse(JSON.stringify(store.docs)),
      files: Object.fromEntries(store.files),
    };
  }

  window.addEventListener('message', (e) => {
    if (e.source === iframe.contentWindow && e.data?.type === 'slash-preview-ready') {
      iframe.contentWindow.postMessage(payload(), '*');
    }
  });

  function open() {
    overlay.hidden = false;
    // Reload for a clean player each time; 'slash-preview-ready' triggers the send.
    iframe.src = `preview.html?ts=${Date.now()}`;
  }

  function close() {
    overlay.hidden = true;
    iframe.src = 'about:blank';
  }

  btnClose.addEventListener('click', close);
  btnMobile.addEventListener('click', () => {
    mobile = !mobile;
    frameWrap.classList.toggle('mobile', mobile);
    btnMobile.textContent = mobile ? 'Desktop view' : 'Mobile view';
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { open, close };
}
