import { captureSelection, rangeForAnchor, selectionRect } from "./anchors.js";
import { AnnotationPanel } from "./panel.js";
import { AnnotationView } from "./view.js";

const root = document.querySelector("[data-annotation-root]");
const prose = root?.querySelector(".prose");
const configNode = document.querySelector("#annotation-config");
const annotationRail = document.querySelector("[data-annotation-rail]");
const annotationIndex = document.querySelector("[data-annotation-index]");

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
  return createFirebaseStore({
    ...context,
    config: settings.firebase,
    notificationEndpoint: settings.notificationEndpoint || "",
  });
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

  // Keep authentication and Firestore off the critical rendering path. Two
  // frames let the article heading paint before Firebase is downloaded and
  // evaluated on slower mobile connections.
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  const store = await createStore(settings, context);
  if (store) {
    const view = new AnnotationView({
      language,
      guide: annotationIndex,
      content: prose,
    });
    let annotations = [];
    let activeId = null;
    const repliesByAnnotation = new Map();
    const loadingReplies = new Map();
    let replyHydrationRun = 0;
    let replyRenderFrame = 0;
    const linkedCommentId = new URLSearchParams(window.location.search).get("comment");
    let linkedCommentOpened = false;

    const highlightsSupported = Boolean(window.Highlight && window.CSS?.highlights);
    const annotationHighlights = highlightsSupported ? new Highlight() : null;
    const hoverHighlight = highlightsSupported ? new Highlight() : null;
    const openHighlights = highlightsSupported ? new Highlight() : null;
    const activeHighlight = highlightsSupported ? new Highlight() : null;
    if (highlightsSupported) {
      CSS.highlights.set("note-annotations", annotationHighlights);
      CSS.highlights.set("note-annotation-hover", hoverHighlight);
      CSS.highlights.set("note-annotations-open", openHighlights);
      CSS.highlights.set("note-annotation-active", activeHighlight);
    }

    const panel = new AnnotationPanel({
      language,
      mount: annotationRail,
      fallbackFocus: view.guide,
      onClose() {
        activeId = null;
        hoverHighlight?.clear();
        openHighlights?.clear();
        activeHighlight?.clear();
        requestAnimationFrame(() => view.positionMarkers());
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
      view.renderMarkers(items, (annotation) => openComments(annotation.id));
      view.updateCount(annotations.length);
      panel.updateComments(threadData());

      openHighlights?.clear();
      activeHighlight?.clear();
      if (panel.isOpen()) {
        items.forEach(({ annotation, range }) => {
          if (range && !annotation.resolved) openHighlights?.add(range);
        });
        const range = items.find(({ annotation }) => annotation.id === activeId)?.range;
        if (range) activeHighlight?.add(range);
      }
    }

    function threadData() {
      return [...annotations]
        .sort((a, b) => (a.start - b.start) || (a.createdAt - b.createdAt))
        .map((annotation) => ({
          annotation,
          replies: repliesByAnnotation.get(annotation.id) || [],
        }));
    }

    function schedulePanelUpdate() {
      if (replyRenderFrame) return;
      replyRenderFrame = window.requestAnimationFrame(() => {
        replyRenderFrame = 0;
        if (panel.isOpen()) panel.updateComments(threadData());
      });
    }

    async function loadReplies(annotationId, { refresh = false } = {}) {
      if (!refresh && repliesByAnnotation.has(annotationId)) {
        return repliesByAnnotation.get(annotationId);
      }
      if (!refresh && loadingReplies.has(annotationId)) return loadingReplies.get(annotationId);
      const request = store.loadReplies(annotationId)
        .then((replies) => {
          repliesByAnnotation.set(annotationId, replies);
          loadingReplies.delete(annotationId);
          schedulePanelUpdate();
          return replies;
        })
        .catch((error) => {
          loadingReplies.delete(annotationId);
          throw error;
        });
      loadingReplies.set(annotationId, request);
      return request;
    }

    async function hydrateReplies() {
      const run = ++replyHydrationRun;
      const ids = annotations.map(({ id }) => id).filter((id) => !repliesByAnnotation.has(id));
      let cursor = 0;
      const worker = async () => {
        while (run === replyHydrationRun && panel.isOpen() && cursor < ids.length) {
          const id = ids[cursor];
          cursor += 1;
          try {
            await loadReplies(id);
          } catch {
            panel.showError();
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
    }

    const callbacks = {
      async onReply(annotation, body) {
        await store.addReply(annotation.id, body);
        await loadReplies(annotation.id, { refresh: true });
      },
      onResolve(annotation, resolved) {
        return store.setResolved(annotation.id, resolved);
      },
      async onEdit(annotation, item, rootComment, body) {
        if (rootComment) await store.editAnnotation(annotation.id, body);
        else {
          await store.editReply(annotation.id, item.id, body);
          await loadReplies(annotation.id, { refresh: true });
        }
      },
      async onDelete(annotation, item, rootComment) {
        if (rootComment) await store.hideAnnotation(annotation.id);
        else {
          await store.hideReply(annotation.id, item.id);
          await loadReplies(annotation.id, { refresh: true });
        }
      },
      async onSubmitDraft(body, draft) {
        const annotationId = await store.addAnnotation(draft.anchor, body);
        activeId = annotationId;
        return annotationId;
      },
      onCancelDraft() {
        panel.finishDraft(activeId);
      },
      onSelect(annotation) {
        activeId = annotation.id;
        panel.select(activeId);
        renderAnnotations();
      },
    };

    function openComments(selectedId = "") {
      activeId = selectedId;
      panel.openComments(threadData(), callbacks, { selectedId });
      renderAnnotations();
      panel.select(selectedId);
      hydrateReplies();
    }

    function toggleComments() {
      if (panel.isOpen()) {
        panel.close();
        return;
      }
      openComments();
    }

    function openDraft(anchor, anchorRange) {
      window.getSelection()?.removeAllRanges();
      view.hideSelection();
      activeId = "";
      panel.openComments(threadData(), callbacks, {
        draft: { anchor, anchorRange },
      });
      renderAnnotations();
      hydrateReplies();
    }

    function inspectSelection() {
      const selection = window.getSelection();
      const anchorRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      const anchor = captureSelection(prose);
      const rect = anchor ? selectionRect() : null;
      if (!anchor || !rect) {
        view.hideSelection();
        return;
      }
      view.showSelection(rect, () => openDraft(anchor, anchorRange));
    }

    let selectionTimer;
    document.addEventListener("selectionchange", () => {
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(inspectSelection, 80);
    });

    view.onGuide = toggleComments;
    view.rangeHover = (range) => {
      hoverHighlight?.clear();
      if (range && !activeId) hoverHighlight?.add(range);
    };

    store.onAuthStateChange((user) => panel.setUser(user));
    store.subscribeAnnotations(
      (items) => {
        annotations = items;
        renderAnnotations();
        if (!linkedCommentOpened && linkedCommentId) {
          const linked = annotations.find(({ id }) => id === linkedCommentId);
          if (linked) {
            linkedCommentOpened = true;
            openComments(linked.id);
          }
        }
      },
      () => {
        view.setUnavailable();
      },
    );
  }
}
