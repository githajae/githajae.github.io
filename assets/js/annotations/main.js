import { captureParagraph, rangeForAnchor } from "./anchors.js";
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
  const view = new AnnotationView({
    language,
    guide: annotationIndex,
    content: prose,
  });
  let pendingGuideOpen = false;
  view.onGuide = () => {
    pendingGuideOpen = true;
  };

  // Keep authentication and Firestore off the critical rendering path. Two
  // frames let the article heading paint before Firebase is downloaded and
  // evaluated on slower mobile connections.
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  let store = null;
  try {
    store = await createStore(settings, context);
  } catch {
    view.setUnavailable();
  }
  if (store) {
    let annotations = [];
    let activeId = null;
    const repliesByAnnotation = new Map();
    const loadingReplies = new Map();
    let replyHydrationRun = 0;
    let replyRenderFrame = 0;
    let replyWarmupScheduled = false;
    const linkedCommentId = new URLSearchParams(window.location.search).get("comment");
    let linkedCommentOpened = false;

    const panel = new AnnotationPanel({
      language,
      mount: annotationRail,
      fallbackFocus: view.guide,
      onClose() {
        activeId = null;
        view.clearActiveParagraph();
        renderAnnotations();
      },
      onSignIn: () => store.signIn(),
      onSignOut: () => store.signOut(),
    });

    function anchoredItems() {
      return annotations.map((annotation) => {
        const range = rangeForAnchor(prose, annotation);
        return { annotation, range };
      });
    }

    function renderAnnotations() {
      const items = anchoredItems();
      view.renderMarkers(
        items,
        (annotation) => openComments(annotation.id),
        panel.isOpen() ? activeId : "",
      );
      view.updateCount(annotations.length);
      panel.updateComments(threadData());
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

    async function hydrateReplies({ background = false } = {}) {
      const run = ++replyHydrationRun;
      const ids = annotations.map(({ id }) => id).filter((id) => !repliesByAnnotation.has(id));
      let cursor = 0;
      const worker = async () => {
        while (run === replyHydrationRun && (background || panel.isOpen()) && cursor < ids.length) {
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

    function scheduleReplyWarmup() {
      if (replyWarmupScheduled || !annotations.length || annotations.length > 8) return;
      replyWarmupScheduled = true;
      const warm = () => {
        replyWarmupScheduled = false;
        hydrateReplies({ background: true }).catch(() => {});
      };
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(warm, { timeout: 1500 });
      } else {
        window.setTimeout(warm, 250);
      }
    }

    const callbacks = {
      async onReply(annotation, body) {
        await store.addReply(annotation.id, body);
        await loadReplies(annotation.id, { refresh: true });
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
        view.clearActiveParagraph();
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

    function openDraft(anchor, paragraph) {
      activeId = "";
      panel.openComments(threadData(), callbacks, {
        draft: { anchor },
      });
      renderAnnotations();
      view.setDraftParagraph(paragraph);
      hydrateReplies();
    }

    view.onGuide = toggleComments;
    if (pendingGuideOpen) toggleComments();
    view.paragraphClick = (paragraph) => {
      const anchor = captureParagraph(prose, paragraph);
      if (anchor) openDraft(anchor, paragraph);
    };

    store.onAuthStateChange((user) => panel.setUser(user));
    store.subscribeAnnotations(
      (items) => {
        annotations = items;
        renderAnnotations();
        scheduleReplyWarmup();
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
