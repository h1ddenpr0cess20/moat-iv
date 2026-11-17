/**
 * Time in this city is counted in weeks, and in months of four of them from the first: it is winter all the time, so no month has a name and there are no years and no
 * seasons. (`calendar` still answers in the shape the older code asks, always midwinter.)
 */

/** Week 0 is the first week; a "month" of four weeks is only what the budget is struck on. */
export function calendar(week) {
  return {
    week, year: 1, inYear: week, month: 9, monthName: '', season: 3, seasonName: 'Winter',
    weekInMonth: week % 4, weekInSeason: week % 12, t: 0,
  };
}

/** How cold it is for the hearth: always winter. */
export const coldness = () => 1;

/** The time as people read it: months counted from the first, four weeks each, with no names. */
export const dateText = (week) => `Month ${Math.floor(week / 4) + 1}`;
