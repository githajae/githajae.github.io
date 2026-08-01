const COPY = {
  en: {
    comments: "Comments",
    commentOn: "New comment",
    signIn: "Continue with Google",
    signInHint: "Sign in to comment. Your name will be shown publicly.",
    commentPlaceholder: "Write a comment",
    comment: "Comment",
    replyPlaceholder: "Write a reply",
    reply: "Reply",
    edit: "Edit",
    edited: "Edited",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    deleteConfirm: "Delete this comment?",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    noComments: "No comments yet. Choose a paragraph to start one.",
    error: "Something went wrong. Please try again.",
  },
  ko: {
    comments: "댓글",
    commentOn: "새 댓글",
    signIn: "Google 계정으로 계속",
    signInHint: "댓글을 쓰려면 로그인하세요. 이름은 공개됩니다.",
    commentPlaceholder: "댓글 작성",
    comment: "댓글 달기",
    replyPlaceholder: "답글 작성",
    reply: "답글 달기",
    edit: "수정",
    edited: "수정됨",
    save: "저장",
    cancel: "취소",
    delete: "삭제",
    deleteConfirm: "이 댓글을 삭제할까요?",
    signedInAs: "로그인",
    signOut: "로그아웃",
    noComments: "아직 댓글이 없습니다. 문단을 눌러 시작하세요.",
    error: "오류가 발생했습니다. 다시 시도하세요.",
  },
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function displayDate(value, language) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export class AnnotationPanel {
  constructor({ language, mount, fallbackFocus, onClose, onSignIn, onSignOut }) {
    this.language = language === "ko" ? "ko" : "en";
    this.copy = COPY[this.language];
    this.user = null;
    this.state = null;
    this.onClose = onClose;
    this.onSignIn = onSignIn;
    this.onSignOut = onSignOut;
    this.fallbackFocus = fallbackFocus;
    this.mount = mount || document.body;
    this.previousFocus = null;
    this.compactMedia = window.matchMedia("(max-width: 52rem)");

    this.backdrop = element("button", "annotation-backdrop");
    this.backdrop.type = "button";
    this.backdrop.tabIndex = -1;
    this.backdrop.setAttribute("aria-label", this.copy.comments);
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", () => this.close());

    this.panel = element("aside", "annotation-panel");
    this.panel.hidden = true;
    this.panel.tabIndex = -1;
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "false");
    this.panel.setAttribute("aria-labelledby", "annotation-panel-title");

    const header = element("header", "annotation-panel__header");
    this.header = header;
    this.title = element("h2", "annotation-panel__title", this.copy.comments);
    this.title.id = "annotation-panel-title";
    header.append(this.title);
    this.content = element("div", "annotation-panel__content");
    this.status = element("p", "annotation-panel__status");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.panel.append(header, this.content, this.status);
    document.body.append(this.backdrop);
    this.mount.append(this.panel);

    this.compactMedia.addEventListener("change", () => {
      this.panel.setAttribute("aria-modal", String(this.compactMedia.matches));
      this.alignTo(this.state?.anchorElement);
    });
    window.addEventListener("resize", () => this.alignTo(this.state?.anchorElement), {
      passive: true,
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.panel.hidden) this.close();
    });
  }

  setUser(user) {
    this.user = user;
    if (this.state) this.render();
  }

  openComments(threads, callbacks, {
    selectedId = "",
    draft = null,
    anchorElement = null,
  } = {}) {
    this.open({ threads, callbacks, selectedId, draft, anchorElement });
  }

  updateComments(threads) {
    if (!this.state) return;
    this.state = { ...this.state, threads };
    this.render();
  }

  select(annotationId) {
    if (!this.state) return;
    this.state.selectedId = annotationId || "";
    this.focusSelected();
  }

  finishDraft(annotationId = "") {
    if (!this.state) return;
    this.state = { ...this.state, draft: null, selectedId: annotationId };
    this.render({ preserveInput: false });
  }

  showError(message = this.copy.error) {
    this.status.textContent = message;
  }

  isOpen() {
    return !this.panel.hidden;
  }

  close() {
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    this.backdrop.hidden = true;
    document.body.classList.remove("annotation-panel-open");
    this.state = null;
    this.panel.style.removeProperty("--annotation-panel-offset");
    this.status.textContent = "";
    this.onClose?.();
    const target = this.previousFocus?.isConnected && !this.previousFocus.hidden
      ? this.previousFocus
      : this.fallbackFocus;
    target?.focus?.({ preventScroll: true });
  }

  open(state) {
    if (this.panel.hidden) this.previousFocus = document.activeElement;
    this.state = state;
    this.panel.hidden = false;
    this.backdrop.hidden = false;
    this.panel.setAttribute("aria-modal", String(this.compactMedia.matches));
    document.body.classList.add("annotation-panel-open");
    this.render({ preserveInput: false });
    this.alignTo(state.anchorElement);
    requestAnimationFrame(() => {
      this.focusSelected();
      if (this.compactMedia.matches && !state.draft) this.panel.focus({ preventScroll: true });
    });
  }

  alignTo(anchorElement) {
    if (!anchorElement || this.compactMedia.matches) {
      this.panel.style.removeProperty("--annotation-panel-offset");
      return;
    }
    const anchorTop = anchorElement.getBoundingClientRect().top;
    const mountTop = this.mount.getBoundingClientRect().top;
    const headerHeight = this.header.getBoundingClientRect().height;
    const offset = Math.max(0, anchorTop - mountTop - headerHeight);
    this.panel.style.setProperty("--annotation-panel-offset", `${Math.round(offset)}px`);
  }

  focusSelected() {
    if (!this.state) return;
    const selectedId = this.state.selectedId;
    this.panel.querySelectorAll(".annotation-thread").forEach((thread) => {
      thread.classList.toggle("is-selected", Boolean(selectedId) && thread.dataset.annotationId === selectedId);
    });
    const target = this.state.draft
      ? this.panel.querySelector("[data-autofocus]")
      : [...this.panel.querySelectorAll(".annotation-thread")]
        .find((thread) => thread.dataset.annotationId === selectedId);
    target?.scrollIntoView?.({ block: "nearest" });
    if (this.state.draft) target?.focus?.({ preventScroll: true });
  }

  render({ preserveInput = true } = {}) {
    if (!this.state) return;
    const previousScrollTop = this.panel.scrollTop;
    const previousInputs = preserveInput
      ? [...this.content.querySelectorAll(".annotation-form__input")].map((input) => ({
        key: input.dataset.formKey,
        value: input.value,
        focused: document.activeElement === input,
      }))
      : [];
    const fragments = [];

    if (this.state.draft) fragments.push(this.draftThread(this.state.draft));
    if (!this.state.threads.length && !this.state.draft) {
      fragments.push(element("p", "annotation-overview__empty", this.copy.noComments));
    } else {
      const list = element("div", "annotation-overview");
      this.state.threads.forEach((thread) => list.append(this.thread(thread)));
      fragments.push(list);
    }

    if (!this.user) fragments.push(this.signInBlock());
    else fragments.push(this.account());
    this.content.replaceChildren(...fragments);
    this.panel.scrollTop = previousScrollTop;
    this.status.textContent = "";

    previousInputs.forEach(({ key, value, focused }) => {
      if (!key) return;
      const next = [...this.content.querySelectorAll(".annotation-form__input")]
        .find((input) => input.dataset.formKey === key);
      if (!next) return;
      next.value = value;
      if (focused) requestAnimationFrame(() => next.focus({ preventScroll: true }));
    });
    requestAnimationFrame(() => this.focusSelected());
  }

  draftThread(draft) {
    const card = element("section", "annotation-thread annotation-thread--draft is-selected");
    const label = element("p", "annotation-thread__quote", draft.anchor.quote);
    card.append(label);
    if (this.user) {
      card.append(this.form(
        this.copy.commentPlaceholder,
        this.copy.comment,
        async (body) => {
          const annotationId = await this.state.callbacks.onSubmitDraft(body, draft);
          this.finishDraft(annotationId);
        },
        { autofocus: true, cancellable: true, onCancel: () => this.state.callbacks.onCancelDraft() },
      ));
    }
    return card;
  }

  thread({ annotation, replies = [] }) {
    const card = element("section", "annotation-thread");
    card.dataset.annotationId = annotation.id;
    card.setAttribute("aria-label", `${this.copy.comments}: ${annotation.quote}`);
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, textarea, select, form")) return;
      this.state.callbacks.onSelect(annotation);
    });
    card.append(this.comment(annotation, true, annotation));

    const replyList = element("div", "annotation-replies");
    replyList.setAttribute("aria-label", this.language === "ko" ? "답글" : "Replies");
    replies.forEach((reply) => replyList.append(this.comment(reply, false, annotation)));
    card.append(replyList);

    if (this.user) {
      card.append(this.form(
        this.copy.replyPlaceholder,
        this.copy.reply,
        (body) => this.state.callbacks.onReply(annotation, body),
        { compact: true, formKey: `reply:${annotation.id}` },
      ));
    }

    return card;
  }

  comment(item, root, annotation) {
    const article = element("article", `annotation-comment${root ? " annotation-comment--root" : ""}`);
    const meta = element("p", "annotation-comment__meta");
    meta.append(
      element("strong", "", item.authorName || "Reader"),
      document.createTextNode(` · ${displayDate(item.createdAt, this.language)}`),
    );
    const body = element("p", "annotation-comment__body", item.body);
    article.append(meta, body);

    const actions = element("div", "annotation-comment__actions");
    if (item.editCount > 0) actions.append(element("span", "annotation-comment__edited", this.copy.edited));
    if (this.user && this.user.uid === item.authorId) {
      const edit = element("button", "annotation-text-action", this.copy.edit);
      edit.type = "button";
      edit.addEventListener("click", () => this.beginEdit(article, body, actions, annotation, item, root, edit));
      actions.append(edit);
    }
    if (this.user?.isOwner) {
      const remove = element("button", "annotation-text-action", this.copy.delete);
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm(this.copy.deleteConfirm)) return;
        remove.disabled = true;
        try {
          await this.state.callbacks.onDelete(annotation, item, root);
        } catch {
          this.showError();
          remove.disabled = false;
        }
      });
      actions.append(remove);
    }
    if (actions.childElementCount) article.append(actions);
    return article;
  }

  beginEdit(article, body, actions, annotation, item, root, returnFocus) {
    if (article.querySelector(".annotation-edit-form")) return;
    const form = element("form", "annotation-edit-form");
    const label = element("label", "visually-hidden", this.copy.edit);
    const textarea = element("textarea", "annotation-form__input annotation-edit-form__input");
    const id = `annotation-edit-${Math.random().toString(36).slice(2)}`;
    label.htmlFor = id;
    textarea.id = id;
    textarea.value = item.body;
    textarea.maxLength = 2000;
    textarea.required = true;
    textarea.rows = 3;
    const controls = element("div", "annotation-edit-form__actions");
    const cancel = element("button", "annotation-text-action", this.copy.cancel);
    cancel.type = "button";
    const save = element("button", "annotation-edit-form__save", this.copy.save);
    save.type = "submit";
    controls.append(cancel, save);
    form.append(label, textarea, controls);

    const finish = () => {
      form.remove();
      body.hidden = false;
      actions.hidden = false;
      returnFocus.focus({ preventScroll: true });
    };
    cancel.addEventListener("click", finish);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = textarea.value.trim();
      if (!value || value.length > 2000) return;
      if (value === item.body) return finish();
      save.disabled = true;
      try {
        await this.state.callbacks.onEdit(annotation, item, root, value);
        finish();
      } catch {
        this.showError();
        save.disabled = false;
      }
    });
    body.hidden = true;
    actions.hidden = true;
    article.append(form);
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  form(placeholder, submitLabel, submit, {
    autofocus = false,
    compact = false,
    cancellable = false,
    onCancel = null,
    formKey = "draft",
  } = {}) {
    const form = element(
      "form",
      `annotation-form${compact ? " annotation-form--compact" : ""}${cancellable ? " annotation-form--cancellable" : ""}`,
    );
    const label = element("label", "visually-hidden", placeholder);
    const textarea = element("textarea", "annotation-form__input");
    const id = `annotation-input-${Math.random().toString(36).slice(2)}`;
    label.htmlFor = id;
    textarea.id = id;
    textarea.name = "comment";
    textarea.placeholder = placeholder;
    textarea.maxLength = 2000;
    textarea.required = true;
    textarea.rows = compact ? 1 : 3;
    textarea.dataset.formKey = formKey;
    if (autofocus) textarea.dataset.autofocus = "";
    const button = element("button", "annotation-form__submit", submitLabel);
    button.type = "submit";

    const controls = element("div", "annotation-form__actions");
    const cancel = element("button", "annotation-text-action", this.copy.cancel);
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      if (onCancel) return onCancel();
      textarea.value = "";
      form.classList.remove("is-expanded");
      textarea.blur();
    });
    controls.append(cancel, button);
    if (compact) textarea.addEventListener("focus", () => form.classList.add("is-expanded"));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = textarea.value.trim();
      if (!value || value.length > 2000) return;
      button.disabled = true;
      try {
        await submit(value);
        textarea.value = "";
        form.classList.remove("is-expanded");
      } catch {
        this.showError();
      } finally {
        button.disabled = false;
      }
    });
    form.append(label, textarea, controls);
    return form;
  }

  signInBlock() {
    const block = element("div", "annotation-sign-in");
    block.append(element("p", "", this.copy.signInHint));
    const button = element("button", "annotation-primary-action", this.copy.signIn);
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await this.onSignIn();
      } catch {
        this.showError();
      } finally {
        button.disabled = false;
      }
    });
    block.append(button);
    return block;
  }

  account() {
    const account = element("div", "annotation-account");
    account.append(document.createTextNode(`${this.copy.signedInAs} ${this.user.displayName}`));
    const signOut = element("button", "annotation-text-action", this.copy.signOut);
    signOut.type = "button";
    signOut.addEventListener("click", () => this.onSignOut());
    account.append(signOut);
    return account;
  }
}
