// Emoji picker data + text shortcuts like :) or :fire:
const EMOJI = {
  smileys: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾',
  people: '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🦾 👀 👁️ 👅 👄 🧠 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙋 🙆 🙅 🤷 🤦 💁 🙇 🧑‍💻 🧑‍🎤 🧑‍🎨 🧑‍🍳 🧑‍🚀 🦸 🦹 🧙 🧚 🧛 🧜 🧝 💃 🕺 👯',
  animals: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦒 🦘 🐪 🐫 🦙 🐕 🐈 🐓 🦃 🦚 🦜 🦢 🌵 🎄 🌲 🌳 🌴 🌱 🌿 🍀 🍁 🍂 🌸 🌺 🌻 🌹 🌷 🌼',
  food: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🍞 🥖 🧀 🥚 🍳 🥞 🧇 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 ☕ 🍵 🧋 🥤 🍺 🍻 🥂 🍷 🍹',
  activity: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🥅 ⛳ 🏹 🎣 🥊 🥋 🛹 ⛸️ 🎿 🏂 🏋️ 🤸 ⛹️ 🤺 🏄 🏊 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🧩',
  travel: '🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🚜 🛵 🏍️ 🚲 🛴 🚨 🚃 🚄 🚅 🚂 ✈️ 🛫 🛬 🚀 🛸 🚁 ⛵ 🚤 🛳️ 🚢 ⚓ 🗺️ 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ 🏠 🏡 🏢 🏥 🏦 🏨 🏫 ⛪ 🕌 🛕 🌅 🌄 🌠 🎆 🎇 🌇 🌆 🌃 🌌 🌉 🌁 ☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌩️ ❄️ ☃️ ⛄ 🌈 ⚡ 🔥 💧 🌊 🌙 ⭐ 🌟',
  objects: '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📷 📸 📹 🎥 📞 ☎️ 📺 📻 ⏰ ⌛ 🔋 🔌 💡 🔦 🕯️ 💸 💵 💰 💳 💎 ⚖️ 🔧 🔨 ⚙️ 🔫 💣 🔪 🛡️ 🔮 💊 💉 🧬 🔬 🔭 🧹 🧺 🧻 🚽 🛁 🧼 🔑 🗝️ 🚪 🛋️ 🛏️ 🧸 🎁 🎈 🎀 🎊 🎉 ✉️ 📦 📝 📁 📅 📌 📎 ✂️ 🔒 🔓 📚 📖 🔖 ✏️ 🖊️ 🖌️ 🖍️',
  symbols: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☯️ ✡️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆗 🆒 🆕 🆓 🆙 🆘 ⛔ 🚫 💯 💢 ♨️ ❗ ❓ ‼️ ⁉️ ⚠️ ♻️ ✅ ❌ ❎ ➕ ➖ ➗ ✖️ 💲 ™️ ©️ ®️ 〰️ ➰ ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🔶 🔷 💬 💭 🗯️ 💤',
};
for (const k in EMOJI) EMOJI[k] = EMOJI[k].split(' ');

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

const EMOTICONS = {
  ':)': '🙂', ':-)': '🙂', ':D': '😄', ':-D': '😄', ';)': '😉', ':(': '🙁', ':-(': '🙁',
  ":'(": '😢', ':P': '😛', ':p': '😛', ':O': '😮', ':o': '😮', '<3': '❤️', '</3': '💔',
  'XD': '😆', 'xD': '😆', 'B)': '😎', ':|': '😐', ':*': '😘',
};
const SHORTCODES = {
  smile: '😄', laugh: '😂', lol: '😂', wink: '😉', heart: '❤️', love: '😍', cool: '😎', cry: '😭',
  angry: '😠', thumbsup: '👍', '+1': '👍', thumbsdown: '👎', clap: '👏', fire: '🔥', party: '🥳', tada: '🎉',
  ok: '👌', wave: '👋', pray: '🙏', star: '⭐', sun: '☀️', moon: '🌙', rocket: '🚀', '100': '💯',
  think: '🤔', eyes: '👀', skull: '💀', poop: '💩', cat: '🐱', dog: '🐶', pizza: '🍕', cake: '🎂', coffee: '☕',
};

// Turn ":)" and ":fire:" into real emoji. Emoticons only match as whole words so URLs stay intact.
function emojify(text) {
  text = text.replace(/:([a-z0-9_+]+):/gi, (m, code) => SHORTCODES[code.toLowerCase()] || m);
  const keys = Object.keys(EMOTICONS).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp('(^|\\s)(' + keys.join('|') + ')(?=\\s|$)', 'g');
  return text.replace(re, (m, pre, emo) => pre + EMOTICONS[emo]);
}
