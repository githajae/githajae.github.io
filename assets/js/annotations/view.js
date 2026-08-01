function button(className, text, label) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = text;
  if (label) node.setAttribute("aria-label", label);
  return node;
}

function debounce(callback, wait) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), wait);
  };
}

export class AnnotationView {
  constructor({ language, guide, content }) {
    this.language = language === "ko" ? "ko" : "en";
    this.markerClick = null;
    this.rangeHover = null;
    this.items = [];
    this.guide = guide;
    this.content = content;
    this.count = guide?.querySelector("[data-annotation-count]") || null;

    this.markerLayer = document.createElement("div");
    this.markerLayer.className = "annotation-markers";

    this.selectionButton = button(
      "annotation-selection-button",
      "+",
      this.language === "ko" ? "선택한 문장에 댓글 달기" : "Comment on selected text",
    );
    this.selectionButton.hidden = true;

    this.guide?.addEventListener("click", () => this.onGuide?.());
    if (this.guide) this.guide.hidden = false;

    this.content?.addEventListener("pointermove", (event) => this.inspectPointer(event));
    this.content?.addEventListener("pointerleave", () => this.setHoveredItem(null));
    this.content?.addEventListener("click", (event) => this.openFromRange(event));

    document.body.append(this.markerLayer, this.selectionButton);
    window.addEventListener("resize", debounce(() => this.positionMarkers(), 100));
  }

  updateCount(count) {
    if (!this.guide || !this.count) return;
    this.count.textContent = count ? String(count) : "";
    const label = this.language === "ko" ? "댓글" : "Comments";
    this.guide.setAttribute("aria-label", count ? `${label} ${count}` : label);
  }

  setUnavailable() {
    if (!this.guide) return;
    this.guide.disabled = true;
    this.guide.setAttribute(
      "aria-label",
      this.language === "ko" ? "댓글 사용 불가" : "Comments unavailable",
    );
  }

  showSelection(rect, onClick) {
    const compact = window.matchMedia("(max-width: 52rem)").matches;
    const left = compact
      ? window.innerWidth - 44
      : Math.max(8, Math.min(window.innerWidth - 44, rect.right + window.scrollX - 12));
    this.selectionButton.hidden = false;
    this.selectionButton.style.setProperty("--annotation-selection-top", `${rect.bottom + window.scrollY + 8}px`);
    this.selectionButton.style.setProperty("--annotation-selection-left", `${left}px`);
    this.selectionButton.onclick = onClick;
  }

  hideSelection() {
    this.selectionButton.hidden = true;
    this.selectionButton.onclick = null;
  }

  renderMarkers(items, onClick) {
    this.items = items.filter(({ range }) => range);
    this.markerClick = onClick;
    this.setHoveredItem(null);
    this.positionMarkers();
  }

  itemAtPoint(x, y) {
    return this.items.find(({ range }) => (
      [...range.getClientRects()].some((rect) => (
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      ))
    )) || null;
  }

  setHoveredItem(item) {
    if (this.hoveredItem === item) return;
    this.hoveredItem = item;
    this.content?.classList.toggle("annotation-range-hover", Boolean(item));
    this.rangeHover?.(item?.range || null);
  }

  inspectPointer(event) {
    this.setHoveredItem(this.itemAtPoint(event.clientX, event.clientY));
  }

  openFromRange(event) {
    if (event.target.closest("a, button, input, textarea, select")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const item = this.itemAtPoint(event.clientX, event.clientY);
    if (item) this.markerClick?.(item.annotation);
  }

  positionMarkers() {
    this.markerLayer.replaceChildren();
    let previousTop = -Infinity;
    const contentRect = this.content?.getBoundingClientRect();
    const documentRect = this.content?.closest("[data-annotation-root]")?.getBoundingClientRect();
    const marginWidth = contentRect && documentRect
      ? Math.max(0, documentRect.right - contentRect.right)
      : 0;
    const marginLeft = contentRect
      ? contentRect.right + window.scrollX + Math.max(4, (marginWidth - 32) / 2)
      : 0;

    this.items
      .map((item) => {
        const rect = item.range.getBoundingClientRect();
        return {
          ...item,
          top: rect.top + window.scrollY + (rect.height / 2) - 16,
          left: marginLeft,
        };
      })
      .sort((a, b) => a.top - b.top)
      .forEach((item) => {
        const top = Math.max(item.top, previousTop + 28);
        previousTop = top;
        const marker = button(
          "annotation-marker",
          "",
          this.language === "ko"
            ? `“${item.annotation.quote}”의 댓글 열기`
            : `Open comment on “${item.annotation.quote}”`,
        );
        marker.style.setProperty("--annotation-marker-top", `${top}px`);
        marker.style.setProperty("--annotation-marker-left", `${item.left}px`);
        marker.addEventListener("click", () => this.markerClick?.(item.annotation));
        this.markerLayer.append(marker);
      });
  }
}
