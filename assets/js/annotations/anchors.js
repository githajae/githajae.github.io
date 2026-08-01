const EXCLUDED_SELECTOR = ".footnotes, .sources-title, sup[role='doc-noteref'], script, style";
const CONTEXT_LENGTH = 64;
const MAX_QUOTE_LENGTH = 500;

function acceptedTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.parentElement?.closest(EXCLUDED_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function textSnapshot(root) {
  let offset = 0;
  const entries = acceptedTextNodes(root).map((node) => {
    const start = offset;
    offset += node.nodeValue.length;
    return { node, start, end: offset };
  });

  return {
    entries,
    text: entries.map(({ node }) => node.nodeValue).join(""),
  };
}

function intersects(range, node) {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function rangeOffsets(range, snapshot) {
  const touched = snapshot.entries.filter(({ node }) => intersects(range, node));
  if (!touched.length) return null;

  const first = touched[0];
  const last = touched[touched.length - 1];
  const start = first.start + (range.startContainer === first.node ? range.startOffset : 0);
  const end = last.start + (range.endContainer === last.node ? range.endOffset : last.node.nodeValue.length);
  return { start, end };
}

function trimOffsets(text, start, end) {
  const raw = text.slice(start, end);
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  return { start: start + leading, end: end - trailing };
}

export function captureSelection(root) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const snapshot = textSnapshot(root);
  const offsets = rangeOffsets(range, snapshot);
  if (!offsets) return null;

  const trimmed = trimOffsets(snapshot.text, offsets.start, offsets.end);
  const quote = snapshot.text.slice(trimmed.start, trimmed.end);
  if (!quote || quote.length > MAX_QUOTE_LENGTH) return null;

  return {
    quote,
    prefix: snapshot.text.slice(Math.max(0, trimmed.start - CONTEXT_LENGTH), trimmed.start),
    suffix: snapshot.text.slice(trimmed.end, trimmed.end + CONTEXT_LENGTH),
    start: trimmed.start,
    end: trimmed.end,
  };
}

function contextScore(text, index, anchor) {
  let score = 0;
  const prefix = text.slice(Math.max(0, index - anchor.prefix.length), index);
  const suffix = text.slice(index + anchor.quote.length, index + anchor.quote.length + anchor.suffix.length);

  for (let i = 1; i <= Math.min(prefix.length, anchor.prefix.length); i += 1) {
    if (prefix.at(-i) !== anchor.prefix.at(-i)) break;
    score += 1;
  }

  for (let i = 0; i < Math.min(suffix.length, anchor.suffix.length); i += 1) {
    if (suffix[i] !== anchor.suffix[i]) break;
    score += 1;
  }

  return score;
}

function locateQuote(text, anchor) {
  if (text.slice(anchor.start, anchor.end) === anchor.quote) return anchor.start;

  let index = text.indexOf(anchor.quote);
  let best = null;
  while (index !== -1) {
    const candidate = { index, score: contextScore(text, index, anchor) };
    if (!best || candidate.score > best.score) best = candidate;
    index = text.indexOf(anchor.quote, index + 1);
  }
  return best?.index ?? -1;
}

function pointAt(entries, offset, preferNext = false) {
  const entry = entries.find(({ start, end }) => (
    preferNext ? offset >= start && offset < end : offset > start && offset <= end
  )) || entries.find(({ start, end }) => offset >= start && offset <= end);

  if (!entry) return null;
  return { node: entry.node, offset: Math.max(0, Math.min(offset - entry.start, entry.node.nodeValue.length)) };
}

export function rangeForAnchor(root, anchor) {
  const snapshot = textSnapshot(root);
  const start = locateQuote(snapshot.text, anchor);
  if (start < 0) return null;

  const end = start + anchor.quote.length;
  const startPoint = pointAt(snapshot.entries, start, true);
  const endPoint = pointAt(snapshot.entries, end);
  if (!startPoint || !endPoint) return null;

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

export function selectionRect() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const rects = [...selection.getRangeAt(0).getClientRects()].filter((rect) => rect.width || rect.height);
  return rects.at(-1) || null;
}
