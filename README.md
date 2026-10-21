# Chatly

Real-time web chat: accounts, profile pictures, friends, group chats, 6 languages, emoji.

## Run it

    npm install
    npm start

Then open http://localhost:3000. Data is saved in `data/db.json`.

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

Note: on the free plan the `data/db.json` file is wiped when the server restarts.

## Offline preview
`node preview/build.js` builds `preview/chatly-preview.html`, a single file that runs
in the browser with demo users (no server needed).
