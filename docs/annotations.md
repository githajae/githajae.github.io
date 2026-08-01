# Inline Notes comments

Notes can support Google Docs-style comments anchored to selected text. The implementation is checked in, but article pages remain completely dormant until Firebase is configured.

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

## Local preview

Build with the local preview configuration, then open an article with `?annotations=preview` on localhost:

```sh
bundle exec jekyll serve --config _config.yml,_config.preview.yml
open 'http://127.0.0.1:4000/notes/snowflake-moat/?annotations=preview'
```

Preview mode is limited to `localhost` and uses an in-memory account and store. It never writes to Firebase.

## Data model

- `articles/{articleId}/annotations/{annotationId}` stores the selected quote, surrounding context, text offsets, root comment, author display name, and moderation state.
- `articles/{articleId}/annotations/{annotationId}/replies/{replyId}` stores replies.
- Email addresses and profile photos are not stored in comment documents.
- Rendering uses text nodes only; comment text is never interpreted as HTML.

When article copy changes, increment `annotation_revision` in front matter. Anchors first try the saved text offsets, then reattach using the exact quote plus its surrounding context.
