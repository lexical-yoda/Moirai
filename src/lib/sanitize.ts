import DOMPurify from "dompurify";

/**
 * Sanitize HTML for safe rendering via dangerouslySetInnerHTML.
 * Allows only safe formatting tags — strips scripts, event handlers, etc.
 */
export function sanitizeHtml(dirty: string): string {
  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "del",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "pre", "code",
      "a", "mark", "hr", "span", "div",
      "table", "thead", "tbody", "tr", "th", "td",
      "input",
    ],
    ALLOWED_ATTR: ["href", "class", "type", "checked", "disabled"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
  });

  // Add secure attributes to all anchor tags (rel and target not in ALLOWED_ATTR so DOMPurify strips user-provided ones)
  return clean.replace(
    /<a(\s)/g,
    '<a rel="noopener noreferrer" target="_blank"$1'
  );
}
