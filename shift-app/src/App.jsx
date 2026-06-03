import { useState, useEffect } from 'react'
import { db } from './firebase'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'

const LIFF_ID = '2010241032-ZZnZ4cSu'
const ADMIN_USER_ID = 'U929c1383c51e8e5b0e2f2d7965d414db'
const HOURLY_RATE = 1500

const STAFF_COLORS = [
  { bg: '#FF6B6B', light: '#FFE5E5' },
  { bg: '#4ECDC4', light: '#E0F7F6' },
  { bg: '#45B7D1', light: '#E0F4FA' },
  { bg: '#F7B731', light: '#FFF4D6' },
  { bg: '#A55EEA', light: '#F0E0FF' },
  { bg: '#FD9644', light: '#FFF0E0' },
]

const TIME_SLOTS = [
  '8:00','8:30','9:00','9:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00',
]

const LOCATIONS = ['石の口', '吉井', '宿井１', '宿井２', '宿井３', '宿井４', '宿井５', '時貞１', '時貞２', '時貞３', '葛岡１', '葛岡２', '葛岡３', '葛岡４', '瀬戸']

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
function formatPay(hours) {
  return `¥${(hours * HOURLY_RATE).toLocaleString()}`
}

export default function App() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [shifts, setShifts] = useState({})
  const [locations, setLocations] = useState({})
  const [staff, setStaff] = useState([])
  const [modal, setModal] = useState(null)
  const [shiftForm, setShiftForm] = useState({ staffId: '', start: '9:00', end: '17:00', hasBreak: true })
  const [view, setView] = useState('month')
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('synced')
  const [lineUser, setLineUser] = useState(null)
  const [lineUserId, setLineUserId] = useState(null)
  const [registerName, setRegisterName] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [liffReady, setLiffReady] = useState(false)
  const [staffLoaded, setStaffLoaded] = useState(false)
  const [dayDetail, setDayDetail] = useState(null)

  const isAdmin = lineUserId === ADMIN_USER_ID
  const myStaff = staff.find(s => s.lineUserId === lineUserId)
  const needsRegister = liffReady && staffLoaded && !isAdmin && !myStaff

  useEffect(() => {
    if (typeof liff !== 'undefined') {
      liff.init({ liffId: LIFF_ID })
        .then(() => {
          if (liff.isLoggedIn()) {
            liff.getProfile().then(profile => {
              setLineUser({ name: profile.displayName, picture: profile.pictureUrl })
              setLineUserId(profile.userId)
              setLiffReady(true)
            })
          } else {
            liff.login()
          }
        })
        .catch(err => console.error('LIFF init error:', err))
    }
  }, [])

  useEffect(() => {
    const unsubStaff = onSnapshot(doc(db, 'app', 'staff'), snap => {
      const list = snap.exists() ? (snap.data().list || []) : []
      setStaff(list)
      setStaffLoaded(true)
      setLoading(false)
    }, err => { console.error(err); setLoading(false) })

    const unsubShifts = onSnapshot(doc(db, 'app', 'shifts'), snap => {
      if (snap.exists()) setShifts(snap.data().data || {})
      else setShifts({})
    }, err => console.error(err))

    const unsubLocations = onSnapshot(doc(db, 'app', 'locations'), snap => {
      if (snap.exists()) setLocations(snap.data().data || {})
      else setLocations({})
    }, err => console.error(err))

    return () => { unsubStaff(); unsubShifts(); unsubLocations() }
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

  async function saveLocation(day, location) {
    const key = dateKey(year, month, day)
    const updated = { ...locations, [key]: location }
    setLocations(updated)
    setSyncStatus('saving')
    try {
      await setDoc(doc(db, 'app', 'locations'), { data: updated })
      setSyncStatus('synced')
    } catch { setSyncStatus('error') }
  }

  async function registerStaff() {
    const name = registerName.trim()
    if (!name) { setRegisterError('名前を入力してください'); return }
    if (staff.some(s => s.name === name)) { setRegisterError('この名前はすでに登録されています'); return }
    const usedColors = staff.map(s => s.colorIdx)
    const colorIdx = [0,1,2,3,4,5].find(i => !usedColors.includes(i)) ?? staff.length % 6
    const newId = Date.now()
    const updated = [...staff, { id: newId, name, colorIdx, lineUserId }]
    await saveStaff(updated)
    setRegisterName('')
    setRegisterError('')
  }

  // 表示するシフトをフィルタリング（管理者は全員、一般ユーザーは自分のみ）
  function filterShiftsForDisplay(shiftList) {
    if (isAdmin) return shiftList
    if (!myStaff) return []
    return shiftList.filter(sh => sh.staffId === myStaff.id)
  }

  function getShiftsForDate(d) { return shifts[dateKey(year, month, d)] || [] }
  function getVisibleShiftsForDate(d) { return filterShiftsForDisplay(getShiftsForDate(d)) }
  function getLocationForDate(d) { return locations[dateKey(year, month, d)] || '' }
  function getStaffById(id) { return staff.find(s => s.id === id) }
  function canEditShift(sh) {
    if (isAdmin) return true
    return myStaff && sh.staffId === myStaff.id
  }
  function hasShiftOnDay(day, staffId) {
    return getShiftsForDate(day).some(sh => sh.staffId === staffId)
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
    const staffId = Number(shiftForm.staffId)
    if (!isAdmin && myStaff?.id !== staffId) return
    if (hasShiftOnDay(modal.day, staffId)) {
      alert('この日はすでにシフトが入っています')
      return
    }
    const key = dateKey(year, month, modal.day)
    const newShift = { id: Date.now(), staffId, start: shiftForm.start, end: shiftForm.end, hasBreak: shiftForm.hasBreak }
    const updated = { ...shifts, [key]: [...(shifts[key] || []), newShift] }
    setShifts(updated)
    setModal(null)
    await saveShifts(updated)
  }

  function requestDeleteShift(day, shiftId, staffId) {
    if (!canEditShift({ staffId })) return
    const s = getStaffById(staffId)
    setDayDetail(null)
    setDeleteConfirm({ day, shiftId, staffId, name: s?.name || '' })
  }

  async function confirmDeleteShift() {
    if (!deleteConfirm) return
    const { day, shiftId } = deleteConfirm
    const key = dateKey(year, month, day)
    const updated = { ...shifts, [key]: (shifts[key] || []).filter(s => s.id !== shiftId) }
    setShifts(updated)
    setDeleteConfirm(null)
    await saveShifts(updated)
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
    // 管理者は全スタッフ、一般ユーザーは自分のみ
    const targetStaff = isAdmin ? staff : (myStaff ? [myStaff] : [])
    targetStaff.forEach(s => { summary[s.id] = [] })
    for (let d = 1; d <= daysInMonth; d++) {
      getShiftsForDate(d).forEach(sh => {
        if (summary[sh.staffId] !== undefined) {
          summary[sh.staffId].push({ day: d, ...sh })
        }
      })
    }
    return summary
  }
  const staffSummary = getStaffMonthShifts()

  // 自分の月合計（カレンダービュー上部に表示）
  function getMyMonthTotals() {
    if (!myStaff && !isAdmin) return null
    if (isAdmin) return null // 管理者はスタッフ別ビューで見る
    const myShifts = staffSummary[myStaff?.id] || []
    const totalHours = myShifts.reduce((acc, sh) => acc + calcHours(sh.start, sh.end, sh.hasBreak), 0)
    return { days: myShifts.length, hours: totalHours, pay: totalHours * HOURLY_RATE }
  }
  const myMonthTotals = getMyMonthTotals()

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

  if (needsRegister) return (
    <div style={{ minHeight: '100vh', background: '#F8F6F1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', width: '100%', maxWidth: 340, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>👋</div>
        <h2 style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, marginBottom: 6 }}>はじめまして！</h2>
        <p style={{ textAlign: 'center', fontSize: 13, color: '#666', marginBottom: 24 }}>
          あなたの名前を入力して<br />スタッフ登録してください
        </p>
        <input
          value={registerName}
          onChange={e => { setRegisterName(e.target.value); setRegisterError('') }}
          onKeyDown={e => { if (e.key === 'Enter') registerStaff() }}
          placeholder="例：田中 花子"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${registerError ? '#FF6B6B' : '#ddd'}`, fontSize: 15, marginBottom: 8, boxSizing: 'border-box' }}
        />
        {registerError && <p style={{ color: '#FF6B6B', fontSize: 12, marginBottom: 8 }}>{registerError}</p>}
        <button onClick={registerStaff} style={{
          width: '100%', padding: '13px', borderRadius: 10, border: 'none',
          background: '#2D2A26', color: '#F8F6F1', cursor: 'pointer',
          fontSize: 15, fontWeight: 700,
        }}>登録する</button>
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
      {/* ヘッダー */}
      <div style={{ background: '#2D2A26', color: '#F8F6F1', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.18)', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>🌿 草刈りマネタイズ</span>
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
              {v === 'month' ? 'カレンダー' : isAdmin ? 'スタッフ別' : '自分のシフト'}
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
        {/* 月ナビゲーション */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
          <button onClick={prevMonth} style={{ background: '#2D2A26', color: '#F8F6F1', border: 'none', borderRadius: '50%', width: 34, height: 34, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>{year}年 {month+1}月</span>
          <button onClick={nextMonth} style={{ background: '#2D2A26', color: '#F8F6F1', border: 'none', borderRadius: '50%', width: 34, height: 34, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>

        {/* 自分の月次サマリーカード（一般ユーザーのみ、カレンダービュー） */}
        {!isAdmin && myStaff && myMonthTotals && view === 'month' && (
          <div style={{
            background: '#fff',
            border: `2px solid ${STAFF_COLORS[myStaff.colorIdx].bg}`,
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: STAFF_COLORS[myStaff.colorIdx].bg, display: 'inline-block' }} />
              <span style={{ fontWeight: 800, fontSize: 14 }}>{myStaff.name}</span>
              <span style={{ fontSize: 12, color: '#888' }}>今月の実績</span>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>出勤日数</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2D2A26' }}>{myMonthTotals.days}<span style={{ fontSize: 11, fontWeight: 600 }}>日</span></div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>実働時間</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2D2A26' }}>{myMonthTotals.hours}<span style={{ fontSize: 11, fontWeight: 600 }}>時間</span></div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>報酬合計</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#4CAF50' }}>{formatPay(myMonthTotals.hours)}</div>
              </div>
            </div>
          </div>
        )}

        {view === 'month' && (
          <>
            {/* スタッフ凡例：管理者は全員、一般は自分のみ */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {(isAdmin ? staff : (myStaff ? [myStaff] : [])).map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', border: `2px solid ${STAFF_COLORS[s.colorIdx].bg}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: STAFF_COLORS[s.colorIdx].bg, display: 'inline-block' }} />
                  {s.name}
                  {myStaff?.id === s.id && !isAdmin && <span style={{ fontSize: 10, color: '#888' }}>（自分）</span>}
                </div>
              ))}
            </div>

            {/* カレンダー */}
            <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 18px rgba(0,0,0,0.08)', position: 'relative' }}>
              <img
                src='/kusa.png'
                style={{ position: 'absolute', top: 36, left: 0, width: '100%', height: 'calc(100% - 36px)', objectFit: 'cover', opacity: 0.12, pointerEvents: 'none', zIndex: 1 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', position: 'relative', zIndex: 2 }}>
                {WEEKDAYS.map((d, i) => (
                  <div key={d} style={{ textAlign: 'center', padding: '9px 0', fontWeight: 700, fontSize: 12, background: '#2D2A26', color: i===0?'#FF6B6B':i===6?'#4ECDC4':'#F8F6F1', letterSpacing: 1 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, background: '#E8E4DC', position: 'relative', zIndex: 2 }}>
                {cells.map((day, idx) => {
                  const dow = idx % 7
                  const visibleShifts = day ? getVisibleShiftsForDate(day) : []
                  const location = day ? getLocationForDate(day) : ''
                  const canAdd = day && (isAdmin || (!!myStaff && !hasShiftOnDay(day, myStaff.id)))
                  return (
                    <div key={idx} onClick={() => day && setDayDetail(day)}
                      style={{ background: day ? 'rgba(255,255,255,0.82)' : 'rgba(245,243,238,0.82)', minHeight: 80, padding: 4, overflow: 'hidden', minWidth: 0, cursor: day ? 'pointer' : 'default' }}>
                      {day && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{
                              fontWeight: isToday(day) ? 800 : 600, fontSize: 12,
                              color: isToday(day) ? '#fff' : dow===0?'#FF6B6B':dow===6?'#4ECDC4':'#2D2A26',
                              background: isToday(day) ? '#2D2A26' : 'transparent',
                              borderRadius: '50%', width: 20, height: 20,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>{day}</span>
                            {canAdd && (
                              <button onClick={e => {
                                e.stopPropagation()
                                const defaultStaffId = isAdmin ? (staff[0]?.id || '') : myStaff?.id
                                setShiftForm({ staffId: defaultStaffId, start: '9:00', end: '17:00', hasBreak: true })
                                setModal({ type: 'add', day })
                              }} style={{
                                background: '#F7B731', border: 'none', borderRadius: '50%',
                                width: 16, height: 16, fontSize: 12, cursor: 'pointer',
                                color: '#2D2A26', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>+</button>
                            )}
                          </div>
                          {/* 場所は管理者のみ表示 */}
                          {isAdmin && location && (
                            <div style={{
                              background: '#4CAF50', color: '#fff', borderRadius: 3,
                              padding: '1px 3px', fontSize: 8, fontWeight: 700,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              marginBottom: 2,
                            }}>📍{location}</div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {visibleShifts.map(sh => {
                              const s = getStaffById(sh.staffId)
                              if (!s) return null
                              const col = STAFF_COLORS[s.colorIdx]
                              return (
                                <div key={sh.id} style={{
                                  background: col.bg, borderRadius: 4,
                                  padding: '2px 4px', fontSize: 9, fontWeight: 700,
                                  color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {isAdmin ? s.name.split(' ').pop() : '✓'}
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
            {/* 管理者：全スタッフ表示。一般ユーザー：自分のみ */}
            {(isAdmin ? staff : (myStaff ? [myStaff] : [])).map(s => {
              const col = STAFF_COLORS[s.colorIdx]
              const myShifts = staffSummary[s.id] || []
              const totalHours = myShifts.reduce((acc, sh) => acc + calcHours(sh.start, sh.end, sh.hasBreak), 0)
              const totalPay = totalHours * HOURLY_RATE
              return (
                <div key={s.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                  <div style={{ background: col.bg, color: '#fff', padding: '10px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</span>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{myShifts.length}日 / {totalHours}時間</span>
                        {/* 報酬合計バッジ */}
                        <span style={{
                          background: 'rgba(255,255,255,0.25)',
                          borderRadius: 20,
                          padding: '3px 12px',
                          fontSize: 13,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                        }}>
                          💴 {formatPay(totalHours)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '10px 18px' }}>
                    {myShifts.length === 0 ? (
                      <span style={{ color: '#aaa', fontSize: 12 }}>シフトなし</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {myShifts.sort((a,b) => a.day - b.day).map(sh => {
                          const hours = calcHours(sh.start, sh.end, sh.hasBreak)
                          return (
                            <div key={sh.id} style={{ background: col.light, border: `1.5px solid ${col.bg}`, borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>
                              {month+1}/{sh.day}（{WEEKDAYS[new Date(year,month,sh.day).getDay()]}）<br />
                              <span style={{ fontWeight: 400, fontSize: 11, color: '#555' }}>
                                {sh.start}〜{sh.end} {sh.hasBreak ? '☕休憩あり' : '休憩なし'}<br />
                                実働 {hours}時間 / {formatPay(hours)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {/* 月合計フッター */}
                  {myShifts.length > 0 && (
                    <div style={{
                      borderTop: `1.5px solid ${col.light}`,
                      padding: '10px 18px',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 20,
                      background: col.light,
                    }}>
                      <span style={{ fontSize: 12, color: '#555' }}>合計：<strong>{totalHours}時間</strong></span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#2D2A26' }}>今月の報酬：<span style={{ color: '#4CAF50' }}>{formatPay(totalHours)}</span></span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 日付詳細ポップアップ */}
      {dayDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150 }}
          onClick={() => setDayDetail(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px', minWidth: 300, maxWidth: 380, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                {month+1}月{dayDetail}日（{WEEKDAYS[new Date(year,month,dayDetail).getDay()]}）
              </h3>
              <button onClick={() => setDayDetail(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>×</button>
            </div>
            {/* 場所：管理者のみ編集・表示 */}
            {isAdmin && (
              <div style={{ background: '#F0FFF0', border: '1.5px solid #4CAF50', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4CAF50', marginBottom: 6 }}>📍 草刈り場所</div>
                <select
                  value={getLocationForDate(dayDetail)}
                  onChange={e => saveLocation(dayDetail, e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #4CAF50', fontSize: 14, background: '#fff' }}
                >
                  <option value=''>未設定</option>
                  {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}

            {/* シフト一覧：自分のシフトのみ or 管理者は全員 */}
            {filterShiftsForDisplay(getShiftsForDate(dayDetail)).length === 0 ? (
              <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                {isAdmin ? 'シフトなし' : 'この日のシフトはありません'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filterShiftsForDisplay(getShiftsForDate(dayDetail)).map(sh => {
                  const s = getStaffById(sh.staffId)
                  if (!s) return null
                  const col = STAFF_COLORS[s.colorIdx]
                  const hours = calcHours(sh.start, sh.end, sh.hasBreak)
                  const editable = canEditShift(sh)
                  return (
                    <div key={sh.id} style={{ background: col.light, border: `2px solid ${col.bg}`, borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          {isAdmin && <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{s.name}</div>}
                          <div style={{ fontSize: 13, color: '#444' }}>{sh.start}〜{sh.end}</div>
                          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                            {sh.hasBreak ? '☕ 昼休憩あり' : '🚫 昼休憩なし'} ／ 実働 {hours}時間
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#4CAF50', marginTop: 4 }}>
                            💴 {formatPay(hours)}
                          </div>
                        </div>
                        {editable && (
                          <button onClick={() => requestDeleteShift(dayDetail, sh.id, sh.staffId)} style={{
                            background: '#FFE5E5', border: '1.5px solid #FF6B6B', borderRadius: 8,
                            padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#FF6B6B',
                          }}>削除</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {(isAdmin || (!!myStaff && !hasShiftOnDay(dayDetail, myStaff.id))) && (
              <button onClick={() => {
                setDayDetail(null)
                const defaultStaffId = isAdmin ? (staff[0]?.id || '') : myStaff?.id
                setShiftForm({ staffId: defaultStaffId, start: '9:00', end: '17:00', hasBreak: true })
                setModal({ type: 'add', day: dayDetail })
              }} style={{
                width: '100%', marginTop: 14, padding: '11px', borderRadius: 10,
                border: 'none', background: '#2D2A26', color: '#F8F6F1',
                cursor: 'pointer', fontSize: 14, fontWeight: 700,
              }}>＋ シフトを追加</button>
            )}
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', minWidth: 280, maxWidth: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>シフトを削除しますか？</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
              {deleteConfirm.name} の {month+1}月{deleteConfirm.day}日のシフトを削除します。<br />この操作は元に戻せません。
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>キャンセル</button>
              <button onClick={confirmDeleteShift} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#FF6B6B', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* 各種モーダル */}
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
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}{hasShiftOnDay(modal.day, s.id) ? '（登録済み）' : ''}</option>)}
                      </select>
                    </label>
                  )}
                  {!isAdmin && (
                    <div style={{ background: '#F8F6F1', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
                      {myStaff?.name} のシフトを追加
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
                    　報酬：<strong style={{ color: '#4CAF50', fontSize: 14 }}>{formatPay(calcHours(shiftForm.start, shiftForm.end, shiftForm.hasBreak))}</strong>
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
                <p style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>※ スタッフは自分で名前を入力して登録します</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
