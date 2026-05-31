import { useState, useEffect } from 'react'
import { db } from './firebase'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'

const LIFF_ID = '2010241032-ZZnZ4cSu'
const ADMIN_USER_ID = 'U929c1383c51e8e5b0e2f2d7965d414db'

const STAFF_COLORS = [
  { bg: '#FF6B6B', light: '#FFE5E5' },
  { bg: '#4ECDC4', light: '#E0F7F6' },
  { bg: '#45B7D1', light: '#E0F4FA' },
  { bg: '#F7B731', light: '#FFF4D6' },
  { bg: '#A55EEA', light: '#F0E0FF' },
  { bg: '#FD9644', light: '#FFF0E0' },
]

const TIME_SLOTS = [
  '8:00','9:00','10:00','11:00','12:00','13:00',
  '14:00','15:00','16:00','17:00','18:00','19:00',
  '20:00','21:00','22:00',
]

const WEEKDAYS = ['日','月','火','水','木','金','土']

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function getFirstDay(y, m) { return new Date(y, m, 1).getDay() }
function dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function calcHours(start, end, hasBreak) {
  const [h1,m1] = start.split(':').map(Number)
  const [h2,m2] = end.split(':').map(Number)
  const hours = (h2*60+m2-h1*60-m1)/60
  return hasBreak ? Math.max(0, hours - 1) : hours
}

