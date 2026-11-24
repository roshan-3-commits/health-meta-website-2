import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CalculatorInputs,
  CalculationResult,
  LoggedMeal,
  MealCategory,
  NavPage,
  StreakData,
  ThemeMode,
  UserProfile,
  NotificationSettings,
  NotificationLog,
  LoggedExercise,
} from './types';
import {
  computeCalorieReport,
  parseInputsFromQuery,
  serializeInputsToQuery,
} from './utils/calculator';
import { loadStreakData, saveStreakData, recordMealLogToStreak, getAutoMealCategory } from './utils/streak';
import {
  loadUserProfile,
  saveUserProfile,
  loadNotificationSettings,
  saveNotificationSettings,
  loadNotificationLogs,
  saveNotificationLogs,
  syncProfileToCalculatorInputs,
  syncCalculatorInputsToProfile,
} from './utils/profileAndNotifications';
import { AnimatedBackground } from './components/AnimatedBackground';
import { useNotificationScheduler } from './utils/useNotificationScheduler';
import { signInWithGoogle, logOut, onAuthChange, type User as AppUser } from './lib/auth';
import { dispatchWelcomeEmail } from './lib/welcomeEmail';
import { GUEST_OWNER, currentOwner, ownerOf, readJson, writeJson } from './lib/userStorage';
import { AuthModal } from './components/AuthModal';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { HowItWorks } from './components/HowItWorks';
import { FeatureShowcase } from './components/FeatureShowcase';
import { CalculatorSection } from './components/CalculatorSection';
import { AIFoodScanner } from './components/AIFoodScanner';
import { DailyTracker } from './components/DailyTracker';
import { RealtimeExerciseSuggester } from './components/RealtimeExerciseSuggester';
import { UserProfilePage } from './components/UserProfilePage';
import { MethodologyPage } from './components/MethodologyPage';
import { AboutPage } from './components/AboutPage';
import { FAQPage } from './components/FAQPage';
import { PrivacyTermsPage } from './components/PrivacyTermsPage';
import { ContactPage } from './components/ContactPage';
import { ToastProvider, useToast } from './components/Toast';
import {
  Calculator,
  Lock,
  Share2,
  Sparkles,
  ShieldCheck,
  Zap,
  Flame,
  User,
  BellRing,
} from 'lucide-react';

const DEFAULT_INPUTS: CalculatorInputs = {
  age: 30,
  gender: 'male',
  heightCm: 175,
  weightKg: 70,
  activityLevel: 'sedentary',
  goal: 'maintain',
  targetWeightKg: '',
  formula: 'mifflin',
};

const MEALS_KEY = 'freecalc_logged_meals';
const EXERCISES_KEY = 'healthmeta_logged_exercises';

/** Saved meals for an account. The sample meal is shown only when signed out. */
function loadMeals(owner: string): LoggedMeal[] {
  const saved = readJson<LoggedMeal[]>(MEALS_KEY, owner);
  if (Array.isArray(saved)) return saved;
  if (owner !== GUEST_OWNER) return [];
  return [
    {
      id: 'init_1',
      name: 'Avocado Toast & Poached Egg (Scanner)',
      calories: 420,
      protein: 16,
      carbs: 38,
      fat: 23,
      time: '08:30 AM',
      source: 'scanner',
    },
  ];
}

function loadExercises(owner: string): LoggedExercise[] {
  const saved = readJson<LoggedExercise[]>(EXERCISES_KEY, owner);
  return Array.isArray(saved) ? saved : [];
}

