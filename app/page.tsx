'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

type Task = {
  id: number;
  name: string;
  time: string;
  end_time: string;
  date: string;
  buffer: number;
  done: boolean;
  snoozedUntil?: string;
};

type Template = {
  id: number;
  name: string;
  time: string;
};

export default function Home() {
  const [isNight, setIsNight] = useState(false);
  const [isPC, setIsPC] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newBuffer, setNewBuffer] = useState(15);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('タスクを声で追加できるよ');
  const [alarmTask, setAlarmTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [praise, setPraise] = useState('');
  const [warning, setWarning] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateTime, setNewTemplateTime] = useState('');
  const [chara, setChara] = useState<'imouto' | 'oniisan' | 'tennen'>('imouto');
  const [charaSpeech, setCharaSpeech] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const charaConfig = {
    imouto:  { label: '妹系',    img: '/characters/chara_imouto.jpg'  },
    oniisan: { label: 'お兄さん系', img: '/characters/chara_oniisan.jpg' },
    tennen:  { label: '天然系',  img: '/characters/chara_tennen.jpg'  },
  };

  const praiseLines = {
    imouto:  ['やったじゃん！すごい！', 'えらい！その調子だよ！', 'やった〜！一緒に喜ぶ！', 'もう最高！どんどんいこ！'],
    oniisan: ['よくやった。', '悪くない。次も頼む。', '一つ片付いたな。', 'その調子だ。'],
    tennen:  ['えへへ〜できたね！', 'すごいね〜！', 'やったね、えらいえらい〜', 'ふふ、一緒にがんばろ〜'],
  };

  const greetLines = {
    imouto:  ['よろしくね！一緒にがんばろ！', 'わたしに任せて！', 'きたきた！やるよ！'],
    oniisan: ['俺が来た。', 'よし、始めるか。', '任せろ。'],
    tennen:  ['えへへ〜よろしくね〜', 'いっしょにがんばろうね〜', 'わあ、呼んでくれた〜'],
  };

  const addLines = {
    imouto:  ['オッケー！追加したよ！', 'やった、新しいタスクだ！', 'まかせて！'],
    oniisan: ['登録した。', '了解。', 'タスク追加完了。'],
    tennen:  ['はーい、追加したよ〜', 'わかった〜！', 'えへへ、登録したね〜'],
  };

  const charaSpeaker = { imouto: 3, oniisan: 13, tennen: 10 };

  const speakVoicevox = async (text: string, speaker: number) => {
    try {
      const queryRes = await fetch(`http://localhost:50021/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, { method: 'POST' });
      if (!queryRes.ok) return;
      const query = await queryRes.json();
      const synthRes = await fetch(`http://localhost:50021/synthesis?speaker=${speaker}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
      if (!synthRes.ok) return;
      const blob = await synthRes.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch {
      // VOICEVOXが起動していない場合は無音で続行
    }
  };

  const showPraise = () => {
    const lines = praiseLines[chara];
    const msg = lines[Math.floor(Math.random() * lines.length)];
    setPraise(msg);
    setCharaSpeech(msg);
    speakVoicevox(msg, charaSpeaker[chara]);
    setTimeout(() => { setPraise(''); setCharaSpeech(''); }, 2500);
  };

  useEffect(() => {
    const hour = new Date().getHours();
    setIsNight(hour >= 18 || hour < 6);
    setIsPC(window.innerWidth >= 768);
    const d = new Date();
    const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setNewDate(localToday);
    setFilterDate(localToday);
    loadTasks();
    loadTemplates();
    const handleResize = () => setIsPC(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadTasks = async () => {
    const { data } = await supabase.from('tasks').select('*').order('date').order('time');
    if (data) setTasks(data);
    setLoading(false);
  };

  const loadTemplates = async () => {
    const { data } = await supabase.from('templates').select('*').order('id');
    if (data) setTemplates(data);
  };

  // アラームチェック（10秒ごと）
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hh}:${mm}`;

      tasks.forEach(task => {
        if (task.done) return;
        if (task.date && task.date !== today) return;
        if (task.time === currentTime) {
          if (task.snoozedUntil && task.snoozedUntil > currentTime) return;
          setAlarmTask(task);
          playAlarm();
        }
        // 15分前アラーム
        const taskDate = new Date(`${task.date || today}T${task.time}:00`);
        const diff = (taskDate.getTime() - now.getTime()) / 1000 / 60;
        if (diff > 14.5 && diff < 15.5) {
          playAlarm();
        }
      });
    };
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [tasks]);

  const playAlarm = () => {
    const ctx = new AudioContext();
    const playBeep = (time: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.4);
      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + 0.4);
    };
    playBeep(0); playBeep(0.5); playBeep(1.0);
  };

  const snoozeTask = (taskId: number, minutes: number) => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setTasks(tasks.map(t => t.id === taskId ? { ...t, snoozedUntil: `${hh}:${mm}` } : t));
    setAlarmTask(null);
  };

  // ダブルブッキング検知
  const checkDoubleBooking = (date: string, time: string, endTime: string, buffer: number, excludeId?: number) => {
    if (!time) return false;
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const newStart = toMin(time) - buffer;
    const newEnd = endTime ? toMin(endTime) + buffer : toMin(time) + 30 + buffer;

    return tasks.some(t => {
      if (t.done || t.id === excludeId) return false;
      if (t.date && date && t.date !== date) return false;
      const tStart = toMin(t.time) - (t.buffer || 0);
      const tEnd = t.end_time ? toMin(t.end_time) + (t.buffer || 0) : toMin(t.time) + 30 + (t.buffer || 0);
      return newStart < tEnd && newEnd > tStart;
    });
  };

  const startVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceStatus('このブラウザは音声入力に対応していません'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.onstart = () => { setListening(true); setVoiceStatus('聞いています...話しかけてね 🎤'); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      recognition.stop();
      setNewTask(text);
      setShowForm(true);
      setVoiceStatus('「' + text + '」と聞こえたよ！');
      setListening(false);
    };
    recognition.onerror = () => { setVoiceStatus('もう一度試してみてね'); setListening(false); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const completeTask = async (id: number) => {
    const task = tasks.find(t => t.id === id);
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const updateData: Partial<Task> = { done: true, ...(!task?.date ? { date: todayStr } : {}) };
    await supabase.from('tasks').update(updateData).eq('id', id);
    setTasks(tasks.map(t => t.id === id ? { ...t, ...updateData } : t));
    if (alarmTask?.id === id) setAlarmTask(null);
    showPraise();
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    const isDouble = checkDoubleBooking(newDate, newTime, newEndTime, newBuffer);
    if (isDouble) {
      setWarning('⚠️ この時間帯は他の予定と重なっています！');
      return;
    }
    setWarning('');
    const { data } = await supabase.from('tasks').insert({
      name: newTask,
      time: newTime || '--:--',
      end_time: newEndTime || '',
      date: newDate || '',
      buffer: newBuffer,
      done: false,
    }).select().single();
    if (data) setTasks([...tasks, data]);
    setNewTask(''); setNewTime(''); setNewEndTime(''); setNewBuffer(15); setShowForm(false);
    setVoiceStatus('タスクを声で追加できるよ');
    const addMsg = addLines[chara][Math.floor(Math.random() * addLines[chara].length)];
    setCharaSpeech(addMsg);
    speakVoicevox(addMsg, charaSpeaker[chara]);
    setTimeout(() => setCharaSpeech(''), 2500);
  };

  const addFromTemplate = async (template: Template) => {
    const { data } = await supabase.from('tasks').insert({
      name: template.name,
      time: template.time,
      end_time: '',
      date: filterDate || newDate,
      buffer: 0,
      done: false,
    }).select().single();
    if (data) setTasks([...tasks, data]);
    showPraise();
  };

  const addTemplate = async () => {
    if (!newTemplateName.trim()) return;
    const { data } = await supabase.from('templates').insert({
      name: newTemplateName,
      time: newTemplateTime || '--:--',
    }).select().single();
    if (data) setTemplates([...templates, data]);
    setNewTemplateName(''); setNewTemplateTime(''); setShowTemplateForm(false);
  };

  const deleteTemplate = async (id: number) => {
    await supabase.from('templates').delete().eq('id', id);
    setTemplates(templates.filter(t => t.id !== id));
  };

  const bg = isNight ? '#2E3450' : '#EDD5B8';
  const cardBg = isNight ? '#384068' : '#FAEBD8';
  const headerGrad = isNight ? 'linear-gradient(135deg, #2D3561, #4A3F7A)' : 'linear-gradient(135deg, #F4845F, #F9B347)';
  const greeting = isNight ? 'おつかれさま、利恵さん 🌙\nゆっくり明日の準備をしよう' : 'おはよう、利恵さん ☀️\n今日も一緒に進もうね';

  const filteredTasks = (filterDate
    ? tasks.filter(t => {
        if (t.done && !t.date) return false;
        return !t.date || t.date === filterDate;
      })
    : tasks.filter(t => !t.done)
  ).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.time === '--:--') return 1;
    if (b.time === '--:--') return -1;
    return a.time.localeCompare(b.time);
  });

  const getLocalDate = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const today = getLocalDate(0);
  const tomorrow = getLocalDate(1);

  if (loading) return (
    <main style={{ background: bg, minHeight: '100vh', maxWidth: isPC ? 800 : 375, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: isNight ? '#9B8EC4' : '#C48050', fontSize: 16 }}>読み込み中...</p>
    </main>
  );

  return (
    <main style={{ background: bg, minHeight: '100vh', maxWidth: isPC ? 800 : 375, margin: '0 auto', fontFamily: "'Hiragino Maru Gothic Pro', sans-serif" }}>

      {/* アラームポップアップ */}
      {alarmTask && (
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: isPC ? 800 : 375, height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: isNight ? '#2E3450' : '#FFF8EE', borderRadius: 24, padding: 28, margin: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
            <div style={{ fontWeight: 'bold', fontSize: 18, color: isNight ? '#E8E0F5' : '#4A2E1A', marginBottom: 8 }}>時間だよ！</div>
            <div style={{ fontSize: 15, color: isNight ? '#9B8EC4' : '#C46020', marginBottom: 20 }}>{alarmTask.name}</div>
            <button onClick={() => completeTask(alarmTask.id)} style={{ width: '100%', background: '#7AB87E', color: 'white', border: 'none', borderRadius: 14, padding: '12px', fontSize: 15, fontWeight: 'bold', cursor: 'pointer', marginBottom: 10 }}>完了！</button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[15, 30, 60, 120].map(m => (
                <button key={m} onClick={() => snoozeTask(alarmTask.id, m)} style={{ background: isNight ? '#384068' : '#F0E0CC', color: isNight ? '#9B8EC4' : '#C46020', border: 'none', borderRadius: 12, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>{m}分後</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 励ましメッセージ */}
      {praise && (
        <div style={{ position: 'fixed', top: '40%', left: '50%', transform: 'translateX(-50%)', background: isNight ? '#4A3F7A' : '#F4845F', color: 'white', borderRadius: 20, padding: '16px 32px', fontSize: 20, fontWeight: 'bold', zIndex: 200, boxShadow: '0 8px 30px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' }}>
          {praise}
        </div>
      )}

      {/* ヘッダー */}
      <div style={{ background: headerGrad, padding: '28px 20px 24px', borderRadius: '0 0 24px 24px' }}>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 6 }}>
          {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
        </div>
        <div style={{ color: 'white', fontSize: 18, fontWeight: 'bold', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{greeting}</div>
      </div>

      {/* キャラクター */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {(Object.keys(charaConfig) as Array<keyof typeof charaConfig>).map(key => (
            <button key={key} onClick={() => { setChara(key); const msg = greetLines[key][Math.floor(Math.random() * greetLines[key].length)]; setCharaSpeech(msg); speakVoicevox(msg, charaSpeaker[key]); setTimeout(() => setCharaSpeech(''), 2500); }} style={{ background: chara === key ? (isNight ? '#6B5FA0' : '#F4845F') : (isNight ? '#2D3561' : '#FFF0DC'), color: chara === key ? 'white' : (isNight ? '#9B8EC4' : '#C46020'), border: 'none', borderRadius: 12, padding: '4px 12px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>{charaConfig[key].label}</button>
          ))}
        </div>
        <div style={{ position: 'relative', width: 120, height: 158 }}>
          <img src={charaConfig[chara].img} width={120} height={158} alt={charaConfig[chara].label} style={{ filter: isNight ? 'brightness(0.9)' : 'none' }} />
          {charaSpeech && (
            <div style={{ position: 'absolute', top: -44, left: '50%', transform: 'translateX(-50%)', background: 'white', color: '#4A2E1A', borderRadius: 14, padding: '6px 12px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', boxShadow: '0 3px 12px rgba(0,0,0,0.15)', border: `2px solid ${isNight ? '#6B5FA0' : '#F4845F'}` }}>
              {charaSpeech}
              <div style={{ position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `8px solid ${isNight ? '#6B5FA0' : '#F4845F'}` }} />
            </div>
          )}
        </div>
      </div>

      {/* 音声入力 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 20px 12px' }}>
        <button onClick={startVoice} style={{ width: 80, height: 80, borderRadius: '50%', background: listening ? 'linear-gradient(135deg, #E05050, #F08080)' : isNight ? 'linear-gradient(135deg, #2D3561, #6B5FA0)' : 'linear-gradient(135deg, #F4845F, #F9B347)', border: listening ? '3px solid #FF6060' : 'none', cursor: 'pointer', fontSize: 28, color: 'white', boxShadow: listening ? '0 0 20px rgba(255,100,100,0.5)' : '0 6px 24px rgba(0,0,0,0.2)', transform: listening ? 'scale(1.08)' : 'scale(1)', transition: 'all 0.2s' }}>🎤</button>
        <p style={{ color: isNight ? '#7A70A0' : '#C48050', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{voiceStatus}</p>
      </div>

      {/* 日付フィルター */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ label: '今日', value: today }, { label: '明日', value: tomorrow }, { label: '全て', value: '' }].map(d => (
          <button key={d.value} onClick={() => setFilterDate(d.value)} style={{ background: filterDate === d.value ? (isNight ? '#6B5FA0' : '#F4845F') : (isNight ? '#2D3561' : '#FFF0DC'), color: filterDate === d.value ? 'white' : (isNight ? '#9B8EC4' : '#C46020'), border: 'none', borderRadius: 14, padding: '6px 16px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer', height: 32 }}>{d.label}</button>
        ))}
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ background: isNight ? '#2D3561' : '#FFF0DC', color: isNight ? '#9B8EC4' : '#C46020', border: 'none', borderRadius: 14, padding: '6px 12px', fontSize: 12, cursor: 'pointer', outline: 'none', height: 32 }} />
      </div>

      {/* よく使うタスク */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ color: isNight ? '#9B8EC4' : '#E07B3A', fontSize: 13, fontWeight: 'bold', marginBottom: 10 }}>よく使うタスク</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {templates.map(t => (
            <div key={t.id} style={{ position: 'relative' }}>
              <button onClick={() => addFromTemplate(t)} style={{ background: isNight ? '#2D3561' : '#FFF0DC', color: isNight ? '#E8E0F5' : '#4A2E1A', border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, borderRadius: 12, padding: '8px 28px 8px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
                {t.name}<span style={{ fontSize: 10, color: isNight ? '#9B8EC4' : '#C46020', marginLeft: 4 }}>⏰{t.time}</span>
              </button>
              <button onClick={() => deleteTemplate(t.id)} style={{ position: 'absolute', top: -6, right: -6, background: '#E07B7B', color: 'white', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', lineHeight: '18px', padding: 0 }}>×</button>
            </div>
          ))}
          <button onClick={() => setShowTemplateForm(true)} style={{ background: 'transparent', color: isNight ? '#7A70A0' : '#C48050', border: `1px dashed ${isNight ? '#4D5585' : '#E8C8A0'}`, borderRadius: 12, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>＋ 追加</button>
        </div>
        {showTemplateForm && (
          <div style={{ background: cardBg, borderRadius: 16, padding: '14px', marginBottom: 12 }}>
            <input type="text" placeholder="タスク名" value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 10, marginBottom: 8, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 13, outline: 'none' }} />
            <input type="time" value={newTemplateTime} onChange={e => setNewTemplateTime(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 10, marginBottom: 10, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addTemplate} style={{ flex: 1, background: isNight ? '#4A5E8A' : '#7AB87E', color: 'white', border: 'none', borderRadius: 10, padding: '8px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}>保存</button>
              <button onClick={() => setShowTemplateForm(false)} style={{ flex: 1, background: isNight ? '#384068' : '#F0E0CC', color: isNight ? '#9B8EC4' : '#A0876E', border: 'none', borderRadius: 10, padding: '8px', fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
            </div>
          </div>
        )}
      </div>

      {/* タスク一覧 */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ color: isNight ? '#9B8EC4' : '#E07B3A', fontSize: 13, fontWeight: 'bold', marginBottom: 12 }}>今日のタスク</div>

        {filteredTasks.length === 0 && (
          <div style={{ textAlign: 'center', color: isNight ? '#7A70A0' : '#C48050', fontSize: 14, padding: '20px 0' }}>タスクを追加してみてね！</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: isPC ? 4 : 10 }}>
          {filteredTasks.map(task => isPC ? (
            <div key={task.id} style={{ background: cardBg, borderRadius: 10, padding: '8px 14px', borderLeft: `3px solid ${isNight ? '#6B5FA0' : '#F4845F'}`, opacity: task.done ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 'bold', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 13, flex: 1 }}>{task.done ? '✅ ' : ''}{task.name}</span>
              {task.date && <span style={{ fontSize: 11, color: isNight ? '#7A70A0' : '#A0876E', whiteSpace: 'nowrap' }}>📅 {task.date}</span>}
              <span style={{ fontSize: 11, color: isNight ? '#9B8EC4' : '#C46020', whiteSpace: 'nowrap' }}>⏰ {task.time}{task.end_time ? `〜${task.end_time}` : ''}</span>
              {task.buffer > 0 && <span style={{ fontSize: 10, color: isNight ? '#6B5FA0' : '#A0876E', whiteSpace: 'nowrap' }}>+{task.buffer}分</span>}
              {!task.done && (
                <>
                  <button onClick={() => completeTask(task.id)} style={{ background: '#7AB87E', color: 'white', border: 'none', borderRadius: 14, padding: '4px 12px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>完了</button>
                  {[15, 30, 60, 120].map(m => (
                    <button key={m} onClick={() => snoozeTask(task.id, m)} style={{ background: isNight ? '#2D3561' : '#FFF0DC', color: isNight ? '#9B8EC4' : '#F4845F', border: `1px solid ${isNight ? '#3D4575' : '#F4C89A'}`, borderRadius: 10, padding: '3px 7px', fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>{m}分</button>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div key={task.id} style={{ background: cardBg, borderRadius: 16, padding: '14px 16px', borderLeft: `4px solid ${isNight ? '#6B5FA0' : '#F4845F'}`, opacity: task.done ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 'bold', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 14 }}>{task.done ? '✅ ' : ''}{task.name}</span>
                <span style={{ fontSize: 11, background: isNight ? '#2D3561' : '#FFF0DC', color: isNight ? '#9B8EC4' : '#C46020', padding: '2px 8px', borderRadius: 10 }}>⏰ {task.time}{task.end_time ? `〜${task.end_time}` : ''}</span>
              </div>
              {task.date && <div style={{ fontSize: 11, color: isNight ? '#7A70A0' : '#A0876E', marginBottom: 8 }}>📅 {task.date}{task.buffer > 0 ? ` ＋${task.buffer}分バッファ` : ''}</div>}
              {!task.done && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => completeTask(task.id)} style={{ background: '#7AB87E', color: 'white', border: 'none', borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>完了</button>
                  <span style={{ fontSize: 10, color: isNight ? '#7A70A0' : '#A0876E' }}>スヌーズ：</span>
                  {[15, 30, 60, 120].map(m => (
                    <button key={m} onClick={() => snoozeTask(task.id, m)} style={{ background: isNight ? '#2D3561' : '#FFF0DC', color: isNight ? '#9B8EC4' : '#F4845F', border: `1px solid ${isNight ? '#3D4575' : '#F4C89A'}`, borderRadius: 12, padding: '3px 7px', fontSize: 10, cursor: 'pointer' }}>{m}分</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* タスク追加フォーム */}
        {showForm && (
          <div style={{ background: cardBg, borderRadius: 16, padding: '16px', marginTop: 10 }}>
            {warning && <div style={{ background: '#FFE0E0', color: '#C04040', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 13, fontWeight: 'bold' }}>{warning}</div>}
            <input type="text" placeholder="タスク名を入力" value={newTask} onChange={e => setNewTask(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, marginBottom: 10, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 14, outline: 'none' }} />
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, marginBottom: 10, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 14, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: isNight ? '#9B8EC4' : '#A0876E', marginBottom: 4 }}>開始時刻</div>
                <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 14, outline: 'none' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: isNight ? '#9B8EC4' : '#A0876E', marginBottom: 4 }}>終了時刻</div>
                <input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 14, outline: 'none' }} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: isNight ? '#9B8EC4' : '#A0876E', marginBottom: 6 }}>バッファ時間（前後の余白）</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[0, 15, 30, 60].map(m => (
                  <button key={m} onClick={() => setNewBuffer(m)} style={{ flex: 1, background: newBuffer === m ? (isNight ? '#6B5FA0' : '#F4845F') : (isNight ? '#2D3561' : '#FFF0DC'), color: newBuffer === m ? 'white' : (isNight ? '#9B8EC4' : '#C46020'), border: 'none', borderRadius: 10, padding: '6px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>{m === 0 ? 'なし' : `${m}分`}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addTask} style={{ flex: 1, background: isNight ? '#4A5E8A' : '#7AB87E', color: 'white', border: 'none', borderRadius: 12, padding: '10px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>追加する</button>
              <button onClick={() => { setShowForm(false); setWarning(''); setNewBuffer(15); setVoiceStatus('タスクを声で追加できるよ'); }} style={{ flex: 1, background: isNight ? '#384068' : '#F0E0CC', color: isNight ? '#9B8EC4' : '#A0876E', border: 'none', borderRadius: 12, padding: '10px', fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
            </div>
          </div>
        )}
      </div>

      {/* 追加ボタン */}
      <div style={{ padding: '8px 16px 32px' }}>
        <button onClick={() => setShowForm(true)} style={{ width: '100%', background: isNight ? '#4A5E8A' : '#7AB87E', color: 'white', border: 'none', borderRadius: 16, padding: 14, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}>＋ タスクを追加する</button>
      </div>

    </main>
  );
}
