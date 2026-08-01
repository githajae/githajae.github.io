const moduleVersion = new URL(import.meta.url).searchParams.get("v");
const modulePath = (path) => (moduleVersion
  ? `${path}?v=${encodeURIComponent(moduleVersion)}`
  : path);
const { CommentSection } = await import(modulePath("./comments.js"));

const root = document.querySelector("[data-annotation-root]");
const configNode = document.querySelector("#annotation-config");
const commentSection = document.querySelector("[data-comment-section]");
const commentIndex = document.querySelector("[data-comment-index]");

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
    const { createDemoStore } = await import(modulePath("./demo-store.js"));
    return createDemoStore(context);
  }

  if (!settings.enabled || !hasFirebaseConfig(settings.firebase)) return null;
  const { createFirebaseStore } = await import(modulePath("./firebase-store.js"));
  return createFirebaseStore({
    ...context,
    config: settings.firebase,
    notificationEndpoint: settings.notificationEndpoint || "",
  });
}

if (root && configNode && commentSection) {
  const settings = readConfig();
  const language = root.dataset.annotationLanguage === "ko" ? "ko" : "en";
  const context = {
    articleId: root.dataset.annotationId,
    revision: root.dataset.annotationRevision,
    language,
    ownerEmails: (settings.ownerEmails || []).map((email) => email.toLowerCase()),
  };
  const comments = new CommentSection({
    language,
    mount: commentSection,
    guide: commentIndex,
  });

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  let store = null;
  try {
    store = await createStore(settings, context);
  } catch {
    comments.setUnavailable();
  }

  if (store) {
    let annotations = [];
    const repliesByAnnotation = new Map();
    const loadingReplies = new Map();
    let hydrationRun = 0;
    let renderFrame = 0;
    let pendingSelectedId = new URLSearchParams(window.location.search).get("comment") || "";
    let linkedCommentOpened = false;

    function threadData() {
      return [...annotations]
        .sort((a, b) => (a.createdAt - b.createdAt))
        .map((annotation) => ({
          annotation,
          replies: repliesByAnnotation.get(annotation.id) || [],
        }));
    }

    function updateComments() {
      comments.updateComments(threadData(), callbacks);
      if (pendingSelectedId && annotations.some(({ id }) => id === pendingSelectedId)) {
        const selectedId = pendingSelectedId;
        pendingSelectedId = "";
        comments.reveal(selectedId, { scroll: !linkedCommentOpened });
        linkedCommentOpened = true;
      }
    }

    function scheduleUpdate() {
      if (renderFrame) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = 0;
        updateComments();
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
          scheduleUpdate();
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
      const run = ++hydrationRun;
      const ids = annotations
        .map(({ id }) => id)
        .filter((id) => !repliesByAnnotation.has(id));
      let cursor = 0;
      const worker = async () => {
        while (run === hydrationRun && cursor < ids.length) {
          const id = ids[cursor];
          cursor += 1;
          try {
            await loadReplies(id);
          } catch {
            comments.showError();
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
    }

    const callbacks = {
      async onSubmitComment(body) {
        pendingSelectedId = await store.addComment(body);
        return pendingSelectedId;
      },
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
      onSignIn: () => store.signIn(),
      onSignOut: () => store.signOut(),
    };

    comments.updateComments([], callbacks);
    store.onAuthStateChange((user) => comments.setUser(user));
    store.subscribeAnnotations(
      (items) => {
        annotations = items;
        const visibleIds = new Set(items.map(({ id }) => id));
        [...repliesByAnnotation.keys()].forEach((id) => {
          if (!visibleIds.has(id)) repliesByAnnotation.delete(id);
        });
        updateComments();
        hydrateReplies().catch(() => comments.showError());
      },
      () => comments.setUnavailable(),
    );
  }
}
