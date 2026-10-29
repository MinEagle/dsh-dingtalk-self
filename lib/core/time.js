function parts(epochMs, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const out = {};
  for (const p of fmt.formatToParts(new Date(epochMs))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  if (out.hour === '24') out.hour = '00';
  return out;
}

export function formatDingTalkTime(epochMs, timeZone = 'Asia/Shanghai') {
  const p = parts(epochMs, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function localMinutes(epochMs, timeZone = 'Asia/Shanghai') {
  const p = parts(epochMs, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
}

export function hhmmToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) throw new Error(`时间格式应为 HH:MM，收到：${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`时间越界：${hhmm}`);
  return h * 60 + min;
}

export function parseCreateTime(value, timeZone = 'Asia/Shanghai') {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const s = String(value).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? n * 1000 : n;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi, sec] = m;
    const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(sec || 0));
    return asUtc - offsetMs(asUtc, timeZone);
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

function offsetMs(epochMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asIfUtc - epochMs;
}
