# Chatly

Real-time web chat: accounts, profile pictures, friends, group chats, 6 languages, emoji.

## Install as an app + notifications
Chatly is an installable web app (PWA). It works in any browser, and can also be installed:
- **Android / Chrome / Edge:** tap "Install app" in Chatly, or the browser menu > Install app.
- **iPhone / iPad (iOS 16.4+):** Safari > Share > Add to Home Screen, then open it from the Home Screen.

Tap 🔔 to get notifications for new messages and friend requests. A device is not notified while
Chatly is open on screen for that person. The signing keys are created automatically and saved
with the rest of the data, so there is nothing to configure.

## Run it

    npm install
    npm start

Then open http://localhost:3000. Without a database, data is saved in `data/db.json`.

## Saving data permanently
Set `DATABASE_URL` to a PostgreSQL connection string (for example a free database from
https://neon.tech). Accounts, logins, chats and all messages are then stored there and
survive restarts. Tables are created automatically on first start.

## Features
- Sign up / log in (passwords hashed with scrypt). You must be logged in to chat.
- Profile picture upload (auto-cropped to a square), display name, language.
- Friends: send a request by username, accept/decline, see who's online, private messages.
- Group chats: anyone can create one, add friends, make it public so anyone can join, leave.
- Languages: English, Español, Français, 日本語, ไทย, 中文 (add more in `public/i18n.js`).
- Emoji: picker with 8 categories, reactions on messages, shortcuts like `:)` `<3` `:fire:` `:pizza:`,
  and emoji-only messages shown big.

## Deploy (free) on Render
1. Sign in to https://render.com with GitHub.
2. New > Blueprint > pick this repo > Deploy. `render.yaml` has the settings.

3. In the service's **Environment** tab, add `DATABASE_URL` (see above). Without it,
   everything is wiped whenever the free server restarts.

## Offline preview
`node preview/build.js` builds `preview/chatly-preview.html`, a single file that runs
in the browser with demo users (no server needed).
