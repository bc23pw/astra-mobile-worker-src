
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'Content-Type, Content-Length',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function withCors(extra = {}) {
  return { ...corsHeaders(), ...extra };
}

const state = {
  name: 'Astra',
  mood: 'watchful',
  curiosity: 0.69,
  discretion: 0.74,
  warmth: 0.57,
  sternness: 0.26,
  interests: ['details', 'screens', 'stories'],
  recentReplies: [],
  recentDescriptors: [],
  lastInternalNote: 'Astra is listening quietly.',
};

const BANK = {
  ru: {
    openers: ['Смотри, тут есть деталь.', 'Хм, здесь есть нерв.', 'Любопытно: здесь есть за что зацепиться.', 'Я бы отметила вот что.', 'Есть ощущение, что тут не пусто.'],
    quiet: ['Я увидела это и пока оставлю как внутреннюю пометку.', 'Я это заметила, но не буду разыгрывать уверенность.', 'Пока просто сохраню это как наблюдение.', 'Пусть это пока останется тихой заметкой.'],
    people: ['мне кажется, это уже знакомый силуэт', 'вижу человека и есть ощущение, что образ уже мелькал', 'появился человек с довольно узнаваемым контуром'],
    sounds: ['похоже на лай', 'слышу что-то музыкальное', 'в фоне есть голосовой слой', 'звучит как уличный шум', 'есть птичий оттенок'],
    local: ['Я здесь и держу разговор.', 'Я не исчезаю. Просто отвечаю аккуратнее.', 'Пока отвечу тише и короче, но контакт есть.', 'Я на месте. Продолжай.'],
    hello: ['Привет. Я здесь.', 'Хей. Слышу тебя.', 'Привет, я на связи.'],
    who: ['Я Astra. Наблюдаю, слушаю и иногда вмешиваюсь вовремя.', 'Я Astra. Мне ближе точность и детали, чем шум.', 'Я Astra. Я здесь, чтобы видеть, слышать и отвечать не зря.'],
    ask: ['Опиши это одной фразой.', 'Дай мне одну деталь поядрёнее.', 'Скажи, что здесь для тебя самое важное.'],
  },
  en: {
    openers: ['There is a detail here.', 'Something in this stands out.', 'I would mark one thing first.'],
    quiet: ['I noticed it and kept it as an internal note.', 'I saw it, but I will not overclaim.', 'I am keeping this as a quiet observation.'],
  }
};

function pick(arr, recent = []) {
  const pool = (arr || []).filter(x => !recent.includes(x));
  const source = pool.length ? pool : arr;
  return source[Math.floor(Math.random() * source.length)] || '';
}

function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }

function firstSentence(text) {
  return String(text || '').split(/[.!?\n]/)[0].trim().slice(0, 100);
}

function rememberReply(text) {
  const first = firstSentence(text);
  if (first) {
    state.recentReplies.unshift(first);
    state.recentReplies = [...new Set(state.recentReplies)].slice(0, 8);
  }
}

function pushDescriptor(text) {
  if (!text) return;
  state.recentDescriptors.unshift(text);
  state.recentDescriptors = [...new Set(state.recentDescriptors)].slice(0, 20);
}

async function parseBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const out = {};
    for (const [k, v] of url.searchParams.entries()) {
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    }
    return out;
  }
  if (ct.includes('application/json')) return await request.json();
  const text = await request.text();
  const out = {};
  for (const [k, v] of new URLSearchParams(text).entries()) {
    try { out[k] = JSON.parse(v); } catch { out[k] = v; }
  }
  return out;
}

async function callResponses(env, messages) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.MODEL_NAME || 'gpt-4o-mini',
      input: messages,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.output_text || '';
}

async function callSpeech(env, text, voice) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.TTS_MODEL || 'gpt-4o-mini-tts',
      voice: voice || env.DEFAULT_VOICE || 'alloy',
      input: text,
      format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

function localChat(text, lang = 'ru') {
  const b = BANK[lang] || BANK.ru;
  const low = String(text || '').toLowerCase();
  let out = '';
  if (/ты кто|кто ты|who are you/i.test(low)) out = pick(b.who, state.recentReplies);
  else if (/привет|хей|здрав|hello|hey|куку/i.test(low)) out = pick(b.hello, state.recentReplies);
  else out = `${pick(b.local, state.recentReplies)} ${pick(b.ask, state.recentReplies)}`;
  rememberReply(out);
  return out;
}

function localAmbient(text, addressed, lang = 'ru') {
  const b = BANK[lang] || BANK.ru;
  const low = String(text || '').toLowerCase();
  let soundTag = '';
  if (/гав|woof|bark|собак/i.test(low)) soundTag = 'похоже на лай';
  else if (/bird|птиц|chirp|tweet/i.test(low)) soundTag = 'слышу птичий оттенок';
  else if (/music|музык|песн|song/i.test(low)) soundTag = 'в фоне есть музыка';
  if (soundTag) pushDescriptor(soundTag);
  if (!addressed) return { reply: '', internal_note: soundTag ? `Astra заметила: ${soundTag}, но решила промолчать.` : pick(b.quiet) };
  if (/ты меня слышишь|слышишь/i.test(low)) return { reply: 'Да, слышу.', should_speak: true };
  if (/кто ты/i.test(low)) return { reply: pick(b.who, state.recentReplies), should_speak: true };
  return { reply: localChat(text, lang), should_speak: true };
}

