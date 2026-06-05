'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

type Task = {
  id: number;
  name: string;
  time: string;
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newTime, setNewTime] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('タスクを声で追加できるよ');
  const [alarmTask, setAlarmTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [praise, setPraise] = useState('');
  const [templates, setTemplates] = useState<Template[]>([
    { id: 1, name: '朝のスケジュール確認', time: '8:00' },
    { id: 2, name: 'タスクの整理', time: '9:00' },
    { id: 3, name: 'アイデアを出す', time: '10:00' },
  ]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateTime, setNewTemplateTime] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const praiseMessages = ['やったね！✨', 'すごい！その調子！', '一歩前進！🎉', 'よくできました！', '素晴らしい！🌟'];

  const showPraise = () => {
    const msg = praiseMessages[Math.floor(Math.random() * praiseMessages.length)];
    setPraise(msg);
    setTimeout(() => setPraise(''), 2000);
  };

  useEffect(() => {
    const hour = new Date().getHours();
    setIsNight(hour >= 18 || hour < 6);
    loadTasks();
  }, []);

  const loadTasks = async () => {
    const { data } = await supabase.from('tasks').select('*').order('id');
    if (data) setTasks(data);
    setLoading(false);
  };

  // アラームチェック（10秒ごと）
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hh}:${mm}`;
      tasks.forEach(task => {
        if (!task.done && task.time === currentTime) {
          if (task.snoozedUntil && task.snoozedUntil > currentTime) return;
          setAlarmTask(task);
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
    await supabase.from('tasks').update({ done: true }).eq('id', id);
    setTasks(tasks.map(t => t.id === id ? { ...t, done: true } : t));
    if (alarmTask?.id === id) setAlarmTask(null);
    showPraise();
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    const { data } = await supabase.from('tasks').insert({
      name: newTask,
      time: newTime || '--:--',
      done: false,
    }).select().single();
    if (data) setTasks([...tasks, data]);
    setNewTask(''); setNewTime(''); setShowForm(false);
    setVoiceStatus('タスクを声で追加できるよ');
  };

  const addFromTemplate = async (template: Template) => {
    const { data } = await supabase.from('tasks').insert({
      name: template.name,
      time: template.time,
      done: false,
    }).select().single();
    if (data) setTasks([...tasks, data]);
    showPraise();
  };

  const addTemplate = () => {
    if (!newTemplateName.trim()) return;
    setTemplates([...templates, {
      id: Date.now(),
      name: newTemplateName,
      time: newTemplateTime || '--:--',
    }]);
    setNewTemplateName('');
    setNewTemplateTime('');
    setShowTemplateForm(false);
  };

  const deleteTemplate = (id: number) => {
    setTemplates(templates.filter(t => t.id !== id));
  };

  const bg = isNight ? '#2E3450' : '#EDD5B8';
  const cardBg = isNight ? '#384068' : '#FAEBD8';
  const headerGrad = isNight ? 'linear-gradient(135deg, #2D3561, #4A3F7A)' : 'linear-gradient(135deg, #F4845F, #F9B347)';
  const greeting = isNight ? 'おつかれさま、利恵さん 🌙\nゆっくり明日の準備をしよう' : 'おはよう、利恵さん ☀️\n今日も一緒に進もうね';

  const isPC = typeof window !== 'undefined' && window.innerWidth >= 768;

  if (loading) return (
    <main style={{ background: bg, minHeight: '100vh', maxWidth: isPC ? 800 : 375, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: isNight ? '#9B8EC4' : '#C48050', fontSize: 16 }}>読み込み中...</p>
    </main>
  );

  return (
    <main style={{ background: bg, minHeight: '100vh', maxWidth: isPC ? 800 : 375, margin: '0 auto', fontFamily: "'Hiragino Maru Gothic Pro', sans-serif" }}>

      {alarmTask && (
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: 375, height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
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

      <div style={{ background: headerGrad, padding: '28px 20px 24px', borderRadius: '0 0 24px 24px' }}>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 6 }}>
          {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
        </div>
        <div style={{ color: 'white', fontSize: 18, fontWeight: 'bold', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{greeting}</div>
      </div>

      {/* 励ましメッセージ */}
      {praise && (
        <div style={{
          position: 'fixed', top: '40%', left: '50%', transform: 'translateX(-50%)',
          background: isNight ? '#4A3F7A' : '#F4845F',
          color: 'white', borderRadius: 20, padding: '16px 32px',
          fontSize: 20, fontWeight: 'bold', zIndex: 200,
          boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          animation: 'fadeIn 0.3s ease',
          whiteSpace: 'nowrap'
        }}>
          {praise}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 20px 20px' }}>
        <button onClick={startVoice} style={{
          width: 88, height: 88, borderRadius: '50%',
          background: listening ? 'linear-gradient(135deg, #E05050, #F08080)' : isNight ? 'linear-gradient(135deg, #2D3561, #6B5FA0)' : 'linear-gradient(135deg, #F4845F, #F9B347)',
          border: listening ? '3px solid #FF6060' : 'none', cursor: 'pointer', fontSize: 32, color: 'white',
          boxShadow: listening ? '0 0 20px rgba(255,100,100,0.5)' : '0 6px 24px rgba(0,0,0,0.2)',
          transform: listening ? 'scale(1.08)' : 'scale(1)', transition: 'all 0.2s'
        }}>🎤</button>
        <p style={{ color: isNight ? '#7A70A0' : '#C48050', fontSize: 12, marginTop: 10, textAlign: 'center' }}>{voiceStatus}</p>
      </div>

      {/* よく使うタスク */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ color: isNight ? '#9B8EC4' : '#E07B3A', fontSize: 13, fontWeight: 'bold', marginBottom: 10 }}>よく使うタスク</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {templates.map(t => (
            <div key={t.id} style={{ position: 'relative' }}>
              <button onClick={() => addFromTemplate(t)} style={{
                background: isNight ? '#2D3561' : '#FFF0DC',
                color: isNight ? '#E8E0F5' : '#4A2E1A',
                border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`,
                borderRadius: 12, padding: '8px 28px 8px 12px',
                fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
              }}>
                {t.name}
                <span style={{ fontSize: 10, color: isNight ? '#9B8EC4' : '#C46020', marginLeft: 4 }}>⏰{t.time}</span>
              </button>
              <button onClick={() => deleteTemplate(t.id)} style={{
                position: 'absolute', top: -6, right: -6,
                background: '#E07B7B', color: 'white', border: 'none',
                borderRadius: '50%', width: 18, height: 18,
                fontSize: 10, cursor: 'pointer', lineHeight: '18px', padding: 0
              }}>×</button>
            </div>
          ))}
          <button onClick={() => setShowTemplateForm(true)} style={{
            background: 'transparent',
            color: isNight ? '#7A70A0' : '#C48050',
            border: `1px dashed ${isNight ? '#4D5585' : '#E8C8A0'}`,
            borderRadius: 12, padding: '8px 12px',
            fontSize: 12, cursor: 'pointer',
          }}>＋ 追加</button>
        </div>

        {showTemplateForm && (
          <div style={{ background: cardBg, borderRadius: 16, padding: '14px', marginBottom: 12 }}>
            <input type="text" placeholder="タスク名" value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 10, marginBottom: 8, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 13, outline: 'none' }} />
            <input type="time" value={newTemplateTime} onChange={e => setNewTemplateTime(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 10, marginBottom: 10, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addTemplate} style={{ flex: 1, background: isNight ? '#4A5E8A' : '#7AB87E', color: 'white', border: 'none', borderRadius: 10, padding: '8px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}>保存</button>
              <button onClick={() => setShowTemplateForm(false)} style={{ flex: 1, background: isNight ? '#384068' : '#F0E0CC', color: isNight ? '#9B8EC4' : '#A0876E', border: 'none', borderRadius: 10, padding: '8px', fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ color: isNight ? '#9B8EC4' : '#E07B3A', fontSize: 13, fontWeight: 'bold', marginBottom: 12 }}>今日のタスク</div>

        {tasks.length === 0 && (
          <div style={{ textAlign: 'center', color: isNight ? '#7A70A0' : '#C48050', fontSize: 14, padding: '20px 0' }}>
            タスクを追加してみてね！
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isPC ? '1fr 1fr' : '1fr', gap: 10 }}>
        {tasks.map(task => (
          <div key={task.id} style={{ background: cardBg, borderRadius: 16, padding: '14px 16px', marginBottom: 0, borderLeft: `4px solid ${isNight ? '#6B5FA0' : '#F4845F'}`, opacity: task.done ? 0.5 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 'bold', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 14 }}>
                {task.done ? '✅ ' : ''}{task.name}
              </span>
              <span style={{ fontSize: 11, background: isNight ? '#2D3561' : '#FFF0DC', color: isNight ? '#9B8EC4' : '#C46020', padding: '2px 8px', borderRadius: 10 }}>⏰ {task.time}</span>
            </div>
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

        {showForm && (
          <div style={{ background: cardBg, borderRadius: 16, padding: '16px', marginBottom: 10 }}>
            <input type="text" placeholder="タスク名を入力" value={newTask} onChange={e => setNewTask(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, marginBottom: 10, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 14, outline: 'none' }} />
            <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, marginBottom: 12, border: `1px solid ${isNight ? '#4D5585' : '#E8C8A0'}`, background: isNight ? '#2E3450' : '#FFF8EE', color: isNight ? '#E8E0F5' : '#4A2E1A', fontSize: 14, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addTask} style={{ flex: 1, background: isNight ? '#4A5E8A' : '#7AB87E', color: 'white', border: 'none', borderRadius: 12, padding: '10px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>追加する</button>
              <button onClick={() => { setShowForm(false); setVoiceStatus('タスクを声で追加できるよ'); }} style={{ flex: 1, background: isNight ? '#384068' : '#F0E0CC', color: isNight ? '#9B8EC4' : '#A0876E', border: 'none', borderRadius: 12, padding: '10px', fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '8px 16px 32px' }}>
        <button onClick={() => setShowForm(true)} style={{ width: '100%', background: isNight ? '#4A5E8A' : '#7AB87E', color: 'white', border: 'none', borderRadius: 16, padding: 14, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}>＋ タスクを追加する</button>
      </div>

    </main>
  );
}
