import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  PanResponder, Dimensions,
} from 'react-native'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'

// Cell size — 7 equal columns filling the sheet's horizontal padding
const SHEET_H_PAD = spacing.md  // each side
const CELL_SIZE = Math.floor((Dimensions.get('window').width - SHEET_H_PAD * 2) / 7)

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

export function getToday() {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateLabel(dateStr) {
  const today = getToday()
  if (dateStr === today) return 'Today'
  const yd = new Date()
  yd.setDate(yd.getDate() - 1)
  const ydStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`
  if (dateStr === ydStr) return 'Yesterday'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function toDateStr(year, month0, day) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Build calendar grid for a given year/month (month is 0-indexed)
// Returns an array of cell objects; always a multiple of 7, min 35 cells
// ---------------------------------------------------------------------------
function buildGrid(year, month) {
  const firstDow = new Date(year, month, 1).getDay()      // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const prevM = month === 0 ? 11 : month - 1
  const prevY = month === 0 ? year - 1 : year
  const nextM = month === 11 ? 0 : month + 1
  const nextY = month === 11 ? year + 1 : year

  const cells = []

  // Pad with trailing days from previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, month: prevM, year: prevY, current: false })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month, year, current: true })
  }

  // Pad to complete the last row
  let nd = 1
  while (cells.length % 7 !== 0) {
    cells.push({ day: nd++, month: nextM, year: nextY, current: false })
  }

  // Ensure at least 5 rows (35 cells) so the sheet height stays stable
  while (cells.length < 35) {
    cells.push({ day: nd++, month: nextM, year: nextY, current: false })
  }

  return cells
}

// ---------------------------------------------------------------------------
// CalendarModal (internal)
// ---------------------------------------------------------------------------
function CalendarModal({ visible, date, onSelect, onClose }) {
  const [viewYear, setViewYear] = useState(() => new Date(date + 'T12:00:00').getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date(date + 'T12:00:00').getMonth())

  // Sync view to selected date whenever the modal opens
  useEffect(() => {
    if (visible) {
      const d = new Date(date + 'T12:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [visible, date])

  const today = getToday()

  // Keep refs current so PanResponder closure always reads fresh values
  const monthRef = useRef(viewMonth)
  const yearRef = useRef(viewYear)
  useEffect(() => { monthRef.current = viewMonth }, [viewMonth])
  useEffect(() => { yearRef.current = viewYear }, [viewYear])

  function prevMonth() {
    const m = monthRef.current, y = yearRef.current
    if (m === 0) { setViewMonth(11); setViewYear(y - 1) }
    else setViewMonth(m - 1)
  }

  function nextMonth() {
    const m = monthRef.current, y = yearRef.current
    if (m === 11) { setViewMonth(0); setViewYear(y + 1) }
    else setViewMonth(m + 1)
  }

  // Horizontal swipe on the grid → change month (cancels day-tap when swiping)
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 12,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50) nextMonth()
        else if (g.dx > 50) prevMonth()
      },
    })
  ).current

  const cells = buildGrid(viewYear, viewMonth)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={calSt.backdrop}>
        {/* Dim area above sheet — tap to dismiss */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={calSt.sheet}>
          {/* Drag handle */}
          <View style={calSt.handle} />

          {/* Month navigation */}
          <View style={calSt.monthNav}>
            <TouchableOpacity
              onPress={prevMonth}
              style={calSt.navBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={calSt.navArrow}>‹</Text>
            </TouchableOpacity>

            <Text style={calSt.monthLabel}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>

            <TouchableOpacity
              onPress={nextMonth}
              style={calSt.navBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={calSt.navArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day-of-week header */}
          <View style={calSt.weekRow}>
            {DOW.map(d => (
              <View key={d} style={calSt.weekCell}>
                <Text style={calSt.weekLabel}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar grid — swipe left/right to change month */}
          <View {...pan.panHandlers} style={calSt.grid}>
            {cells.map((cell, i) => {
              const cellStr = cell.current
                ? toDateStr(cell.year, cell.month, cell.day)
                : null
              const isSelected = cellStr === date
              const isToday = cellStr === today

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    calSt.dayCell,
                    isSelected && calSt.dayCellSelected,
                    !isSelected && isToday && calSt.dayCellToday,
                  ]}
                  onPress={() => cell.current && onSelect(cellStr)}
                  activeOpacity={cell.current ? 0.6 : 1}
                >
                  <Text
                    style={[
                      calSt.dayText,
                      !cell.current && calSt.dayTextOther,
                      isSelected && calSt.dayTextSelected,
                      !isSelected && isToday && calSt.dayTextToday,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Cancel button */}
          <TouchableOpacity onPress={onClose} style={calSt.cancelBtn} activeOpacity={0.7}>
            <Text style={calSt.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// DateHeader (exported default)
// ---------------------------------------------------------------------------
export default function DateHeader({ date, onChange }) {
  const [showCalendar, setShowCalendar] = useState(false)
  const today = getToday()
  const isToday = date === today

  return (
    <View style={styles.wrapper}>
      {/* ‹  date label  › strip */}
      <View style={styles.strip}>
        <TouchableOpacity
          onPress={() => onChange(addDays(date, -1))}
          style={styles.arrowBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.arrow}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowCalendar(true)}
          style={styles.dateBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.dateLabel}>{formatDateLabel(date)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onChange(addDays(date, 1))}
          style={styles.arrowBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* "Back to Today" chip — visible when on a past or future date */}
      {!isToday && (
        <TouchableOpacity
          onPress={() => onChange(today)}
          style={styles.todayChip}
          activeOpacity={0.7}
        >
          <Text style={styles.todayChipText}>Back to Today</Text>
        </TouchableOpacity>
      )}

      <CalendarModal
        visible={showCalendar}
        date={date}
        onSelect={(d) => { onChange(d); setShowCalendar(false) }}
        onClose={() => setShowCalendar(false)}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    alignSelf: 'center',
  },
  arrowBtn: {
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    lineHeight: 26,
  },
  dateBtn: {
    paddingHorizontal: spacing.md,
  },
  dateLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  todayChip: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    alignSelf: 'center',
  },
  todayChipText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textLight,
    letterSpacing: 0.2,
  },
})

const calSt = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: spacing.sm,
    paddingHorizontal: SHEET_H_PAD,
    paddingBottom: 40,
  },

  // Drag handle pill at top of sheet
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },

  // Month navigation row
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
    lineHeight: 32,
  },
  monthLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    letterSpacing: -0.3,
  },

  // Day-of-week header
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekCell: {
    width: CELL_SIZE,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Calendar grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
  },
  dayCellSelected: {
    backgroundColor: colors.bgDark,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: colors.text,
  },
  dayText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.md,
    color: colors.text,
  },
  dayTextOther: {
    color: colors.border,
  },
  dayTextSelected: {
    fontFamily: fonts.bold,
    color: colors.textLight,
  },
  dayTextToday: {
    fontFamily: fonts.bold,
    color: colors.text,
  },

  // Cancel button
  cancelBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
})