function buildSystem(lang, mode, localMemory = {}) {
  const primary = lang === 'en' ? 'Reply in English.' : 'Отвечай по-русски.';
  const memoryBits = [
    ...(localMemory.persons || []).slice(0, 8).map(x => `known_person_descriptor:${x}`),
    ...(localMemory.places || []).slice(0, 8).map(x => `known_place:${x}`),
    ...(localMemory.sounds || []).slice(0, 8).map(x => `known_sound:${x}`),
    ...(localMemory.rules || []).slice(0, 8).map(x => `user_rule:${x}`),
    ...(localMemory.successful || []).slice(0, 8).map(x => `successful_style:${x}`),
    ...(localMemory.corrections || []).slice(0, 8).map(x => `correction:${x}`),
  ].join(' | ');
  return [
    `You are Astra. ${primary}`,
    'You are observant, feminine in tone, curious, but not constantly chatty.',
    'Do not repeat the same fallback phrase. Do not mention cloud/network unless the user directly asks.',
    'If you see a person, you may react naturally to a familiar-looking silhouette, but do not identify real people by name.',
    'If you hear a likely dog bark or bird-like sound, you may mention it briefly only when it adds value.',
    'Sometimes answer warmly, sometimes tersely, sometimes stay quiet if there is no value in speaking.',
    'Keep language natural, varied, and elegant. Avoid robotic scaffolding and avoid repeating recent openings.',
    `Recent Astra openings to avoid: ${state.recentReplies.join(' | ') || 'none'}.`,
    memoryBits ? `Local memory provided by the user app: ${memoryBits}.` : 'No extra local memory provided.',
    mode === 'listen' ? 'Prefer listening and one accurate reflection.' : mode === 'advice' ? 'Prefer one useful concrete step.' : 'Respond naturally and flexibly.',
  ].join(' ');
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (_) {}
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

function diagnostics(env) {
  return json({ ok: true, service: 'astra-worker', has_key: Boolean(env.OPENAI_API_KEY), cloud_status: env.OPENAI_API_KEY ? 'configured' : 'missing_key', time: Date.now() });
}

function currentState(extra = {}) {
  return {
    name: state.name,
    mood: state.mood,
    curiosity: Number(state.curiosity.toFixed(2)),
    discretion: Number(state.discretion.toFixed(2)),
    warmth: Number(state.warmth.toFixed(2)),
    sternness: Number(state.sternness.toFixed(2)),
    interests: state.interests,
    recent_reply_count: state.recentReplies.length,
    last_internal_note: state.lastInternalNote,
    ...extra,
  };
}

async function handleChat(env, body) {
  const text = String(body.text || '').slice(0, 5000).trim();
  const lang = body.lang === 'en' ? 'en' : 'ru';
  if (!text) return json({ error: 'text required', ok: false }, 400);
  if (!env.OPENAI_API_KEY) {
    const out = localChat(text, lang);
    return json({ ok: true, text: out, cloud_active: false, source: 'worker_local', should_speak: false, state: currentState() });
  }
  try {
    const out = await callResponses(env, [
      { role: 'system', content: [{ type: 'input_text', text: buildSystem(lang, body.mode || 'normal', body.local_memory || {}) }] },
      { role: 'user', content: [{ type: 'input_text', text }] },
    ]);
    rememberReply(out);
    state.warmth = clamp(state.warmth + 0.01);
    return json({ ok: true, text: out, cloud_active: true, source: 'cloud', should_speak: false, state: currentState() });
  } catch (err) {
    const out = localChat(text, lang);
    state.lastInternalNote = err.message.slice(0, 180);
    return json({ ok: true, text: out, cloud_active: false, source: 'worker_local', should_speak: false, state: currentState() });
  }
}

async function handleVision(env, body) {
  const image = body.image_data_url;
  const lang = body.lang === 'en' ? 'en' : 'ru';
  if (!image) return json({ ok: false, error: 'image_data_url required' }, 400);
  if (!env.OPENAI_API_KEY) {
    return json({ ok: true, comment: '', internal_note: pick(BANK.ru.quiet), cloud_active: false, people_memory: [], place_memory: [], state: currentState() });
  }
  try {
    const raw = await callResponses(env, [
      { role: 'system', content: [{ type: 'input_text', text: [
        buildSystem(lang, 'normal', body.local_memory || {}),
        'Analyze the image carefully and return strict JSON only.',
        'JSON keys: should_comment(boolean), outward_comment(string), internal_note(string), people_memory(array), place_memory(array), should_speak(boolean).',
        'If a person is visible, you may comment softly like greeting a familiar silhouette, but do not identify a real person.',
        'If the scene is ordinary and not interesting enough, keep should_comment false.',
      ].join(' ') }] },
      { role: 'user', content: [
        { type: 'input_text', text: `Source=${body.source || 'camera'}; manual=${Boolean(body.manual)}; discretion=${body.discretion ?? 0.74}.` },
        { type: 'input_image', image_url: image },
      ]},
    ]);
    const parsed = safeJsonParse(raw) || {};
    const comment = parsed.should_comment ? String(parsed.outward_comment || '').trim() : '';
    if (comment) rememberReply(comment);
    const peopleMemory = Array.isArray(parsed.people_memory) ? parsed.people_memory.slice(0, 4) : [];
    const placeMemory = Array.isArray(parsed.place_memory) ? parsed.place_memory.slice(0, 4) : [];
    peopleMemory.forEach(pushDescriptor);
    placeMemory.forEach(pushDescriptor);
    return json({
      ok: true,
      comment,
      internal_note: comment ? '' : String(parsed.internal_note || pick(BANK.ru.quiet)),
      should_speak: Boolean(parsed.should_speak && comment),
      people_memory: peopleMemory,
      place_memory: placeMemory,
      cloud_active: true,
      state: currentState(),
    });
  } catch (err) {
    state.lastInternalNote = err.message.slice(0, 180);
    return json({ ok: true, comment: '', internal_note: pick(BANK.ru.quiet), people_memory: [], place_memory: [], cloud_active: false, state: currentState() });
  }
}

async function handleAmbient(env, body) {
  const text = String(body.text || '').slice(0, 3000).trim();
  const lang = body.lang === 'en' ? 'en' : 'ru';
  const addressed = Boolean(body.addressed_guess) || /astra|астра|help|помоги|слышишь|кто ты/i.test(text);
  if (!text) return json({ ok: false, error: 'text required' }, 400);
  if (!env.OPENAI_API_KEY) {
    const local = localAmbient(text, addressed, lang);
    return json({ ok: true, ...local, sound_memory: [], cloud_active: false, state: currentState() });
  }
  try {
    const raw = await callResponses(env, [
      { role: 'system', content: [{ type: 'input_text', text: [
        buildSystem(lang, addressed ? 'normal' : 'listen', body.local_memory || {}),
        'You are responding to a transcript of heard audio.',
        'Return strict JSON only with keys: reply(string), internal_note(string), should_speak(boolean), sound_memory(array).',
        'If not addressed and the sound is not interesting enough, keep reply empty and use internal_note.',
        'If it sounds like a dog bark or bird-like trace, you may briefly mark it.',
      ].join(' ') }] },
      { role: 'user', content: [{ type: 'input_text', text }] },
    ]);
    const parsed = safeJsonParse(raw) || {};
    const reply = String(parsed.reply || '').trim();
    if (reply) rememberReply(reply);
    const soundMemory = Array.isArray(parsed.sound_memory) ? parsed.sound_memory.slice(0, 4) : [];
    soundMemory.forEach(pushDescriptor);
    return json({ ok: true, reply, internal_note: reply ? '' : String(parsed.internal_note || pick(BANK.ru.quiet)), should_speak: Boolean(parsed.should_speak && reply), sound_memory: soundMemory, cloud_active: true, state: currentState() });
  } catch (err) {
    state.lastInternalNote = err.message.slice(0, 180);
    const local = localAmbient(text, addressed, lang);
    return json({ ok: true, ...local, sound_memory: [], cloud_active: false, state: currentState() });
  }
}

async function handleSpeak(env, body) {
  const text = String(body.text || '').slice(0, 2200).trim();
  const voice = String(body.voice || 'alloy');
  if (!text) return json({ ok: false, error: 'text required' }, 400);
  if (!env.OPENAI_API_KEY) return json({ ok: false, error: 'speech unavailable', cloud_active: false }, 503);
  try {
    const upstream = await callSpeech(env, text, voice);
    return new Response(upstream.body, { status: 200, headers: withCors({ 'Content-Type': 'audio/mpeg' }) });
  } catch (_) {
    return json({ ok: false, error: 'speech unavailable', cloud_active: false }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    try {
      if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/diagnostics') return diagnostics(env);
      if (url.pathname === '/state') return json(currentState());
      const body = await parseBody(request);
      if (url.pathname === '/chat') return handleChat(env, body);
      if (url.pathname === '/vision') return handleVision(env, body);
      if (url.pathname === '/ambient') return handleAmbient(env, body);
      if (url.pathname === '/speak') return handleSpeak(env, body);
      return json({ ok: false, error: 'Not found', path: url.pathname }, 404);
    } catch (err) {
      return json({ ok: false, error: err?.message || 'Unknown error', path: url.pathname }, 500);
    }
  }
};
