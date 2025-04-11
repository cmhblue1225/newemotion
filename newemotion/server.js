const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Supabase 연결
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE // 보안상 서버에서는 Service Role Key 사용
);

// OpenAI 연결
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (req, res) => {
  res.send('EmotionProject Supabase Server is running!');
});

// ✅ 회원가입 (signup)
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user });
});

// ✅ 로그인 (email, password 기반)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const supabaseClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ session: data.session, user: data.user });
});

// ✅ 로그아웃
app.post('/api/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) return res.status(401).json({ error: '토큰이 필요합니다.' });

  const { error } = await supabase.auth.admin.signOut(token);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: '로그아웃 완료' });
});

// ✅ 일기 저장
app.post('/api/diary', async (req, res) => {
  const { user_id, emotion, content, feedback, music, shared } = req.body;

  const { data, error } = await supabase.from('diaries').insert([
    { user_id, emotion, content, feedback, music, shared }
  ]);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ diary: data });
});

// ✅ 감정 피드백
app.post('/api/feedback', async (req, res) => {
  const { content, emotion } = req.body;
  const prompt = `사용자가 ${emotion}의 감정을 느끼며 쓴 일기입니다:\n"${content}"\n이 내용을 읽고 진심 어린 피드백과 위로 또는 조언을 해주세요.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }]
  });

  res.json({ feedback: completion.choices[0].message.content.trim() });
});

// ✅ 음악 추천
app.post('/api/music', async (req, res) => {
  const { emotion } = req.body;
  const prompt = `기분이 ${emotion}일 때 듣기 좋은 노래 1곡을 추천하고, 유튜브 링크도 함께 제공해주세요.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }]
  });

  res.json({ music: completion.choices[0].message.content.trim() });
});

// ✅ 감정 통계 분석
app.post('/api/analysis', async (req, res) => {
  const { emotionCounts } = req.body;
  const stats = Object.entries(emotionCounts)
    .map(([k, v]) => `${k}: ${v}회`).join(', ');
  const prompt = `사용자의 감정 일기 분석 결과는 다음과 같습니다: ${stats}. 이를 바탕으로 감정 흐름에 대한 간단한 통찰과 조언을 제공해주세요.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }]
  });

  res.json({ analysis: completion.choices[0].message.content.trim() });
});

// ✅ 감정 기반 채팅
app.post('/api/chat', async (req, res) => {
  const { message, diary } = req.body;
  if (!diary?.emotion || !diary?.content) {
    return res.status(400).json({ reply: '잘못된 요청입니다. diary 정보가 필요합니다.' });
  }

  const systemPrompt = `너는 감정 상담사야. 사용자의 감정은 "${diary.emotion}"이고, 아래는 사용자가 쓴 일기야:\n"${diary.content}". 이 정보를 바탕으로 공감하며 따뜻한 말과 상담을 이어가.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    res.json({ reply: completion.choices[0].message.content.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: 'AI 응답에 실패했습니다.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ 서버가 포트 ${PORT}에서 실행 중!`));
