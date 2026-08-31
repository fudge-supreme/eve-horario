// Exportar el horario como imagen (PNG, vía html2canvas) o como
// calendario estándar (.ics) que se puede importar a Apple/Google
// Calendar.
import { toast } from './shared.js';

export async function exportGridAsPNG() {
  try {
    const { default: html2canvas } = await import('html2canvas');
    const target = document.getElementById('calGrid');
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: null });
    canvas.toBlob((blob) => {
      if (!blob) { toast('No se pudo generar la imagen'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mi-horario.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Imagen descargada');
    });
  } catch (err) {
    console.error('[export] PNG falló', err);
    toast('No se pudo exportar la imagen');
  }
}

const BYDAY = { Lunes: 'MO', Martes: 'TU', Miércoles: 'WE', Jueves: 'TH', Viernes: 'FR', Sábado: 'SA', Domingo: 'SU' };

function icsDate(d) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
function escText(s) {
  return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}
function eventDateTimes(dateStr, startHour, endHour) {
  const start = new Date(dateStr + 'T00:00:00');
  start.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0);
  const end = new Date(dateStr + 'T00:00:00');
  end.setHours(Math.floor(endHour), Math.round((endHour % 1) * 60), 0, 0);
  return { start, end };
}

// `evEntries`: los valores del objeto `ev` del grid (materias y eventos
// de la semana visible). Las materias se exportan como recurrentes
// semanales (RRULE); los eventos personales, como ocurrencia única.
export function exportScheduleAsICS(courses, evEntries, schedule) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Horario//ES', 'CALSCALE:GREGORIAN'];
  const dtstamp = icsDate(new Date());
  const seenSessions = new Set();

  evEntries.forEach((e) => {
    if (e.fixed && seenSessions.has(e._sessionId)) return;
    if (e.fixed) seenSessions.add(e._sessionId);
    const { start, end } = eventDateTimes(e.date, e.start, e.end);
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + (e._sessionId || e._eventId) + '@mi-horario.app');
    lines.push('DTSTAMP:' + dtstamp);
    lines.push('DTSTART:' + icsDate(start));
    lines.push('DTEND:' + icsDate(end));
    if (e.fixed) lines.push('RRULE:FREQ=WEEKLY;BYDAY=' + BYDAY[e.day]);
    lines.push('SUMMARY:' + escText(e.name));
    if (e.room) lines.push('LOCATION:' + escText(e.room));
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (schedule?.name || 'mi-horario').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Calendario descargado');
}
