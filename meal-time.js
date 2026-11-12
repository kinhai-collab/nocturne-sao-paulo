'use strict';

window.EnkaiTime = (() => {
  const formatters = new Map();
  const knownDestinations = [
    [/\b(toronto|ontario|markham|richmond\s*hill|north\s*york|vaughan|scarborough|mississauga|oakville|hamilton)\b/, 'America/Toronto'],
    [/\bsao\s*paulo\b/, 'America/Sao_Paulo'],
    [/\b(new\s*york|manhattan|brooklyn)\b/, 'America/New_York'],
    [/\b(los\s*angeles|san\s*francisco|san\s*diego|california|seattle)\b/, 'America/Los_Angeles'],
    [/\b(vancouver|victoria[,\s]+bc)\b/, 'America/Vancouver'],
    [/\blondon[,\s]*(uk|england|united kingdom)\b/, 'Europe/London'],
    [/\bparis[,\s]+(france|fr)\b/, 'Europe/Paris'],
    [/\b(tokyo|osaka)\b/, 'Asia/Tokyo'],
    [/\bsingapore\b/, 'Asia/Singapore'],
    [/\bhong\s*kong\b/, 'Asia/Hong_Kong'],
  ];

  function validZone(zone) {
    if (typeof zone !== 'string' || !zone || zone.length > 100) return false;
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; }
    catch { return false; }
  }

  function guessZone(location) {
    const text = String(location || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return knownDestinations.find(([pattern]) => pattern.test(text))?.[1] || '';
  }

  function parts(epoch, zone) {
    if (!formatters.has(zone)) {
      formatters.set(zone, new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, calendar: 'iso8601', numberingSystem: 'latn',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }));
    }
    const fields = Object.fromEntries(formatters.get(zone).formatToParts(epoch).map(part => [part.type, part.value]));
    return fields.year.padStart(4, '0') + '-' + fields.month + '-' + fields.day +
      'T' + fields.hour + ':' + fields.minute + ':' + fields.second;
  }

  function candidates(value, zone) {
    if (!validZone(zone)) throw Error('Choose the destination time zone.');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('Choose a valid date and time.');
    const wall = Date.parse(value + ':00.000Z');
    if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) {
      throw Error('Choose a valid date and time.');
    }

    // Find the offsets on both sides of any nearby daylight-saving transition.
    const offsets = new Set();
    for (let hours = -48; hours <= 48; hours += 6) {
      const probe = wall + hours * 3_600_000;
      offsets.add(Date.parse(parts(probe, zone) + 'Z') - probe);
    }
    return [...offsets].map(offset => wall - offset)
      .filter(epoch => parts(epoch, zone).slice(0, 16) === value)
      .sort((a, b) => a - b)
      .map(epoch => new Date(epoch).toISOString());
  }

  function toInstant(value, zone, occurrence = '') {
    const matches = candidates(value, zone);
    if (!matches.length) throw Error('That time is skipped when the destination clocks change. Choose another time.');
    if (matches.length > 1 && !['earlier', 'later'].includes(occurrence)) {
      throw Error('That time happens twice when the destination clocks change. Choose the first or second occurrence.');
    }
    return matches[occurrence === 'later' ? matches.length - 1 : 0];
  }

  function format(instant, zone, options = {}) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short', ...options,
    }).format(new Date(instant));
  }


  function calendar(meal) {
    const stamp = date => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const text = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, char => '\\' + char);
    const end = new Date(Date.parse(meal.selectedTime) + meal.duration * 60_000);
    const venue=(meal.venues||[]).find(v=>v.name===meal.restaurant);
    const map=new URL('https://www.google.com/maps/search/');
    map.searchParams.set('api','1');map.searchParams.set('query',[meal.restaurant,meal.location].join(' '));
    if(venue?.placeId)map.searchParams.set('query_place_id',venue.placeId);
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Enkai//Dinner plans//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', 'UID:' + meal.id + '@enkai', 'DTSTAMP:' + stamp(Date.now()),
      'SEQUENCE:' + (Number.isSafeInteger(meal.version) ? meal.version : 0),
      'DTSTART:' + stamp(meal.selectedTime), 'DTEND:' + stamp(end),
      'SUMMARY:' + text(meal.title),
      'LOCATION:' + text([meal.restaurant, meal.location].filter(Boolean).join(', ')),
      'DESCRIPTION:' + text('Destination time: ' + format(meal.selectedTime, meal.timeZone) + ' (' + meal.timeZone +
        ')\nReservation: ' + meal.status + '\nDirections: ' + map.href),
      'STATUS:' + (['Booked', 'Confirmed'].includes(meal.status) ? 'CONFIRMED' : 'TENTATIVE'),
      'END:VEVENT', 'END:VCALENDAR',
    ];
    // iCalendar folds lines at 75 UTF-8 octets, including the continuation space.
    return lines.map(line => {
      let result = '', bytes = 0;
      for (const character of line) {
        const size = new TextEncoder().encode(character).length;
        if (bytes + size > 75) { result += '\r\n '; bytes = 1; }
        result += character;
        bytes += size;
      }
      return result;
    }).join('\r\n') + '\r\n';
  }

  const zones = [...new Set([
    'America/Toronto', 'America/Sao_Paulo', 'America/Los_Angeles', 'America/New_York',
    'America/Vancouver', 'UTC',
    ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [
      'America/Chicago', 'America/Denver', 'America/Halifax', 'America/St_Johns',
      'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Hong_Kong',
      'Asia/Singapore', 'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland',
    ]),
  ])];
  return { validZone, guessZone, candidates, toInstant, format, zones, calendar };
})();
