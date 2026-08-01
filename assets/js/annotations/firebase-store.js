import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

function dateValue(value) {
  return value?.toDate?.() || value || new Date();
}

function cleanUser(user, ownerEmails) {
  if (!user) return null;
  const email = user.email || "";
  return {
    uid: user.uid,
    displayName: (user.displayName || "Reader").slice(0, 80),
    email,
    isOwner: ownerEmails.includes(email.toLowerCase()),
  };
}

function cleanDocuments(snapshot) {
  return snapshot.docs
    .map((item) => ({
      id: item.id,
      ...item.data(),
      createdAt: dateValue(item.data().createdAt),
      updatedAt: dateValue(item.data().updatedAt),
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function createFirebaseStore({
  config,
  articleId,
  revision,
  language,
  ownerEmails,
  notificationEndpoint,
}) {
  const { appCheckSiteKey, ...firebaseConfig } = config;
  const app = initializeApp(firebaseConfig);
  if (appCheckSiteKey) {
    const {
      initializeAppCheck,
      ReCaptchaEnterpriseProvider,
    } = await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js");
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const database = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  let authContextPromise = null;

  function authContext() {
    if (!authContextPromise) {
      authContextPromise = import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js")
        .then((firebaseAuth) => ({
          firebaseAuth,
          auth: firebaseAuth.getAuth(app),
        }));
    }
    return authContextPromise;
  }

  const annotationsRef = collection(database, "articles", articleId, "annotations");
  let currentUser = null;

  return {
    get currentUser() {
      return currentUser;
    },

    onAuthStateChange(listener) {
      let active = true;
      let unsubscribe = () => {};
      authContext()
        .then(({ firebaseAuth, auth }) => {
          if (!active) return;
          unsubscribe = firebaseAuth.onAuthStateChanged(auth, (user) => {
            currentUser = cleanUser(user, ownerEmails);
            listener(currentUser);
          });
        })
        .catch(() => {
          if (active) listener(null);
        });
      return () => {
        active = false;
        unsubscribe();
      };
    },

    subscribeAnnotations(listener, onError) {
      const visible = query(annotationsRef, where("hidden", "==", false));
      return onSnapshot(visible, (snapshot) => listener(cleanDocuments(snapshot)), onError);
    },

    subscribeReplies(annotationId, listener, onError) {
      const repliesRef = collection(database, "articles", articleId, "annotations", annotationId, "replies");
      const visible = query(repliesRef, where("hidden", "==", false));
      return onSnapshot(visible, (snapshot) => listener(cleanDocuments(snapshot)), onError);
    },

    async loadReplies(annotationId) {
      const repliesRef = collection(database, "articles", articleId, "annotations", annotationId, "replies");
      const visible = query(repliesRef, where("hidden", "==", false));
      return cleanDocuments(await getDocs(visible));
    },

    async signIn() {
      const { firebaseAuth, auth } = await authContext();
      const provider = new firebaseAuth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await firebaseAuth.signInWithPopup(auth, provider);
      return cleanUser(result.user, ownerEmails);
    },

    async signOut() {
      const { firebaseAuth, auth } = await authContext();
      await firebaseAuth.signOut(auth);
    },

    async addComment(body) {
      if (!currentUser) throw new Error("Authentication required");
      const result = await addDoc(annotationsRef, {
        articleId,
        revision,
        language,
        scope: "article",
        quote: "",
        prefix: "",
        suffix: "",
        start: 0,
        end: 0,
        body: body.trim(),
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        resolved: false,
        hidden: false,
        editCount: 0,
        lastEditId: "",
      });
      notifyCreated({ annotationId: result.id }).catch(() => {});
      return result.id;
    },

    async addAnnotation(anchor, body) {
      if (!currentUser) throw new Error("Authentication required");
      const result = await addDoc(annotationsRef, {
        articleId,
        revision,
        language,
        scope: "paragraph",
        quote: anchor.quote,
        prefix: anchor.prefix,
        suffix: anchor.suffix,
        start: anchor.start,
        end: anchor.end,
        body: body.trim(),
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        resolved: false,
        hidden: false,
        editCount: 0,
        lastEditId: "",
      });
      notifyCreated({ annotationId: result.id }).catch(() => {});
      return result.id;
    },

    async addReply(annotationId, body) {
      if (!currentUser) throw new Error("Authentication required");
      const repliesRef = collection(database, "articles", articleId, "annotations", annotationId, "replies");
      const result = await addDoc(repliesRef, {
        body: body.trim(),
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        hidden: false,
        editCount: 0,
        lastEditId: "",
      });
      notifyCreated({ annotationId, replyId: result.id }).catch(() => {});
      return result.id;
    },

    async editAnnotation(annotationId, body) {
      const annotationRef = doc(database, "articles", articleId, "annotations", annotationId);
      await editDocument(annotationRef, body);
    },

    async editReply(annotationId, replyId, body) {
      const replyRef = doc(
        database,
        "articles",
        articleId,
        "annotations",
        annotationId,
        "replies",
        replyId,
      );
      await editDocument(replyRef, body);
    },

    async hideAnnotation(annotationId) {
      if (!currentUser?.isOwner) throw new Error("Owner permission required");
      const annotationRef = doc(database, "articles", articleId, "annotations", annotationId);
      await updateDoc(annotationRef, { hidden: true, updatedAt: serverTimestamp() });
    },

    async hideReply(annotationId, replyId) {
      if (!currentUser?.isOwner) throw new Error("Owner permission required");
      const replyRef = doc(
        database,
        "articles",
        articleId,
        "annotations",
        annotationId,
        "replies",
        replyId,
      );
      await updateDoc(replyRef, { hidden: true, updatedAt: serverTimestamp() });
    },

  };

  async function notifyCreated({ annotationId, replyId = "" }) {
    if (!notificationEndpoint) return;
    const { auth } = await authContext();
    if (!auth.currentUser) return;
    const idToken = await auth.currentUser.getIdToken();
    await fetch(notificationEndpoint, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ articleId, annotationId, replyId, idToken }),
    });
  }

  async function editDocument(targetRef, body) {
    if (!currentUser) throw new Error("Authentication required");
    const value = body.trim();
    if (!value || value.length > 2000) throw new Error("Invalid comment");

    const historyRef = doc(collection(targetRef, "history"));
    await runTransaction(database, async (transaction) => {
      const snapshot = await transaction.get(targetRef);
      if (!snapshot.exists()) throw new Error("Comment not found");
      const current = snapshot.data();
      if (current.authorId !== currentUser.uid) throw new Error("Author permission required");
      if (current.body === value) return;

      const version = (Number.isInteger(current.editCount) ? current.editCount : 0) + 1;
      transaction.set(historyRef, {
        body: current.body,
        editedAt: serverTimestamp(),
        version,
      });
      transaction.update(targetRef, {
        body: value,
        editCount: version,
        lastEditId: historyRef.id,
        updatedAt: serverTimestamp(),
      });
    });
  }
}
