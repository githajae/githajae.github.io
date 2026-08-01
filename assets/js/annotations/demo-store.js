function clone(items) {
  return items.map((item) => ({ ...item }));
}

export function createDemoStore({ articleId, revision, language, ownerEmails }) {
  let currentUser = null;
  let annotations = [];
  const replies = new Map();
  const annotationListeners = new Set();
  const replyListeners = new Map();
  const authListeners = new Set();

  const notifyAnnotations = () => annotationListeners.forEach((listener) => listener(clone(annotations)));
  const notifyReplies = (id) => (replyListeners.get(id) || new Set())
    .forEach((listener) => listener(clone(replies.get(id) || [])));
  const notifyAuth = () => authListeners.forEach((listener) => listener(currentUser));

  return {
    get currentUser() {
      return currentUser;
    },

    onAuthStateChange(listener) {
      authListeners.add(listener);
      listener(currentUser);
      return () => authListeners.delete(listener);
    },

    subscribeAnnotations(listener) {
      annotationListeners.add(listener);
      listener(clone(annotations));
      return () => annotationListeners.delete(listener);
    },

    subscribeReplies(annotationId, listener) {
      if (!replyListeners.has(annotationId)) replyListeners.set(annotationId, new Set());
      replyListeners.get(annotationId).add(listener);
      listener(clone(replies.get(annotationId) || []));
      return () => replyListeners.get(annotationId)?.delete(listener);
    },

    async signIn() {
      currentUser = {
        uid: "local-preview-user",
        displayName: "Preview Reader",
        email: ownerEmails[0] || "preview@example.com",
        isOwner: true,
      };
      notifyAuth();
      return currentUser;
    },

    async signOut() {
      currentUser = null;
      notifyAuth();
    },

    async addAnnotation(anchor, body) {
      if (!currentUser) throw new Error("Authentication required");
      const annotation = {
        id: `preview-${Date.now()}`,
        articleId,
        revision,
        language,
        ...anchor,
        body: body.trim(),
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        createdAt: new Date(),
        updatedAt: new Date(),
        resolved: false,
        hidden: false,
      };
      annotations = [...annotations, annotation];
      notifyAnnotations();
      return annotation.id;
    },

    async addReply(annotationId, body) {
      if (!currentUser) throw new Error("Authentication required");
      const reply = {
        id: `reply-${Date.now()}`,
        body: body.trim(),
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        createdAt: new Date(),
        updatedAt: new Date(),
        hidden: false,
      };
      replies.set(annotationId, [...(replies.get(annotationId) || []), reply]);
      notifyReplies(annotationId);
      return reply.id;
    },

    async setResolved(annotationId, resolved) {
      annotations = annotations.map((annotation) => (
        annotation.id === annotationId
          ? { ...annotation, resolved, updatedAt: new Date() }
          : annotation
      ));
      notifyAnnotations();
    },
  };
}
