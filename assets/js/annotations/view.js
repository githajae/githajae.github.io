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
  constructor({ language, guide }) {
    this.language = language === "ko" ? "ko" : "en";
    this.markerClick = null;
    this.items = [];
    this.guide = guide;
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
    this.positionMarkers();
  }

  positionMarkers() {
    this.markerLayer.replaceChildren();
    let previousTop = -Infinity;

    this.items
      .map((item) => {
        const rect = item.range.getBoundingClientRect();
        return {
          ...item,
          top: rect.top + window.scrollY,
          left: rect.right + window.scrollX + 12,
        };
      })
      .sort((a, b) => a.top - b.top)
      .forEach((item) => {
        const top = Math.max(item.top, previousTop + 28);
        previousTop = top;
        const marker = button(
          `annotation-marker${item.annotation.resolved ? " annotation-marker--resolved" : ""}`,
          item.annotation.resolved ? "✓" : "1",
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
