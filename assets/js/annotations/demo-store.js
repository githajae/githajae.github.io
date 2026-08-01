function clone(items) {
  return items.map((item) => ({ ...item }));
}

export function createDemoStore({ articleId, revision, language, ownerEmails }) {
  let currentUser = null;
  let annotations = [];
  const replies = new Map();
  const histories = new Map();
  const annotationListeners = new Set();
  const replyListeners = new Map();
  const authListeners = new Set();

  const visibleAnnotations = () => annotations.filter(({ hidden }) => !hidden);
  const visibleReplies = (id) => (replies.get(id) || []).filter(({ hidden }) => !hidden);
  const notifyAnnotations = () => annotationListeners.forEach((listener) => listener(clone(visibleAnnotations())));
  const notifyReplies = (id) => (replyListeners.get(id) || new Set())
    .forEach((listener) => listener(clone(visibleReplies(id))));
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
      listener(clone(visibleAnnotations()));
      return () => annotationListeners.delete(listener);
    },

    subscribeReplies(annotationId, listener) {
      if (!replyListeners.has(annotationId)) replyListeners.set(annotationId, new Set());
      replyListeners.get(annotationId).add(listener);
      listener(clone(visibleReplies(annotationId)));
      return () => replyListeners.get(annotationId)?.delete(listener);
    },

    async loadReplies(annotationId) {
      return clone(visibleReplies(annotationId));
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
        editCount: 0,
        lastEditId: "",
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
        editCount: 0,
        lastEditId: "",
      };
      replies.set(annotationId, [...(replies.get(annotationId) || []), reply]);
      notifyReplies(annotationId);
      return reply.id;
    },

    async editAnnotation(annotationId, body) {
      annotations = annotations.map((annotation) => (
        annotation.id === annotationId
          ? editedDocument(annotation, `annotation:${annotationId}`, body)
          : annotation
      ));
      notifyAnnotations();
    },

    async editReply(annotationId, replyId, body) {
      replies.set(annotationId, (replies.get(annotationId) || []).map((reply) => (
        reply.id === replyId
          ? editedDocument(reply, `reply:${annotationId}:${replyId}`, body)
          : reply
      )));
      notifyReplies(annotationId);
    },

    async hideAnnotation(annotationId) {
      annotations = annotations.map((annotation) => (
        annotation.id === annotationId
          ? { ...annotation, hidden: true, updatedAt: new Date() }
          : annotation
      ));
      notifyAnnotations();
    },

    async hideReply(annotationId, replyId) {
      replies.set(annotationId, (replies.get(annotationId) || []).map((reply) => (
        reply.id === replyId
          ? { ...reply, hidden: true, updatedAt: new Date() }
          : reply
      )));
      notifyReplies(annotationId);
    },

  };

  function editedDocument(item, historyKey, body) {
    if (!currentUser || item.authorId !== currentUser.uid) {
      throw new Error("Author permission required");
    }
    const value = body.trim();
    if (!value || value.length > 2000 || value === item.body) return item;
    const version = (item.editCount || 0) + 1;
    histories.set(historyKey, [
      { id: `history-${Date.now()}`, body: item.body, editedAt: new Date(), version },
      ...(histories.get(historyKey) || []),
    ]);
    return {
      ...item,
      body: value,
      editCount: version,
      lastEditId: `history-${version}`,
      updatedAt: new Date(),
    };
  }
}
