// Legacy Rome and UK meeting clocks observe the same seasonal transitions.
export function ukMeetingTime(when, timezone) {
  if (!when || timezone === 'Europe/London') return when;
  return new Date(Date.parse(when + 'Z') - 60 * 60 * 1000).toISOString().slice(0, 16);
}
