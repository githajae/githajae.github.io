const COPY = {
  en: {
    comments: "Comments",
    back: "All comments",
    close: "Close comments",
    commentOn: "Comment on",
    discussion: "Comment",
    signIn: "Continue with Google",
    signInHint: "Sign in to comment. Your name will be shown publicly.",
    commentPlaceholder: "Write a comment",
    comment: "Comment",
    replyPlaceholder: "Write a reply",
    reply: "Reply",
    resolve: "Resolve",
    reopen: "Reopen",
    resolved: "Resolved",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    empty: "No replies yet.",
    noComments: "No comments yet. Select text to start one.",
    error: "Something went wrong. Please try again.",
  },
  ko: {
    comments: "댓글",
    back: "모든 댓글",
    close: "댓글 닫기",
    commentOn: "이 문장에 댓글",
    discussion: "댓글",
    signIn: "Google 계정으로 계속",
    signInHint: "댓글을 쓰려면 로그인하세요. 이름은 공개됩니다.",
    commentPlaceholder: "댓글 작성",
    comment: "댓글 달기",
    replyPlaceholder: "답글 작성",
    reply: "답글 달기",
    resolve: "해결",
    reopen: "다시 열기",
    resolved: "해결됨",
    signedInAs: "로그인",
    signOut: "로그아웃",
    empty: "아직 답글이 없습니다.",
    noComments: "아직 댓글이 없습니다. 문장을 선택해 시작하세요.",
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
    this.previousFocus = null;

    this.backdrop = element("button", "annotation-backdrop");
    this.backdrop.type = "button";
    this.backdrop.tabIndex = -1;
    this.backdrop.setAttribute("aria-label", this.copy.close);
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", () => this.close());

    this.panel = element("aside", "annotation-panel");
    this.panel.hidden = true;
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "false");
    this.panel.setAttribute("aria-labelledby", "annotation-panel-title");

    const header = element("header", "annotation-panel__header");
    this.backButton = element("button", "annotation-panel__back", "‹");
    this.backButton.type = "button";
    this.backButton.hidden = true;
    this.backButton.setAttribute("aria-label", this.copy.back);
    this.backButton.addEventListener("click", () => this.state?.onBack?.());
    this.title = element("h2", "annotation-panel__title");
    this.title.id = "annotation-panel-title";
    this.closeButton = element("button", "annotation-panel__close", "×");
    this.closeButton.type = "button";
    this.closeButton.setAttribute("aria-label", this.copy.close);
    this.closeButton.addEventListener("click", () => this.close());
    header.append(this.backButton, this.title, this.closeButton);

    this.quote = element("blockquote", "annotation-panel__quote");
    this.content = element("div", "annotation-panel__content");
    this.status = element("p", "annotation-panel__status");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.panel.append(header, this.quote, this.content, this.status);
    document.body.append(this.backdrop);
    (mount || document.body).append(this.panel);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.panel.hidden) this.close();
    });
  }

  setUser(user) {
    this.user = user;
    if (this.state) this.render({ focusInput: Boolean(user), preserveInput: false });
  }

  openDraft(anchor, onSubmit) {
    this.open({ type: "draft", anchor, onSubmit });
  }

  openOverview(annotations, onOpen) {
    this.open({ type: "overview", annotations, onOpen });
  }

  updateOverview(annotations) {
    if (this.state?.type !== "overview") return;
    this.state = { ...this.state, annotations };
    this.render();
  }

  openThread(annotation, replies, { onReply, onResolve, onBack }) {
    this.open({ type: "thread", annotation, replies, onReply, onResolve, onBack });
  }

  updateThread(annotation, replies) {
    if (this.state?.type !== "thread" || this.state.annotation.id !== annotation.id) return;
    this.state = { ...this.state, annotation, replies };
    this.render();
  }

  showError(message = this.copy.error) {
    this.status.textContent = message;
  }

  close() {
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    this.backdrop.hidden = true;
    document.body.classList.remove("annotation-panel-open");
    this.state = null;
    this.status.textContent = "";
    this.onClose?.();
    const returnTarget = this.previousFocus?.isConnected && !this.previousFocus.hidden
      ? this.previousFocus
      : this.fallbackFocus;
    returnTarget?.focus?.();
  }

  open(state) {
    if (this.panel.hidden) this.previousFocus = document.activeElement;
    this.state = state;
    this.panel.hidden = false;
    this.backdrop.hidden = false;
    this.panel.setAttribute("aria-modal", String(window.matchMedia("(max-width: 52rem)").matches));
    document.body.classList.add("annotation-panel-open");
    this.render({ preserveInput: false });
    requestAnimationFrame(() => (
      this.panel.querySelector("[data-autofocus]") || this.closeButton
    ).focus());
  }

  render({ focusInput = false, preserveInput = true } = {}) {
    if (!this.state) return;
    const previousInput = this.content.querySelector(".annotation-form__input");
    const previousValue = preserveInput ? previousInput?.value || "" : "";
    const inputHadFocus = document.activeElement === previousInput;
    const isOverview = this.state.type === "overview";
    const isDraft = this.state.type === "draft";
    const annotation = this.state.type === "thread" ? this.state.annotation : null;
    this.title.textContent = isOverview
      ? this.copy.comments
      : isDraft ? this.copy.commentOn : this.copy.discussion;
    this.backButton.hidden = this.state.type !== "thread" || !this.state.onBack;
    this.quote.hidden = isOverview;
    this.quote.textContent = isDraft ? this.state.anchor.quote : annotation?.quote || "";
    this.status.textContent = "";

    const fragments = [];
    if (isOverview) {
      fragments.push(this.overview(this.state.annotations, this.state.onOpen));
    } else if (!isDraft) {
      fragments.push(this.comment(annotation, true));
      const replies = element("div", "annotation-replies");
      replies.setAttribute("aria-label", this.language === "ko" ? "답글" : "Replies");
      this.state.replies.forEach((reply) => replies.append(this.comment(reply, false)));
      fragments.push(replies);

      if (annotation.resolved) {
        fragments.push(element("p", "annotation-resolved", this.copy.resolved));
      }
    }

    if (!isOverview && this.user) {
      if (isDraft) {
        fragments.push(this.form(this.copy.commentPlaceholder, this.copy.comment, this.state.onSubmit));
      } else if (!annotation.resolved) {
        fragments.push(this.form(this.copy.replyPlaceholder, this.copy.reply, this.state.onReply));
      }
      fragments.push(this.account(annotation));
    } else if (!isOverview) {
      fragments.push(this.signInBlock());
    }

    this.content.replaceChildren(...fragments);
    const nextInput = this.content.querySelector(".annotation-form__input");
    if (nextInput && previousValue) nextInput.value = previousValue;
    if (nextInput && (focusInput || inputHadFocus)) requestAnimationFrame(() => nextInput.focus());
  }

  overview(annotations, onOpen) {
    if (!annotations.length) {
      return element("p", "annotation-overview__empty", this.copy.noComments);
    }

    const list = element("div", "annotation-overview");
    annotations.forEach((annotation) => {
      const item = element("button", "annotation-overview__item");
      item.type = "button";
      const quote = element("span", "annotation-overview__quote", annotation.quote);
      const meta = element(
        "span",
        "annotation-overview__meta",
        `${annotation.authorName || "Reader"} · ${displayDate(annotation.createdAt, this.language)}`,
      );
      const body = element("span", "annotation-overview__body", annotation.body);
      item.append(quote, meta, body);
      item.addEventListener("click", () => onOpen(annotation));
      list.append(item);
    });
    return list;
  }

  comment(item, root) {
    const article = element("article", `annotation-comment${root ? " annotation-comment--root" : ""}`);
    const meta = element("p", "annotation-comment__meta");
    meta.append(
      element("strong", "", item.authorName || "Reader"),
      document.createTextNode(` · ${displayDate(item.createdAt, this.language)}`),
    );
    const body = element("p", "annotation-comment__body", item.body);
    article.append(meta, body);
    return article;
  }

  form(placeholder, submitLabel, submit) {
    const form = element("form", "annotation-form");
    const label = element("label", "visually-hidden", placeholder);
    const textarea = element("textarea", "annotation-form__input");
    const id = `annotation-input-${Math.random().toString(36).slice(2)}`;
    label.htmlFor = id;
    textarea.id = id;
    textarea.name = "comment";
    textarea.placeholder = placeholder;
    textarea.maxLength = 2000;
    textarea.required = true;
    textarea.rows = 3;
    textarea.dataset.autofocus = "";
    const button = element("button", "annotation-form__submit", submitLabel);
    button.type = "submit";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = textarea.value.trim();
      if (!value || value.length > 2000) return;
      button.disabled = true;
      try {
        await submit(value);
        this.render({ focusInput: true, preserveInput: false });
      } catch {
        this.showError();
      } finally {
        button.disabled = false;
      }
    });

    form.append(label, textarea, button);
    return form;
  }

  signInBlock() {
    const block = element("div", "annotation-sign-in");
    block.append(element("p", "", this.copy.signInHint));
    const button = element("button", "annotation-primary-action", this.copy.signIn);
    button.type = "button";
    button.dataset.autofocus = "";
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

  account(annotation) {
    const account = element("div", "annotation-account");
    account.append(document.createTextNode(`${this.copy.signedInAs} ${this.user.displayName}`));

    if (annotation && this.user.isOwner) {
      const resolve = element(
        "button",
        "annotation-text-action",
        annotation.resolved ? this.copy.reopen : this.copy.resolve,
      );
      resolve.type = "button";
      resolve.addEventListener("click", () => this.state.onResolve(!annotation.resolved));
      account.append(resolve);
    }

    const signOut = element("button", "annotation-text-action", this.copy.signOut);
    signOut.type = "button";
    signOut.addEventListener("click", () => this.onSignOut());
    account.append(signOut);
    return account;
  }
}
