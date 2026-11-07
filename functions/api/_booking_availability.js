// Older confirmed bookings may have both hours recorded on the attached inquiry.
export function bookingHourSql(booking, inquiry, field) {
  return `CASE WHEN ${booking}.start_h IS NULL AND ${booking}.end_h IS NULL AND json_valid(${inquiry}.data)
    THEN json_extract(${inquiry}.data, '$.${field}') ELSE ${booking}.${field} END`;
}

// Expressions are supplied by server code only. The write statement uses the latest occupancy.
export function confirmedOccupancyFreeSql({space,date,start,end,exclude="''"}) {
  return `NOT EXISTS (
    SELECT 1 FROM (
      SELECT occupied.date, ${bookingHourSql('occupied','source','start_h')} AS start_h,
        ${bookingHourSql('occupied','source','end_h')} AS end_h
      FROM bookings occupied LEFT JOIN inquiries source ON source.ref=occupied.inquiry_ref
      WHERE occupied.space_id=${space} AND occupied.status='confirmed'
        AND occupied.booking_code<>${exclude}
        AND occupied.date BETWEEN date(${date},'-1 day') AND date(${date},'+1 day')
    ) booked
    WHERE CASE WHEN ${start} IS NOT NULL AND ${end} IS NOT NULL
      AND typeof(booked.start_h) IN ('integer','real') AND typeof(booked.end_h) IN ('integer','real')
      AND booked.start_h=CAST(booked.start_h AS INTEGER) AND booked.end_h=CAST(booked.end_h AS INTEGER)
      AND booked.start_h>=0 AND booked.end_h<=48 AND booked.end_h>booked.start_h
      THEN julianday(${date})*24+${start}<julianday(booked.date)*24+booked.end_h
        AND julianday(booked.date)*24+booked.start_h<julianday(${date})*24+${end}
      ELSE booked.date=${date} END
  )`;
}

export function bookingAvailableSql({space,date,start,end,exclude="''"}) {
  return `${confirmedOccupancyFreeSql({space,date,start,end,exclude})} AND NOT EXISTS (
    SELECT 1 FROM calendar_blocks blocked WHERE blocked.space_id=${space}
      AND blocked.date=${date} AND blocked.state IN ('full','hold')
      AND COALESCE(blocked.memo,'')<>'예약 '||${exclude}
  )`;
}