export default function App() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [shifts, setShifts] = useState({})
  const [staff, setStaff] = useState([])
  const [modal, setModal] = useState(null)
  const [newStaffName, setNewStaffName] = useState('')
  const [shiftForm, setShiftForm] = useState({ staffId: '', start: '9:00', end: '17:00', hasBreak: true })
  const [view, setView] = useState('month')
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('synced')
  const [lineUser, setLineUser] = useState(null)
  const [lineUserId, setLineUserId] = useState(null)
  const [myStaffId, setMyStaffId] = useState(null) // 自分のスタッフID
  const [selectingName, setSelectingName] = useState(false) // 名前選択画面

  const isAdmin = lineUserId === ADMIN_USER_ID

  // LIFF初期化
  useEffect(() => {
    if (typeof liff !== 'undefined') {
      liff.init({ liffId: LIFF_ID })
        .then(() => {
          if (liff.isLoggedIn()) {
            liff.getProfile().then(profile => {
              setLineUser({ name: profile.displayName, picture: profile.pictureUrl })
              setLineUserId(profile.userId)
              // ローカルに保存したスタッフIDを読み込む
              const saved = localStorage.getItem('myStaffId_' + profile.userId)
              if (saved) setMyStaffId(Number(saved))
              else if (profile.userId !== ADMIN_USER_ID) setSelectingName(true)
            })
          } else {
            liff.login()
          }
        })
        .catch(err => console.error('LIFF init error:', err))
    }
  }, [])

  // Firestore リアルタイム同期
  useEffect(() => {
    const unsubStaff = onSnapshot(doc(db, 'app', 'staff'), snap => {
      if (snap.exists()) {
        setStaff(snap.data().list || [])
      } else {
        const defaults = [
          { id: 1, name: '田中 花子', colorIdx: 0 },
          { id: 2, name: '鈴木 太郎', colorIdx: 1 },
        ]
        setDoc(doc(db, 'app', 'staff'), { list: defaults })
        setStaff(defaults)
      }
      setLoading(false)
    }, err => { console.error(err); setLoading(false) })

    const unsubShifts = onSnapshot(doc(db, 'app', 'shifts'), snap => {
      if (snap.exists()) setShifts(snap.data().data || {})
      else setShifts({})
    }, err => console.error(err))

    return () => { unsubStaff(); unsubShifts() }
  }, [])

  async function saveShifts(updated) {
    setSyncStatus('saving')
    try {
      await setDoc(doc(db, 'app', 'shifts'), { data: updated })
      setSyncStatus('synced')
    } catch { setSyncStatus('error') }
  }

  async function saveStaff(updated) {
    setSyncStatus('saving')
    try {
      await setDoc(doc(db, 'app', 'staff'), { list: updated })
      setSyncStatus('synced')
    } catch { setSyncStatus('error') }
  }

  function selectMyName(staffId) {
    setMyStaffId(staffId)
    if (lineUserId) localStorage.setItem('myStaffId_' + lineUserId, String(staffId))
    setSelectingName(false)
  }

  function getShiftsForDate(d) { return shifts[dateKey(year, month, d)] || [] }
  function getStaffById(id) { return staff.find(s => s.id === id) }

  function canEditShift(sh) {
    if (isAdmin) return true
    return myStaffId && sh.staffId === myStaffId
  }

  function canAddShiftFor(staffId) {
    if (isAdmin) return true
    return myStaffId && staffId === myStaffId
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function addShift() {
    if (!shiftForm.staffId) return
    if (!canAddShiftFor(Number(shiftForm.staffId))) return
    const key = dateKey(year, month, modal.day)
    const newShift = {
      id: Date.now(),
      staffId: Number(shiftForm.staffId),
      start: shiftForm.start,
      end: shiftForm.end,
      hasBreak: shiftForm.hasBreak,
    }
    const updated = { ...shifts, [key]: [...(shifts[key] || []), newShift] }
    setShifts(updated)
    setModal(null)
    await saveShifts(updated)
  }

  async function deleteShift(day, shiftId, staffId) {
    if (!canEditShift({ staffId })) return
    const key = dateKey(year, month, day)
    const updated = { ...shifts, [key]: (shifts[key] || []).filter(s => s.id !== shiftId) }
    setShifts(updated)
    await saveShifts(updated)
  }

  async function addStaff() {
    if (!newStaffName.trim() || !isAdmin) return
    const usedColors = staff.map(s => s.colorIdx)
    const colorIdx = [0,1,2,3,4,5].find(i => !usedColors.includes(i)) ?? staff.length % 6
    const updated = [...staff, { id: Date.now(), name: newStaffName.trim(), colorIdx }]
    setStaff(updated)
    setNewStaffName('')
    await saveStaff(updated)
  }

  async function removeStaff(id) {
    if (!isAdmin) return
    const updatedStaff = staff.filter(s => s.id !== id)
    const updatedShifts = {}
    for (const key in shifts) {
      updatedShifts[key] = shifts[key].filter(sh => sh.staffId !== id)
    }
    setStaff(updatedStaff)
    setShifts(updatedShifts)
    await Promise.all([saveStaff(updatedStaff), saveShifts(updatedShifts)])
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDay(year, month)

  function getStaffMonthShifts() {
    const summary = {}
    staff.forEach(s => { summary[s.id] = [] })
    for (let d = 1; d <= daysInMonth; d++) {
      getShiftsForDate(d).forEach(sh => {
        if (summary[sh.staffId]) summary[sh.staffId].push({ day: d, ...sh })
      })
    }
    return summary
  }
  const staffSummary = getStaffMonthShifts()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const isToday = d =>
    d && today.getFullYear() === year &&
    today.getMonth() === month && today.getDate() === d

  const syncBadge = {
    synced: { bg: '#4ECDC4', label: '✓ 同期済み' },
    saving: { bg: '#F7B731', label: '⏳ 保存中…' },
    error:  { bg: '#FF6B6B', label: '⚠ エラー' },
  }[syncStatus]

  // 名前選択画面
  if (selectingName) return (
    <div style={{ minHeight: '100vh', background: '#F8F6F1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 340, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>👋</div>
        <h2 style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, marginBottom: 6 }}>はじめまして！</h2>
        <p style={{ textAlign: 'center', fontSize: 13, color: '#666', marginBottom: 20 }}>あなたの名前を選んでください</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {staff.map(s => (
            <button key={s.id} onClick={() => selectMyName(s.id)} style={{
              padding: '12px 16px', borderRadius: 10, border: `2px solid ${STAFF_COLORS[s.colorIdx].bg}`,
              background: STAFF_COLORS[s.colorIdx].light, cursor: 'pointer',
              fontSize: 15, fontWeight: 700, color: '#2D2A26',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: STAFF_COLORS[s.colorIdx].bg, display: 'inline-block' }} />
              {s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8F6F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 14 }}>📅</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#2D2A26' }}>読み込み中…</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F6F1', color: '#2D2A26' }}>
      <div style={{ background: '#2D2A26', color: '#F8F6F1', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.18)', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>📅 シフト管理</span>
          {isAdmin && <span style={{ background: '#F7B731', color: '#2D2A26', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>管理者</span>}
          <span style={{ background: syncBadge.bg, color: '#2D2A26', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{syncBadge.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {lineUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {lineUser.picture && <img src={lineUser.picture} style={{ width: 26, height: 26, borderRadius: '50%' }} />}
              <span style={{ fontSize: 12, fontWeight: 600 }}>{lineUser.name}</span>
            </div>
          )}
          {['month','staff'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 12px', borderRadius: 20, border: 'none',
              background: view === v ? '#F7B731' : 'rgba(255,255,255,0.13)',
              color: view === v ? '#2D2A26' : '#F8F6F1',
              fontWeight: 700, cursor: 'pointer', fontSize: 12,
            }}>
              {v === 'month' ? 'カレンダー' : 'スタッフ別'}
            </button>
          ))}
          {isAdmin && (
            <button onClick={() => setModal({ type: 'staffEdit' })} style={{
              padding: '5px 12px', borderRadius: 20, border: 'none',
              background: 'rgba(255,255,255,0.13)', color: '#F8F6F1',
              fontWeight: 700, cursor: 'pointer', fontSize: 12,
            }}>⚙ スタッフ管理</button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
          <button onClick={prevMonth} style={{ background: '#2D2A26', color: '#F8F6F1', border: 'none', borderRadius: '50%', width: 34, height: 34, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>{year}年 {month+1}月</span>
          <button onClick={nextMonth} style={{ background: '#2D2A26', color: '#F8F6F1', border: 'none', borderRadius: '50%', width: 34, height: 34, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>

        {view === 'month' && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {staff.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', border: `2px solid ${STAFF_COLORS[s.colorIdx].bg}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: STAFF_COLORS[s.colorIdx].bg, display: 'inline-block' }} />
                  {s.name}
                  {myStaffId === s.id && !isAdmin && <span style={{ fontSize: 10, color: '#888' }}>（自分）</span>}
                </div>
              ))}
            </div>
            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 18px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {WEEKDAYS.map((d, i) => (
                  <div key={d} style={{ textAlign: 'center', padding: '9px 0', fontWeight: 700, fontSize: 12, background: '#2D2A26', color: i===0?'#FF6B6B':i===6?'#4ECDC4':'#F8F6F1', letterSpacing: 1 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, background: '#E8E4DC' }}>
                {cells.map((day, idx) => {
                  const dow = idx % 7
                  const dayShifts = day ? getShiftsForDate(day) : []
                  const canAdd = isAdmin || !!myStaffId
                  return (
                    <div key={idx} style={{ background: day ? '#fff' : '#F5F3EE', minHeight: 86, padding: 5 }}>
                      {day && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{
                              fontWeight: isToday(day) ? 800 : 600, fontSize: 13,
                              color: isToday(day) ? '#fff' : dow===0?'#FF6B6B':dow===6?'#4ECDC4':'#2D2A26',
                              background: isToday(day) ? '#2D2A26' : 'transparent',
                              borderRadius: '50%', width: 22, height: 22,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>{day}</span>
                            {canAdd && (
                              <button onClick={() => {
                                const defaultStaffId = isAdmin ? (staff[0]?.id || '') : myStaffId
                                setShiftForm({ staffId: defaultStaffId, start: '9:00', end: '17:00', hasBreak: true })
                                setModal({ type: 'add', day })
                              }} style={{
                                background: '#F7B731', border: 'none', borderRadius: '50%',
                                width: 18, height: 18, fontSize: 13, cursor: 'pointer',
                                color: '#2D2A26', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>+</button>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {dayShifts.map(sh => {
                              const s = getStaffById(sh.staffId)
                              if (!s) return null
                              const col = STAFF_COLORS[s.colorIdx]
                              const editable = canEditShift(sh)
                              return (
                                <div key={sh.id} style={{ background: col.light, borderLeft: `3px solid ${col.bg}`, borderRadius: '0 4px 4px 0', padding: '2px 4px', fontSize: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 62 }}>
                                    {s.name.split(' ').pop()}<br />
                                    <span style={{ fontWeight: 400, color: '#666' }}>{sh.start}〜{sh.end}{sh.hasBreak ? '☕' : ''}</span>
                                  </span>
                                  {editable && (
                                    <button onClick={() => deleteShift(day, sh.id, sh.staffId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 11, padding: '0 1px' }}>×</button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {view === 'staff' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {staff.map(s => {
              const col = STAFF_COLORS[s.colorIdx]
              const myShifts = staffSummary[s.id] || []
              const totalHours = myShifts.reduce((acc, sh) => acc + calcHours(sh.start, sh.end, sh.hasBreak), 0)
              return (
                <div key={s.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                  <div style={{ background: col.bg, color: '#fff', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{myShifts.length}日出勤 / {totalHours}時間</span>
                  </div>
                  <div style={{ padding: '10px 18px' }}>
                    {myShifts.length === 0 ? (
                      <span style={{ color: '#aaa', fontSize: 12 }}>シフトなし</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {myShifts.sort((a,b) => a.day - b.day).map(sh => (
                          <div key={sh.id} style={{ background: col.light, border: `1.5px solid ${col.bg}`, borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>
                            {month+1}/{sh.day}（{WEEKDAYS[new Date(year,month,sh.day).getDay()]}）<br />
                            <span style={{ fontWeight: 400, fontSize: 11, color: '#555' }}>
                              {sh.start}〜{sh.end} {sh.hasBreak ? '☕休憩あり' : '休憩なし'}<br />
                              実働 {calcHours(sh.start, sh.end, sh.hasBreak)}時間
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', minWidth: 300, maxWidth: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            {modal.type === 'add' && (
              <>
                <h3 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 800 }}>{month+1}月{modal.day}日 シフト追加</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {isAdmin && (
                    <label style={{ fontWeight: 700, fontSize: 13 }}>スタッフ
                      <select value={shiftForm.staffId} onChange={e => setShiftForm(f => ({ ...f, staffId: e.target.value }))}
                        style={{ display: 'block', width: '100%', marginTop: 3, padding: '7px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13 }}>
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                  )}
                  {!isAdmin && (
                    <div style={{ background: '#F8F6F1', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
                      {getStaffById(myStaffId)?.name} のシフトを追加
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[['start','開始'],['end','終了']].map(([key, label]) => (
                      <label key={key} style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{label}
                        <select value={shiftForm[key]} onChange={e => setShiftForm(f => ({ ...f, [key]: e.target.value }))}
                          style={{ display: 'block', width: '100%', marginTop: 3, padding: '7px 8px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13 }}>
                          {TIME_SLOTS.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <label style={{ fontWeight: 700, fontSize: 13 }}>昼休憩
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {[true, false].map(val => (
                        <button key={String(val)} onClick={() => setShiftForm(f => ({ ...f, hasBreak: val }))} style={{
                          flex: 1, padding: '8px', borderRadius: 8,
                          border: `2px solid ${shiftForm.hasBreak === val ? '#4ECDC4' : '#ddd'}`,
                          background: shiftForm.hasBreak === val ? '#E0F7F6' : '#fff',
                          cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        }}>
                          {val ? '☕ あり（−1時間）' : '🚫 なし'}
                        </button>
                      ))}
                    </div>
                  </label>
                  <div style={{ background: '#F8F6F1', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#666', textAlign: 'center' }}>
                    実働時間：<strong style={{ color: '#2D2A26', fontSize: 14 }}>{calcHours(shiftForm.start, shiftForm.end, shiftForm.hasBreak)}時間</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                  <button onClick={() => setModal(null)} style={{ padding: '7px 18px', borderRadius: 7, border: '1.5px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>キャンセル</button>
                  <button onClick={addShift} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: '#2D2A26', color: '#F8F6F1', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>追加</button>
                </div>
              </>
            )}
            {modal.type === 'staffEdit' && isAdmin && (
              <>
                <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800 }}>スタッフ管理</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {staff.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: STAFF_COLORS[s.colorIdx].light, borderRadius: 7, padding: '7px 12px', border: `1.5px solid ${STAFF_COLORS[s.colorIdx].bg}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: STAFF_COLORS[s.colorIdx].bg, display: 'inline-block' }} />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                      </div>
                      <button onClick={() => removeStaff(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF6B6B', fontWeight: 700, fontSize: 15 }}>削除</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <input value={newStaffName} onChange={e => setNewStaffName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addStaff() }}
                    placeholder="新しいスタッフ名"
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13 }} />
                  <button onClick={addStaff} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#2D2A26', color: '#F8F6F1', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>追加</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                  <button onClick={() => setModal(null)} style={{ padding: '7px 20px', borderRadius: 7, border: '1.5px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>閉じる</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
