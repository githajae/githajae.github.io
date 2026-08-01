# Notes and Places comments

Notes and Places support whole-page comments beneath each entry, with one level of replies. The header comment link moves directly to the discussion. The implementation is checked in, but entry pages remain completely dormant until Firebase is configured.

## Firebase setup

1. Create a Firebase project and register a Web app.
2. In **Authentication → Sign-in method**, enable Google.
3. Add `githajae.github.io` to **Authentication → Settings → Authorized domains**.
4. Create a Cloud Firestore database.
5. Copy the Web app configuration into `_config.yml` and change `annotations.enabled` to `true`.
6. Before enforcing App Check, register the Web app with a reCAPTCHA Enterprise site key, place that key in `appCheckSiteKey`, and monitor App Check metrics for legitimate failures.
7. Deploy the checked-in rules:

   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

Firebase Web API keys identify the app; Firestore Security Rules provide authorization. Restrict the Firebase-provisioned key to Firebase APIs and never add service-account or FCM server keys to this repository.

Comments and Google display names are public. Firebase Authentication still processes the signed-in account, but email addresses and profile photos are not copied into public comment documents. Before launch, set Firebase budget alerts and enforce App Check after confirming legitimate traffic is accepted.

## Gmail notifications

`notifications/Code.gs` is deployed as an Apps Script web app owned by the notification Gmail account. New comments and replies send a best-effort webhook containing the creator's short-lived Firebase ID token and document IDs. The script reads the exact Firestore document with that token, ignores hidden or invalid documents, deduplicates each notification, and sends to the script owner's Gmail address. It derives the correct Notes or Places route and language from the verified document. It cannot be used to choose an arbitrary recipient or arbitrary email body.

The deployed `/exec` URL lives in `annotations.notification_endpoint`. When the Apps Script source changes, create a new deployment version and keep the same web-app URL. Gmail consumer accounts have daily Apps Script email quotas, so this is intended for a personal, low-volume site.

## Local preview

Build with the local preview configuration, then open an article with `?annotations=preview` on localhost:

```sh
bundle exec jekyll serve --config _config.yml,_config.preview.yml
open 'http://127.0.0.1:4000/notes/ability-to-wait/?annotations=preview'
```

Preview mode is limited to `localhost` and uses an in-memory account and store. It never writes to Firebase.

Place entries use the same preview mode. A `map_query` front-matter value adds a cross-platform Google Maps link without an API key. Use `map_url` only when a hand-verified URL is required.

## Data model

- `articles/{articleId}/annotations/{annotationId}` stores a root article comment, author display name, and moderation state. New documents use `scope: "article"`; anchor fields remain empty for schema compatibility.
- `articles/{articleId}/annotations/{annotationId}/replies/{replyId}` stores replies.
- Earlier paragraph comments remain readable. Their saved quote appears above the corresponding root comment, but new paragraph anchors are no longer created.
- Each comment and reply keeps immutable prior versions in its owner-only `history` subcollection. The public interface shows only an `Edited` label.
- Only the verified owner emails listed in `_config.yml` and `firestore.rules` can hide comments. Moderation uses a recoverable `hidden` flag rather than physical deletion.
- Email addresses and profile photos are not stored in comment documents.
- Rendering uses text nodes only; comment text is never interpreted as HTML.
- The public discussion fetches replies with at most four concurrent requests and caches them for the open session, avoiding one persistent listener per thread.
