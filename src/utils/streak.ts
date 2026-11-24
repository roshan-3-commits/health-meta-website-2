import { MealCategory, StreakData } from '../types';
import { GUEST_OWNER, currentOwner, readJson, writeJson } from '../lib/userStorage';

const STREAK_STORAGE_KEY = 'healthmeta_streak_data';

function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Starting streak for a brand-new account: nothing logged yet. */
function emptyStreak(): StreakData {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastLoggedDate: '',
    loggedDates: [],
    freezeTokens: 2,
    totalDaysLogged: 0,
    history: [],
  };
}

export function loadStreakData(owner: string = currentOwner()): StreakData {
  // Sample data is shown only when signed out; real accounts start empty.
  const fallback: StreakData =
    owner === GUEST_OWNER
      ? {
          currentStreak: 1,
          longestStreak: 3,
          lastLoggedDate: getTodayStr(),
          loggedDates: [getTodayStr()],
          freezeTokens: 2,
          totalDaysLogged: 1,
          history: [{ date: getTodayStr(), calories: 420, mealsCount: 1 }],
        }
      : emptyStreak();

  if (typeof window === 'undefined') return fallback;
  const saved = readJson<Partial<StreakData>>(STREAK_STORAGE_KEY, owner);
  return saved ? { ...fallback, ...saved } : fallback;
}

export function saveStreakData(streakData: StreakData, owner?: string): void {
  if (typeof window === 'undefined') return;
  writeJson(STREAK_STORAGE_KEY, streakData, owner);
}

export function recordMealLogToStreak(
  streakData: StreakData,
  calories: number
): { updatedData: StreakData; streakIncreased: boolean } {
  const today = getTodayStr();
  const yesterday = getYesterdayStr();

  const loggedDates = streakData.loggedDates || [];
  const alreadyLoggedToday = loggedDates.includes(today);

  let newCurrentStreak = streakData.currentStreak || 0;
  let newLongestStreak = streakData.longestStreak || 0;
  let streakIncreased = false;

  if (!alreadyLoggedToday) {
    if (streakData.lastLoggedDate === yesterday) {
      newCurrentStreak += 1;
      streakIncreased = true;
    } else if (streakData.lastLoggedDate === today) {
      // already counted
    } else {
      // missed more than 1 day
      newCurrentStreak = 1;
      streakIncreased = true;
    }
  }

  if (newCurrentStreak > newLongestStreak) {
    newLongestStreak = newCurrentStreak;
  }

  const newLoggedDates = alreadyLoggedToday ? loggedDates : [...loggedDates, today];
  const history = [...(streakData.history || [])];
  const existingDayIdx = history.findIndex((h) => h.date === today);

  if (existingDayIdx >= 0) {
    history[existingDayIdx] = {
      ...history[existingDayIdx],
      calories: history[existingDayIdx].calories + calories,
      mealsCount: history[existingDayIdx].mealsCount + 1,
    };
  } else {
    history.unshift({
      date: today,
      calories,
      mealsCount: 1,
    });
  }

  const updatedData: StreakData = {
    ...streakData,
    currentStreak: newCurrentStreak,
    longestStreak: newLongestStreak,
    lastLoggedDate: today,
    loggedDates: newLoggedDates,
    totalDaysLogged: newLoggedDates.length,
    history: history.slice(0, 30),
  };

  return { updatedData, streakIncreased };
}

export function getAutoMealCategory(): MealCategory {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 19) return 'snack';
  return 'dinner';
}
