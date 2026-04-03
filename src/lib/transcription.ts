/**
 * Wrap transcription text with a recording ID marker for later identification.
 */
export function wrapTranscription(recordingId: string, text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div data-recording-id="${recordingId}"><p>${escaped}</p></div>`;
}

/**
 * Strip recording ID markers from content before sending to AI pipeline.
 * Converts <div data-recording-id="..."><p>text</p></div> → <p>text</p>
 */
export function stripRecordingMarkers(content: string): string {
  return content
    .replace(/<div data-recording-id="[^"]*">/g, "")
    .replace(/<\/div>/g, "");
}

/**
 * Replace the content of a specific recording marker in entry HTML.
 * Returns null if the marker was not found.
 */
export function replaceTranscriptionInContent(
  content: string,
  recordingId: string,
  newText: string
): string | null {
  const escapedNew = newText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pattern = new RegExp(
    `<div data-recording-id="${recordingId}">([\\s\\S]*?)<\\/div>`
  );
  if (!pattern.test(content)) return null;
  return content.replace(pattern, `<div data-recording-id="${recordingId}"><p>${escapedNew}</p></div>`);
}
