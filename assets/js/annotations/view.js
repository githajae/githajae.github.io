function button(className, text, label) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = text;
  if (label) node.setAttribute("aria-label", label);
  return node;
}

function excerpt(paragraph) {
  const text = paragraph.textContent.trim().replace(/\s+/g, " ");
  return text.length > 96 ? `${text.slice(0, 93)}…` : text;
}

export class AnnotationView {
  constructor({ language, guide, content }) {
    this.language = language === "ko" ? "ko" : "en";
    this.markerClick = null;
    this.paragraphClick = null;
    this.items = [];
    this.itemsByParagraph = new Map();
    this.actions = new Map();
    this.draftParagraph = null;
    this.guide = guide;
    this.content = content;
    this.count = guide?.querySelector("[data-annotation-count]") || null;
    this.paragraphs = [...(content?.querySelectorAll("p") || [])]
      .filter((paragraph) => !paragraph.closest(".footnotes"));

    this.installParagraphActions();
    this.guide?.addEventListener("click", () => this.onGuide?.());
    if (this.guide) this.guide.hidden = false;
    this.content?.addEventListener("click", (event) => this.openFromParagraph(event));
  }

  installParagraphActions() {
    this.paragraphs.forEach((paragraph) => {
      paragraph.classList.add("annotation-commentable");
      const action = button("annotation-paragraph-action", "", this.actionLabel(paragraph, 0));
      action.addEventListener("click", (event) => {
        event.stopPropagation();
        this.activateParagraph(paragraph);
      });
      paragraph.append(action);
      this.actions.set(paragraph, action);
    });
  }

  actionLabel(paragraph, count) {
    const quote = excerpt(paragraph);
    if (this.language === "ko") {
      return count
        ? `“${quote}” 문단의 댓글 열기`
        : `“${quote}” 문단에 댓글 달기`;
    }
    return count
      ? `Open comments on paragraph “${quote}”`
      : `Comment on paragraph “${quote}”`;
  }

  paragraphForTarget(target) {
    const paragraph = target instanceof Element ? target.closest("p") : null;
    if (!paragraph || !this.paragraphs.includes(paragraph)) return null;
    return paragraph;
  }

  paragraphForRange(range) {
    const start = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
    return this.paragraphForTarget(start);
  }

  activateParagraph(paragraph) {
    const item = this.itemsByParagraph.get(paragraph)?.[0];
    if (item) this.markerClick?.(item.annotation);
    else this.paragraphClick?.(paragraph);
  }

  openFromParagraph(event) {
    if (event.target.closest("a, button, input, textarea, select")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const paragraph = this.paragraphForTarget(event.target);
    if (paragraph) this.activateParagraph(paragraph);
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

  renderMarkers(items, onClick, activeId = "") {
    this.items = items.filter(({ range }) => range);
    this.markerClick = onClick;
    this.itemsByParagraph.clear();
    this.paragraphs.forEach((paragraph) => {
      paragraph.classList.remove("has-annotation", "is-active");
      this.actions.get(paragraph)?.setAttribute("aria-label", this.actionLabel(paragraph, 0));
    });

    this.items.forEach((item) => {
      const paragraph = this.paragraphForRange(item.range);
      if (!paragraph) return;
      const paragraphItems = this.itemsByParagraph.get(paragraph) || [];
      paragraphItems.push(item);
      this.itemsByParagraph.set(paragraph, paragraphItems);
      paragraph.classList.add("has-annotation");
      if (item.annotation.id === activeId) paragraph.classList.add("is-active");
    });

    this.itemsByParagraph.forEach((paragraphItems, paragraph) => {
      this.actions.get(paragraph)?.setAttribute(
        "aria-label",
        this.actionLabel(paragraph, paragraphItems.length),
      );
    });

    if (!activeId && this.draftParagraph) this.draftParagraph.classList.add("is-active");
  }

  setDraftParagraph(paragraph) {
    this.draftParagraph = paragraph;
    this.paragraphs.forEach((item) => item.classList.toggle("is-active", item === paragraph));
  }

  clearActiveParagraph() {
    this.draftParagraph = null;
    this.paragraphs.forEach((paragraph) => paragraph.classList.remove("is-active"));
  }
}