function MainAppContent() {
  const { toastCopy, toastMeal, toastSuccess, toastInfo, toastError } = useToast();
  const [activePage, setActivePage] = useState<NavPage>('calculator');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('healthmeta_theme_v2');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {
      console.warn(e);
    }
    return 'light';
  });
  const [shareCopied, setShareCopied] = useState(false);

  // Apply dark mode class to root and body
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    try {
      localStorage.setItem('healthmeta_theme_v2', theme);
    } catch (e) {
      console.warn(e);
    }
  }, [theme]);

  // Initialize inputs from URL query params or defaults
  const [inputs, setInputs] = useState<CalculatorInputs>(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const parsed = parseInputsFromQuery(window.location.search);
      return { ...DEFAULT_INPUTS, ...parsed };
    }
    return DEFAULT_INPUTS;
  });

  // Calculate live report whenever inputs change
  const results = useMemo(() => computeCalorieReport(inputs), [inputs]);

  // Daily target state for the tracker
  const [dailyTarget, setDailyTarget] = useState<number>(() => {
    const report = computeCalorieReport(inputs);
    return report ? report.targetCalories : 1979;
  });
  const [targetLabel, setTargetLabel] = useState<string>(() => {
    const report = computeCalorieReport(inputs);
    return report ? report.activeGoalTier.title : 'Maintain';
  });

  // Whose data is loaded right now (account email, or 'guest' when signed out).
  // Each account keeps its own profile, meals, workouts, streak and notifications.
  const [dataOwner, setDataOwner] = useState<string>(() => currentOwner());
  const dataOwnerRef = useRef(dataOwner);

  // Persisted logged meals in local storage
  const [meals, setMeals] = useState<LoggedMeal[]>(() => loadMeals(dataOwner));

  // Persisted streak data
  const [streakData, setStreakData] = useState<StreakData>(() => loadStreakData(dataOwner));

  // Save streak data
  useEffect(() => {
    saveStreakData(streakData, dataOwner);
  }, [streakData, dataOwner]);

  // Persisted user profile
  const [profile, setProfile] = useState<UserProfile>(() => loadUserProfile(dataOwner));

  // Persisted notification settings
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() =>
    loadNotificationSettings(dataOwner)
  );

  // Persisted notification history logs
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>(() =>
    loadNotificationLogs(dataOwner)
  );

  // Persisted logged exercises
  const [loggedExercises, setLoggedExercises] = useState<LoggedExercise[]>(() => loadExercises(dataOwner));

  // Signed-in user (from the Python backend)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  /** Load the saved data of whoever just signed in (or out), so accounts never share data. */
  const switchDataOwner = (user: AppUser | null) => {
    const owner = ownerOf(user);
    if (owner === dataOwnerRef.current) return;
    dataOwnerRef.current = owner;
    const nextProfile = loadUserProfile(owner);
    setDataOwner(owner);
    setProfile(nextProfile);
    setMeals(loadMeals(owner));
    setStreakData(loadStreakData(owner));
    setNotificationSettings(loadNotificationSettings(owner));
    setNotificationLogs(loadNotificationLogs(owner));
    setLoggedExercises(loadExercises(owner));
    setInputs((prev) => syncProfileToCalculatorInputs(nextProfile, prev));
  };

  // Subscribe to sign-in changes
  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      switchDataOwner(user);
      setCurrentUser(user);
      if (user) {
        // Auto sync user name and email to profile if not customized
        setProfile((prev) => ({
          ...prev,
          name: user.displayName || prev.name,
          email: user.email || prev.email,
          photoUrl: user.photoURL || prev.photoUrl,
        }));

        // Send welcome email if not previously sent
        if (user.email) {
          dispatchWelcomeEmail({
            toEmail: user.email,
            userName: user.displayName || user.email.split('@')[0],
          }).catch((err) => console.warn('Background welcome email check:', err));
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = (user: AppUser) => {
    setCurrentUser(user);
    const resolvedName = user.displayName || user.email?.split('@')[0] || 'Fitness Champion';
    setProfile((prev) => ({
      ...prev,
      name: resolvedName,
      email: user.email || prev.email,
      photoUrl: user.photoURL || prev.photoUrl,
    }));
    toastSuccess('Signed In Successfully!', `Welcome, ${resolvedName}!`);

    // Immediately dispatch welcome email from roshanlokhande43@gmail.com to user's registered email
    if (user.email) {
      dispatchWelcomeEmail({
        toEmail: user.email,
        userName: resolvedName,
        force: true,
      }).then((res) => {
        if (res.success) {
          toastSuccess(
            '✉️ Welcome to Health-Meta!',
            `Welcome message sent to ${user.email} from roshanlokhande43@gmail.com`
          );
        }
      }).catch((err) => {
        console.warn('Welcome email dispatch warning:', err);
      });
    }
  };

  const handleOpenAuthModal = () => {
    setAuthModalOpen(true);
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      setCurrentUser(null);
      toastInfo('Signed Out', 'You have been successfully signed out.');
    } catch (error: any) {
      toastError('Sign Out Failed', error?.message || 'Could not sign out.');
    }
  };

  // Save profile changes
  useEffect(() => {
    saveUserProfile(profile, dataOwner);
  }, [profile, dataOwner]);

  // Save notification settings changes
  useEffect(() => {
    saveNotificationSettings(notificationSettings, dataOwner);
  }, [notificationSettings, dataOwner]);

  // Save notification logs changes
  useEffect(() => {
    saveNotificationLogs(notificationLogs, dataOwner);
  }, [notificationLogs, dataOwner]);

  // Save logged exercises
  useEffect(() => {
    writeJson(EXERCISES_KEY, loggedExercises, dataOwner);
  }, [loggedExercises, dataOwner]);

  const handleLogExercise = useCallback((exercise: LoggedExercise) => {
    setLoggedExercises((prev) => [exercise, ...prev]);
    toastSuccess('Workout Logged! 🏃', `${exercise.name}: -${exercise.caloriesBurned} kcal burned!`);
  }, [toastSuccess]);

  // Handle incoming notification log addition
  const handleNewNotificationLog = useCallback((log: NotificationLog) => {
    setNotificationLogs((prev) => [log, ...prev]);
  }, []);

  // Handle in-app toast from notification scheduler
  const handleNotificationToast = useCallback(
    (title: string, message: string) => {
      toastInfo(title, message);
    },
    [toastInfo]
  );

  // Check if meals logged today
  const hasMealsLoggedToday = useMemo(() => {
    return meals.length > 0;
  }, [meals]);

  // Real-time time-to-time notification scheduler background engine
  useNotificationScheduler({
    profile,
    settings: notificationSettings,
    onNewNotificationLog: handleNewNotificationLog,
    onToast: handleNotificationToast,
    hasMealsLoggedToday,
  });

  // Handler to update profile and sync to calculator
  const handleUpdateProfile = (updatedProfile: UserProfile) => {
    setProfile(updatedProfile);
    setInputs((prev) => syncProfileToCalculatorInputs(updatedProfile, prev));
    toastSuccess('Profile Updated', 'Biometrics & Meal Schedule saved and synced with calculator.');
  };

  // Handler to update notification settings
  const handleUpdateNotificationSettings = (updatedSettings: NotificationSettings) => {
    setNotificationSettings(updatedSettings);
  };

  // Handler to clear notification logs
  const handleClearNotificationLogs = () => {
    setNotificationLogs([]);
    toastInfo('Logs Cleared', 'Notification history has been cleared.');
  };

  // Save meals to local storage
  useEffect(() => {
    writeJson(MEALS_KEY, meals, dataOwner);
  }, [meals, dataOwner]);

  // Sync inputs to browser URL query string
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const queryString = serializeInputsToQuery(inputs);
      const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
      window.history.replaceState(null, '', newUrl);
    }
  }, [inputs]);

  const handleShareLink = () => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        setShareCopied(true);
        toastCopy('Shareable URL Copied!', 'Your customized calorie and macro plan link is ready to share.');
        setTimeout(() => setShareCopied(false), 2500);
      });
    }
  };

  const handleScrollToCalculator = () => {
    if (activePage !== 'calculator') {
      setActivePage('calculator');
    }
    setTimeout(() => {
      const element = document.getElementById('calculator');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  const handleSetDailyTarget = (calories: number, label: string) => {
    setDailyTarget(calories);
    setTargetLabel(label);
    setActivePage('tracker');
    toastSuccess('Daily Target Updated', `Tracker goal set to ${calories} kcal (${label}).`);
  };

  const handleLogMeal = (mealData: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    category?: MealCategory;
    portionSize?: string;
  }) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMeal: LoggedMeal = {
      id: 'meal_' + Date.now(),
      name: mealData.name,
      calories: mealData.calories,
      protein: Math.round(mealData.protein),
      carbs: Math.round(mealData.carbs),
      fat: Math.round(mealData.fat),
      category: mealData.category || getAutoMealCategory(),
      portionSize: mealData.portionSize,
      time: timeStr,
      source: 'scanner',
    };
    setMeals((prev) => [newMeal, ...prev]);
    toastMeal(mealData.name, mealData.calories);

    // Update streak
    const { updatedData, streakIncreased } = recordMealLogToStreak(streakData, mealData.calories);
    setStreakData(updatedData);
    if (streakIncreased) {
      toastSuccess('Streak Active! 🔥', `${updatedData.currentStreak}-day logging streak recorded!`);
    }

    setActivePage('tracker');
  };

  const handleAddManualMeal = (mealData: Omit<LoggedMeal, 'id' | 'time' | 'source'>) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMeal: LoggedMeal = {
      id: 'meal_' + Date.now(),
      ...mealData,
      category: mealData.category || getAutoMealCategory(),
      time: timeStr,
      source: 'manual',
    };
    setMeals((prev) => [newMeal, ...prev]);
    toastMeal(mealData.name, mealData.calories);

    // Update streak
    const { updatedData, streakIncreased } = recordMealLogToStreak(streakData, mealData.calories);
    setStreakData(updatedData);
    if (streakIncreased) {
      toastSuccess('Streak Active! 🔥', `${updatedData.currentStreak}-day logging streak recorded!`);
    }
  };

  const handleRemoveMeal = (id: string) => {
    const mealToDelete = meals.find((m) => m.id === id);
    setMeals((prev) => prev.filter((m) => m.id !== id));
    if (mealToDelete) {
      toastInfo('Item Removed', `"${mealToDelete.name}" removed from log.`);
    }
  };

  const handleClearAllMeals = () => {
    if (window.confirm('Clear all logged meals for today?')) {
      setMeals([]);
      toastInfo('Daily Log Reset', 'All meal entries for today have been cleared.');
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      className={`min-h-screen transition-colors duration-300 flex flex-col font-sans selection:bg-turmeric/30 relative ${
        isDark
          ? 'bg-leaf-900 text-rice'
          : 'bg-steel-50 text-ink'
      }`}
    >
      {/* Continuous Ambient Animated Background */}
      <AnimatedBackground isDark={isDark} />

      {/* Top Navbar */}
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        theme={theme}
        setTheme={setTheme}
        onOpenCalculator={handleScrollToCalculator}
        onOpenStreak={() => {
          setActivePage('tracker');
          setTimeout(() => {
            const el = document.getElementById('streak-section');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }, 100);
        }}
        loggedMealsCount={meals.length}
        currentStreak={streakData.currentStreak}
        userAvatar={profile.avatar}
        userName={profile.name}
        userPhotoUrl={profile.photoUrl}
        notificationsEnabled={notificationSettings.enabled}
        currentUser={currentUser}
        onGoogleSignIn={handleOpenAuthModal}
        onSignOut={handleSignOut}
        isAuthLoading={isAuthLoading}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-12">
        {/* Page 1: Calculator (Hero + Live Two-Card Calculator Layout matching Screenshots 1, 2, 3) */}
        {activePage === 'calculator' && (
          <div className="space-y-20 sm:space-y-24">
            {/* Hero Section matching Screenshot 1 & 3 */}
            <HeroSection
              theme={theme}
              result={results}
              onOpenCalculator={handleScrollToCalculator}
              onOpenScanner={() => {
                setActivePage('scanner');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenMethodology={() => {
                setActivePage('methodology');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            <HowItWorks theme={theme} />

            {/* Side-by-Side Calculator Section */}
            <CalculatorSection
              inputs={inputs}
              setInputs={setInputs}
              result={results}
              onSetDailyTarget={handleSetDailyTarget}
              onScanFoodShortcut={() => {
                setActivePage('scanner');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenTracker={() => {
                setActivePage('tracker');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onShareLink={handleShareLink}
              shareCopied={shareCopied}
              theme={theme}
            />

            <FeatureShowcase
              theme={theme}
              onOpenScanner={() => {
                setActivePage('scanner');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenTracker={() => {
                setActivePage('tracker');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenWorkouts={() => {
                setActivePage('exercise');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}

        {/* Page 2: AI Food Scanner */}
        {activePage === 'scanner' && (
          <AIFoodScanner theme={theme} onLogMeal={handleLogMeal} />
        )}

        {/* Page: Real-Time Exercise Engine */}
        {activePage === 'exercise' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
            <RealtimeExerciseSuggester
              weightKg={Number(inputs.weightKg) || profile.weightKg || 70}
              goal={inputs.goal || profile.goal || 'lose'}
              totalCaloriesLoggedToday={meals.reduce((sum, m) => sum + m.calories, 0)}
              targetCalories={dailyTarget}
              mealsLogged={meals}
              theme={theme}
              onLogExercise={handleLogExercise}
              onGoToTracker={() => {
                setActivePage('tracker');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}

        {/* Page 3: Daily Tracker */}
        {activePage === 'tracker' && (
          <DailyTracker
            theme={theme}
            targetCalories={dailyTarget}
            targetLabel={targetLabel}
            meals={meals}
            streakData={streakData}
            exercises={loggedExercises}
            onUpdateStreak={setStreakData}
            onAddManualMeal={handleAddManualMeal}
            onRemoveMeal={handleRemoveMeal}
            onClearAll={handleClearAllMeals}
            onSetCustomTarget={setDailyTarget}
            onOpenScanner={() => {
              setActivePage('scanner');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onGoToExercise={() => {
              setActivePage('exercise');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Page 4: User Profile & Time-to-Time Mobile Alerts */}
        {activePage === 'profile' && (
          <UserProfilePage
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            notificationSettings={notificationSettings}
            onUpdateNotificationSettings={handleUpdateNotificationSettings}
            notificationLogs={notificationLogs}
            onClearNotificationLogs={handleClearNotificationLogs}
            theme={theme}
            meals={meals}
            targetCalories={dailyTarget}
            onLogExercise={handleLogExercise}
            currentUser={currentUser}
            onGoogleSignIn={handleOpenAuthModal}
            onSignOut={handleSignOut}
            isAuthLoading={isAuthLoading}
            onGoToCalculator={() => {
              setActivePage('calculator');
              handleScrollToCalculator();
            }}
            onGoToTracker={() => {
              setActivePage('tracker');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Page 4: Methodology */}
        {activePage === 'methodology' && (
          <MethodologyPage
            theme={theme}
            onGoToCalculator={() => {
              setActivePage('calculator');
              handleScrollToCalculator();
            }}
          />
        )}

        {/* Page 5: About */}
        {activePage === 'about' && (
          <AboutPage
            theme={theme}
            onGoToCalculator={() => {
              setActivePage('calculator');
              handleScrollToCalculator();
            }}
          />
        )}

        {/* Page 6: FAQ */}
        {activePage === 'faq' && <FAQPage theme={theme} />}

        {/* Page 7: Privacy & Terms */}
        {(activePage === 'privacy' || activePage === 'terms') && (
          <PrivacyTermsPage theme={theme} />
        )}

        {/* Page 8: Contact */}
        {activePage === 'contact' && (
          <ContactPage
            theme={theme}
            onGoToFAQ={() => {
              setActivePage('faq');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </main>

      {/* Footer (Structured Premium Fat Footer) */}
      <footer
        className={`relative z-10 border-t pt-16 pb-12 mt-20 transition-colors ${
          isDark
            ? 'bg-leaf-950 border-white/[0.06] text-steel'
            : 'bg-white border-slate-200 text-slate-600'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Main Footer Area: Multi-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16">
            {/* Column 1: Brand (Width ~35-40% on Desktop) */}
            <div className="md:col-span-6 lg:col-span-5 space-y-4">
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 32 32" className="w-9 h-9 shrink-0" aria-hidden="true">
                  <circle cx="16" cy="16" r="15" fill="#22c55e" />
                  <circle cx="16" cy="16" r="12" fill="#ffffff" />
                  <circle cx="10.5" cy="13" r="3.6" fill="var(--color-pudina)" />
                  <circle cx="16" cy="9.6" r="4.2" fill="var(--color-ragi)" />
                  <circle cx="21.5" cy="13" r="3.2" fill="var(--color-chili)" />
                </svg>
                <span
                  className={`font-display font-bold text-lg tracking-[-0.02em] ${
                    isDark ? 'text-rice' : 'text-ink'
                  }`}
                >
                  Health Meta
                </span>
              </div>
              <p
                className={`text-[13px] leading-relaxed max-w-sm ${
                  isDark ? 'text-steel' : 'text-slate-500'
                }`}
              >
                Daily calories, macros and water for Indian meals, plus an AI food scanner and workout ideas.
              </p>
            </div>

            {/* Column 2: PRODUCT */}
            <div className="md:col-span-3 lg:col-span-3 space-y-3.5">
              <h4
                className={`font-display text-[15px] font-semibold ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                Use Health Meta
              </h4>
              <ul className="flex flex-col space-y-2.5 text-[13px]">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('calculator');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    Calculator
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('scanner');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    AI Food Scanner
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('exercise');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center gap-2 text-white hover:translate-x-1 transition-all duration-200 cursor-pointer group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    <span className="text-[#10b981] group-hover:text-emerald-300 font-medium transition-colors">
                      Workouts
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('tracker');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    Daily Log
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('profile');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    Profile &amp; Alerts
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: COMPANY */}
            <div className="md:col-span-3 lg:col-span-4 space-y-3.5">
              <h4
                className={`font-display text-[15px] font-semibold ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                Learn more
              </h4>
              <ul className="flex flex-col space-y-2.5 text-[13px]">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('methodology');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    Methodology
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('about');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    About
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('faq');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    FAQ
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('privacy');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    Privacy &amp; Terms
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('contact');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`inline-flex items-center hover:translate-x-1 transition-all duration-200 cursor-pointer ${isDark ? "text-steel hover:text-white" : "text-slate-600 hover:text-ink"}`}
                  >
                    Contact
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Sub-footer (Bottom Bar) */}
          <div
            className={`pt-8 border-t flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs ${
              isDark ? 'border-white/[0.05] text-steel' : 'border-slate-100 text-slate-500'
            }`}
          >
            {/* Left side: Copyright & Creator Details */}
            <div className="space-y-1">
              <p className={`font-medium ${isDark ? 'text-rice' : 'text-ink'}`}>
                © 2026 Health Meta
              </p>
              <p className="text-[11px] text-steel/80">
                Created by{' '}
                <strong className={isDark ? 'text-zinc-200' : 'text-slate-800'}>
                  Roshan Lokhande
                </strong>{' '}
                (Roll No: 266597, A3 | Dept. of IT, K.B.P. College Vashi)
              </p>
            </div>

            {/* Right side: Purpose statement */}
            <p className="text-left md:text-right text-[11px] text-steel/70 max-w-xs md:max-w-none">
              For educational &amp; dietary planning purposes only.
            </p>
          </div>
        </div>
      </footer>

      {/* Authentication Modal (Google & Email/Password with error diagnostics) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <MainAppContent />
    </ToastProvider>
  );
}
