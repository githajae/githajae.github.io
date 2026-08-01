import { captureSelection, rangeForAnchor, selectionRect } from "./anchors.js";
import { AnnotationPanel } from "./panel.js";
import { AnnotationView } from "./view.js";

const root = document.querySelector("[data-annotation-root]");
const prose = root?.querySelector(".prose");
const configNode = document.querySelector("#annotation-config");

function readConfig() {
  try {
    return JSON.parse(configNode?.textContent || "{}");
  } catch {
    return {};
  }
}

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "projectId", "appId"]
    .every((key) => typeof config?.[key] === "string" && config[key].trim());
}

function isLocalPreview() {
  const local = ["127.0.0.1", "localhost"].includes(window.location.hostname);
  return local && new URLSearchParams(window.location.search).get("annotations") === "preview";
}

async function createStore(settings, context) {
  if (isLocalPreview()) {
    const { createDemoStore } = await import("./demo-store.js");
    return createDemoStore(context);
  }

  if (!settings.enabled || !hasFirebaseConfig(settings.firebase)) return null;
  const { createFirebaseStore } = await import("./firebase-store.js");
  return createFirebaseStore({ ...context, config: settings.firebase });
}

if (root && prose && configNode) {
  const settings = readConfig();
  const language = root.dataset.annotationLanguage === "ko" ? "ko" : "en";
  const context = {
    articleId: root.dataset.annotationId,
    revision: root.dataset.annotationRevision,
    language,
    ownerEmails: (settings.ownerEmails || []).map((email) => email.toLowerCase()),
  };

  const store = await createStore(settings, context);
  if (store) {
    const view = new AnnotationView({
      language,
      footer: root.querySelector(".note-page__footer"),
    });
    let annotations = [];
    let activeId = null;
    let activeReplies = [];
    let unsubscribeReplies = null;

    const highlightsSupported = Boolean(window.Highlight && window.CSS?.highlights);
    const annotationHighlights = highlightsSupported ? new Highlight() : null;
    const activeHighlight = highlightsSupported ? new Highlight() : null;
    if (highlightsSupported) {
      CSS.highlights.set("note-annotations", annotationHighlights);
      CSS.highlights.set("note-annotation-active", activeHighlight);
    }

    const panel = new AnnotationPanel({
      language,
      fallbackFocus: view.guide,
      onClose() {
        activeId = null;
        activeHighlight?.clear();
        unsubscribeReplies?.();
        unsubscribeReplies = null;
      },
      onSignIn: () => store.signIn(),
      onSignOut: () => store.signOut(),
    });

    function anchoredItems() {
      annotationHighlights?.clear();
      return annotations.map((annotation) => {
        const range = rangeForAnchor(prose, annotation);
        if (range && !annotation.resolved) annotationHighlights?.add(range);
        return { annotation, range };
      });
    }

    function renderAnnotations() {
      const items = anchoredItems();
      view.renderMarkers(items, openThread);

      if (activeId) {
        const active = annotations.find(({ id }) => id === activeId);
        const range = items.find(({ annotation }) => annotation.id === activeId)?.range;
        activeHighlight?.clear();
        if (range) activeHighlight?.add(range);
        if (active) panel.updateThread(active, activeReplies);
      }
    }

    function openThread(annotation) {
      activeId = annotation.id;
      activeReplies = [];
      unsubscribeReplies?.();
      panel.openThread(annotation, activeReplies, {
        onReply: (body) => store.addReply(annotation.id, body),
        onResolve: (resolved) => store.setResolved(annotation.id, resolved),
      });

      const range = rangeForAnchor(prose, annotation);
      activeHighlight?.clear();
      if (range) activeHighlight?.add(range);

      unsubscribeReplies = store.subscribeReplies(
        annotation.id,
        (replies) => {
          activeReplies = replies;
          const latest = annotations.find(({ id }) => id === annotation.id) || annotation;
          panel.updateThread(latest, replies);
        },
        () => panel.showError(),
      );
    }

    function openDraft(anchor) {
      window.getSelection()?.removeAllRanges();
      view.hideSelection();
      panel.openDraft(anchor, async (body) => {
        await store.addAnnotation(anchor, body);
        panel.close();
      });
    }

    function inspectSelection() {
      const anchor = captureSelection(prose);
      const rect = anchor ? selectionRect() : null;
      if (!anchor || !rect) {
        view.hideSelection();
        return;
      }
      view.showSelection(rect, () => openDraft(anchor));
    }

    let selectionTimer;
    document.addEventListener("selectionchange", () => {
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(inspectSelection, 80);
    });

    view.onGuide = () => {
      const first = annotations.find(({ resolved }) => !resolved) || annotations[0];
      if (first) {
        openThread(first);
        return;
      }
      const original = view.guide.textContent;
      view.guide.textContent = language === "ko" ? "문장을 선택하세요" : "Select text";
      window.setTimeout(() => { view.guide.textContent = original; }, 1800);
    };

    store.onAuthStateChange((user) => panel.setUser(user));
    store.subscribeAnnotations(
      (items) => {
        annotations = items;
        renderAnnotations();
      },
      () => {
        view.guide.textContent = language === "ko" ? "댓글 사용 불가" : "Comments unavailable";
        view.guide.disabled = true;
      },
    );
  }
}
