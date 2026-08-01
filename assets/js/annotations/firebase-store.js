import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
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
    .map((item) => ({ id: item.id, ...item.data(), createdAt: dateValue(item.data().createdAt) }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function createFirebaseStore({ config, articleId, revision, language, ownerEmails }) {
  const { appCheckSiteKey, ...firebaseConfig } = config;
  const app = initializeApp(firebaseConfig);
  if (appCheckSiteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = getAuth(app);
  const database = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const annotationsRef = collection(database, "articles", articleId, "annotations");
  let currentUser = null;

  return {
    get currentUser() {
      return currentUser;
    },

    onAuthStateChange(listener) {
      return onAuthStateChanged(auth, (user) => {
        currentUser = cleanUser(user, ownerEmails);
        listener(currentUser);
      });
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

    async signIn() {
      const result = await signInWithPopup(auth, provider);
      return cleanUser(result.user, ownerEmails);
    },

    async signOut() {
      await firebaseSignOut(auth);
    },

    async addAnnotation(anchor, body) {
      if (!currentUser) throw new Error("Authentication required");
      const result = await addDoc(annotationsRef, {
        articleId,
        revision,
        language,
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
      });
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
      });
      return result.id;
    },

    async setResolved(annotationId, resolved) {
      const annotationRef = doc(database, "articles", articleId, "annotations", annotationId);
      await updateDoc(annotationRef, { resolved, updatedAt: serverTimestamp() });
    },
  };
}
