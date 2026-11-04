// Expressions are supplied by server code only. Evaluate inside the write transaction:
// a separate availability SELECT cannot protect concurrent payment callbacks.
export function bookingAvailableSql({space,date,start,end,exclude="''"}) {
  return `NOT EXISTS (
    SELECT 1 FROM bookings occupied
    WHERE occupied.space_id=${space} AND occupied.status='confirmed'
      AND occupied.booking_code<>${exclude}
      AND occupied.date BETWEEN date(${date},'-1 day') AND date(${date},'+1 day')
      AND (CASE WHEN occupied.start_h IS NULL OR occupied.end_h IS NULL
        THEN occupied.date=${date}
        ELSE julianday(${date})*24+${start}<julianday(occupied.date)*24+occupied.end_h
          AND julianday(occupied.date)*24+occupied.start_h<julianday(${date})*24+${end} END)
  ) AND NOT EXISTS (
    SELECT 1 FROM calendar_blocks blocked WHERE blocked.space_id=${space}
      AND blocked.date=${date} AND blocked.state IN ('full','hold')
      AND COALESCE(blocked.memo,'')<>'예약 '||${exclude}
  )`;
}
