// Builds preview/chatly-preview.html: the whole app in one file with the fake server inlined.
const fs = require('fs'), path = require('path');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
let html = pub('index.html');
const js = f => '<script>\n' + f.replace(/<\/script/gi, '<\\/script') + '\n</script>';
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + pub('style.css') +
  '\n.preview-banner{position:fixed;left:50%;bottom:8px;transform:translateX(-50%);background:#1c1e26;color:#fff;font-size:12px;padding:5px 12px;border-radius:20px;opacity:.85;z-index:99;pointer-events:none;white-space:nowrap}\n</style>');
html = html.replace('<script src="/socket.io/socket.io.js"></script>', () => js(fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8')));
for (const f of ['i18n.js', 'emoji.js', 'app.js']) html = html.replace(`<script src="${f}"></script>`, () => js(pub(f)));
fs.writeFileSync(path.join(__dirname, 'chatly-preview.html'), html);
console.log('built', html.length, 'bytes');

// Web-page version: same page without the <html>/<head>/<body> wrapper (the host adds its own).
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
fs.writeFileSync(path.join(__dirname, 'chatly.html'), '<title>Chatly</title>\n' + style + '\n' + body.trim() + '\n');
console.log('built web page version');
