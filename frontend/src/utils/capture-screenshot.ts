/**
 * Captures a screenshot of the Sandpack preview iframe.
 * Returns a base64 PNG data URL, or null if capture fails.
 */
export async function capturePreviewScreenshot(): Promise<string | null> {
  try {
    const iframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement | null;
    const container = iframe?.parentElement ?? iframe;

    if (!container) return null;

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(container as HTMLElement, {
      scale: 0.5,
      width: 400,
      height: 300,
      useCORS: true,
      allowTaint: true,
    });

    return canvas.toDataURL('image/png', 0.7);
  } catch {
    return null;
  }
}
