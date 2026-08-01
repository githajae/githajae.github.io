const COPY = {
  en: {
    comments: "Comments",
    signIn: "Sign in",
    signInAria: "Sign in with Google",
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
    signOut: "Sign out",
    error: "Something went wrong. Please try again.",
    unavailable: "Comments are unavailable.",
    legacyQuote: "Commented on",
  },
  ko: {
    comments: "댓글",
    signIn: "로그인",
    signInAria: "Google 계정으로 로그인",
    commentPlaceholder: "댓글 작성",
    comment: "댓글 달기",
    replyPlaceholder: "답글 작성",
    reply: "답글",
    edit: "수정",
    edited: "수정됨",
    save: "저장",
    cancel: "취소",
    delete: "삭제",
    deleteConfirm: "이 댓글을 삭제할까요?",
    signOut: "로그아웃",
    error: "오류가 발생했습니다. 다시 시도하세요.",
    unavailable: "댓글을 불러올 수 없습니다.",
    legacyQuote: "이 문단에 남긴 댓글",
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

export class CommentSection {
  constructor({ language, mount, guide }) {
    this.language = language === "ko" ? "ko" : "en";
    this.copy = COPY[this.language];
    this.mount = mount;
    this.guide = guide;
    this.user = null;
    this.threads = [];
    this.callbacks = {};
    this.selectedId = "";
    this.expandedReplies = new Set();

    this.header = element("header", "comments-section__header");
    this.title = element("h2", "comments-section__title", this.copy.comments);
    this.count = element("span", "comments-section__count");
    this.title.append(this.count);
    this.session = element("div", "comments-session");
    this.header.append(this.title, this.session);
    this.content = element("div", "comments-section__content");
    this.status = element("p", "comments-section__status");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.mount.replaceChildren(this.header, this.content, this.status);
    this.mount.hidden = false;
    this.guide?.addEventListener("click", (event) => {
      event.preventDefault();
      this.reveal("", { scroll: true, focusComposer: true });
    });
    if (this.guide) this.guide.hidden = false;
    this.render();
  }

  setUser(user) {
    this.user = user;
    this.render();
  }

  updateComments(threads, callbacks = this.callbacks) {
    this.threads = threads;
    this.callbacks = callbacks;
    this.render();
  }

  totalCount() {
    return this.threads.reduce((total, thread) => total + 1 + thread.replies.length, 0);
  }

  updateCount() {
    const count = this.totalCount();
    this.count.textContent = count ? ` ${count}` : "";
    const guideCount = this.guide?.querySelector("[data-comment-count]");
    if (guideCount) guideCount.textContent = count ? String(count) : "";
    this.guide?.setAttribute("aria-label", count
      ? `${this.copy.comments} ${count}`
      : this.copy.comments);
  }

  setUnavailable() {
    this.status.textContent = this.copy.unavailable;
    if (this.guide) {
      this.guide.hidden = true;
      this.guide.setAttribute("aria-disabled", "true");
    }
  }

  showError(message = this.copy.error) {
    this.status.textContent = message;
  }

  reveal(annotationId = "", { scroll = false, focusComposer = false } = {}) {
    this.selectedId = annotationId;
    this.render();
    requestAnimationFrame(() => {
      const target = annotationId
        ? this.mount.querySelector(`[data-comment-id="${CSS.escape(annotationId)}"]`)
        : this.mount;
      if (scroll) {
        target?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: annotationId ? "center" : "start",
        });
      }
      if (focusComposer) {
        window.setTimeout(() => {
          const focusTarget = this.user
            ? this.mount.querySelector('[data-form-key="new-comment"]')
            : this.mount.querySelector("[data-comment-sign-in]");
          focusTarget?.focus({ preventScroll: true });
        }, scroll ? 350 : 0);
      }
    });
  }

  render({ preserveInput = true } = {}) {
    const previousInputs = preserveInput
      ? [...this.content.querySelectorAll(".comment-form__input")].map((input) => ({
        key: input.dataset.formKey,
        value: input.value,
        focused: document.activeElement === input,
      }))
      : [];
    const fragments = [];

    if (this.user) fragments.push(this.newCommentForm());

    if (this.threads.length) {
      const list = element("div", "comments-list");
      list.setAttribute("role", "list");
      this.threads.forEach((thread) => list.append(this.thread(thread)));
      fragments.push(list);
    }

    this.content.replaceChildren(...fragments);
    this.status.textContent = "";
    this.renderSession();
    this.updateCount();

    previousInputs.forEach(({ key, value, focused }) => {
      if (!key) return;
      const next = [...this.content.querySelectorAll(".comment-form__input")]
        .find((input) => input.dataset.formKey === key);
      if (!next) return;
      next.value = value;
      if (focused) requestAnimationFrame(() => next.focus({ preventScroll: true }));
    });
  }

  newCommentForm() {
    return this.form(
      this.copy.commentPlaceholder,
      this.copy.comment,
      async (body) => {
        const id = await this.callbacks.onSubmitComment(body);
        this.selectedId = id;
      },
      { formKey: "new-comment", rows: 3 },
    );
  }

  thread({ annotation, replies = [] }) {
    const section = element("section", "comment-thread");
    section.dataset.commentId = annotation.id;
    section.setAttribute("role", "listitem");
    section.classList.toggle("is-selected", annotation.id === this.selectedId);
    if (annotation.scope !== "article" && annotation.quote) {
      const quote = element("blockquote", "comment-thread__quote", annotation.quote);
      quote.setAttribute("aria-label", this.copy.legacyQuote);
      section.append(quote);
    }

    section.append(this.comment(annotation, true, annotation, () => {
      this.expandedReplies.add(annotation.id);
      this.render();
      requestAnimationFrame(() => {
        this.mount.querySelector(`[data-form-key="reply:${CSS.escape(annotation.id)}"]`)
          ?.focus({ preventScroll: true });
      });
    }));

    if (replies.length) {
      const list = element("div", "comment-replies");
      list.setAttribute("aria-label", this.language === "ko" ? "답글" : "Replies");
      replies.forEach((reply) => list.append(this.comment(reply, false, annotation)));
      section.append(list);
    }

    if (this.user && this.expandedReplies.has(annotation.id)) {
      section.append(this.form(
        this.copy.replyPlaceholder,
        this.copy.reply,
        async (body) => {
          await this.callbacks.onReply(annotation, body);
          this.expandedReplies.delete(annotation.id);
        },
        {
          compact: true,
          formKey: `reply:${annotation.id}`,
          onCancel: () => {
            this.expandedReplies.delete(annotation.id);
            this.render({ preserveInput: false });
          },
        },
      ));
    }
    return section;
  }

  comment(item, root, annotation, onReply = null) {
    const article = element("article", `comment${root ? " comment--root" : ""}`);
    const meta = element("p", "comment__meta");
    meta.append(
      element("strong", "", item.authorName || "Reader"),
      document.createTextNode(` · ${displayDate(item.createdAt, this.language)}`),
    );
    const body = element("p", "comment__body", item.body);
    article.append(meta, body);

    const actions = element("div", "comment__actions");
    if (item.editCount > 0) actions.append(element("span", "comment__edited", this.copy.edited));
    if (root && this.user && onReply) {
      const reply = element("button", "comment-text-action", this.copy.reply);
      reply.type = "button";
      reply.addEventListener("click", onReply);
      actions.append(reply);
    }
    if (this.user && this.user.uid === item.authorId) {
      const edit = element("button", "comment-text-action", this.copy.edit);
      edit.type = "button";
      edit.addEventListener("click", () => this.beginEdit(article, body, actions, annotation, item, root, edit));
      actions.append(edit);
    }
    if (this.user?.isOwner) {
      const remove = element("button", "comment-text-action", this.copy.delete);
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm(this.copy.deleteConfirm)) return;
        remove.disabled = true;
        try {
          await this.callbacks.onDelete(annotation, item, root);
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
    if (article.querySelector(".comment-edit-form")) return;
    const form = element("form", "comment-edit-form");
    const label = element("label", "visually-hidden", this.copy.edit);
    const textarea = element("textarea", "comment-form__input comment-edit-form__input");
    const id = `comment-edit-${Math.random().toString(36).slice(2)}`;
    label.htmlFor = id;
    textarea.id = id;
    textarea.value = item.body;
    textarea.maxLength = 2000;
    textarea.required = true;
    textarea.rows = 3;
    const controls = element("div", "comment-form__actions");
    const cancel = element("button", "comment-text-action", this.copy.cancel);
    cancel.type = "button";
    const save = element("button", "comment-form__submit", this.copy.save);
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
        await this.callbacks.onEdit(annotation, item, root, value);
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
    compact = false,
    formKey = "comment",
    rows = 2,
    onCancel = null,
  } = {}) {
    const form = element("form", `comment-form${compact ? " comment-form--reply" : ""}`);
    const label = element("label", "visually-hidden", placeholder);
    const textarea = element("textarea", "comment-form__input");
    const id = `comment-input-${Math.random().toString(36).slice(2)}`;
    label.htmlFor = id;
    textarea.id = id;
    textarea.name = "comment";
    textarea.placeholder = placeholder;
    textarea.maxLength = 2000;
    textarea.required = true;
    textarea.rows = rows;
    textarea.dataset.formKey = formKey;
    const controls = element("div", "comment-form__actions");
    if (onCancel) {
      const cancel = element("button", "comment-text-action", this.copy.cancel);
      cancel.type = "button";
      cancel.addEventListener("click", onCancel);
      controls.append(cancel);
    }
    const button = element("button", "comment-form__submit", submitLabel);
    button.type = "submit";
    controls.append(button);
    form.append(label, textarea, controls);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = textarea.value.trim();
      if (!value || value.length > 2000) return;
      button.disabled = true;
      try {
        await submit(value);
        textarea.value = "";
      } catch {
        this.showError();
      } finally {
        button.disabled = false;
      }
    });
    return form;
  }

  renderSession() {
    this.session.replaceChildren();
    if (this.user) {
      this.session.append(element("span", "comments-session__user", this.user.displayName));
      const signOut = element("button", "comment-text-action comments-session__action", this.copy.signOut);
      signOut.type = "button";
      signOut.addEventListener("click", () => this.callbacks.onSignOut?.());
      this.session.append(signOut);
      return;
    }

    const signIn = element("button", "comment-text-action comments-session__action", this.copy.signIn);
    signIn.type = "button";
    signIn.dataset.commentSignIn = "";
    signIn.setAttribute("aria-label", this.copy.signInAria);
    signIn.addEventListener("click", async () => {
      signIn.disabled = true;
      try {
        await this.callbacks.onSignIn?.();
      } catch {
        this.showError();
      } finally {
        signIn.disabled = false;
      }
    });
    this.session.append(signIn);
  }
}
