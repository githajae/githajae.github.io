const CONFIG = Object.freeze({
  projectId: "githajae-8ec9c",
  siteUrl: "https://githajae.github.io",
});

function doPost(event) {
  try {
    const payload = JSON.parse(event && event.postData ? event.postData.contents : "{}");
    const articleId = validId(payload.articleId, "articleId");
    const annotationId = validId(payload.annotationId, "annotationId");
    const replyId = payload.replyId ? validId(payload.replyId, "replyId") : "";
    const idToken = String(payload.idToken || "");
    if (!/^[A-Za-z0-9_.-]{100,6000}$/.test(idToken)) throw new Error("Invalid token");

    const annotationPath = ["articles", articleId, "annotations", annotationId];
    const annotation = fetchDocument(annotationPath, idToken);
    const comment = replyId
      ? fetchDocument(annotationPath.concat(["replies", replyId]), idToken)
      : annotation;

    if (booleanField(annotation, "hidden") || booleanField(comment, "hidden")) {
      throw new Error("Comment is hidden");
    }

    const author = stringField(comment, "authorName") || "Reader";
    const body = stringField(comment, "body");
    const quote = stringField(annotation, "quote");
    const language = stringField(annotation, "language") === "ko" ? "ko" : "en";
    if (!body) throw new Error("Comment is empty");

    const notificationKey = digestKey([articleId, annotationId, replyId || "root"].join(":"));
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const properties = PropertiesService.getScriptProperties();
      if (properties.getProperty(notificationKey)) return json({ ok: true, duplicate: true });
      if (MailApp.getRemainingDailyQuota() < 1) throw new Error("Daily email quota reached");
      const recipient = Session.getEffectiveUser().getEmail();
      if (!recipient) throw new Error("Notification recipient is unavailable");

      const notePath = language === "ko" ? `/ko/notes/${articleSlug(articleId)}/` : `/notes/${articleSlug(articleId)}/`;
      const link = `${CONFIG.siteUrl}${notePath}?comment=${encodeURIComponent(annotationId)}`;
      const kind = replyId ? "reply" : "comment";
      const subject = `New ${kind} on Notes — ${author}`;
      const plain = [
        `${author} left a ${kind}.`,
        quote ? `\n“${quote}”` : "",
        `\n${body}`,
        `\n${link}`,
      ].join("");
      const html = [
        `<p><strong>${escapeHtml(author)}</strong> left a ${kind}.</p>`,
        quote ? `<blockquote style="margin:16px 0;padding-left:12px;border-left:2px solid #d2d2d7;color:#6e6e73">${escapeHtml(quote)}</blockquote>` : "",
        `<p style="white-space:pre-wrap">${escapeHtml(body)}</p>`,
        `<p><a href="${escapeHtml(link)}">Open comment</a></p>`,
      ].join("");

      MailApp.sendEmail({
        to: recipient,
        subject,
        body: plain,
        htmlBody: html,
        name: "Jaehyun Ha — Notes",
      });
      properties.setProperty(notificationKey, new Date().toISOString());
      return json({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function fetchDocument(path, idToken) {
  const encodedPath = path.map(encodeURIComponent).join("/");
  const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents/${encodedPath}`;
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error("Comment verification failed");
  return JSON.parse(response.getContentText());
}

function validId(value, label) {
  const id = String(value || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error(`Invalid ${label}`);
  return id;
}

function stringField(document, name) {
  return document && document.fields && document.fields[name]
    ? String(document.fields[name].stringValue || "")
    : "";
}

function booleanField(document, name) {
  return Boolean(document && document.fields && document.fields[name] && document.fields[name].booleanValue);
}

function articleSlug(articleId) {
  return articleId.replace(/-(en|ko)$/, "");
}

function digestKey(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map((byte) => (byte + 256).toString(16).slice(-2))
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
