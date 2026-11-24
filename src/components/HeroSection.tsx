import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Camera, Check, Droplets, Flame } from 'lucide-react';
import { CalculationResult, ThemeMode } from '../types';
import { useCountUp } from '../lib/useCountUp';

interface HeroSectionProps {
  theme: ThemeMode;
  result: CalculationResult | null;
  onOpenCalculator: () => void;
  onOpenScanner: () => void;
  onOpenMethodology: () => void;
}

const HERO_IMAGE = `${((import.meta as any).env?.BASE_URL as string) || "/"}images/hero-dosa-thali.jpg`;

export const HeroSection: React.FC<HeroSectionProps> = ({
  theme,
  result,
  onOpenCalculator,
  onOpenScanner,
  onOpenMethodology,
}) => {
  const isDark = theme === 'dark';
  const reduce = useReducedMotion();
  const macros = result?.activeGoalTier.macros;
  const kcal = useCountUp(result?.targetCalories ?? 0);

  const muted = isDark ? 'text-steel' : 'text-slate-600';
  const glass = isDark
    ? 'bg-leaf-800/80 border-white/10 text-rice'
    : 'bg-white/95 border-white text-ink';

  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] as const },
        };

  const bars = [
    { label: 'Protein', grams: macros?.proteinG ?? 0, pct: macros?.proteinPct ?? 0, color: 'bg-pudina' },
    { label: 'Carbs', grams: macros?.carbsG ?? 0, pct: macros?.carbsPct ?? 0, color: 'bg-ragi' },
    { label: 'Fat', grams: macros?.fatG ?? 0, pct: macros?.fatPct ?? 0, color: 'bg-chili' },
  ];

  return (
    <section
      aria-labelledby="hero-title"
      className="relative grid lg:grid-cols-[1fr_1.05fr] items-center gap-12 lg:gap-14 pt-6 sm:pt-12 pb-6"
    >
      {/* Words */}
      <div className="max-w-xl">
        <motion.span
          {...enter(0)}
          className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            isDark ? 'bg-turmeric/15 text-amber-700 dark:text-amber-300' : 'bg-amber-100 text-amber-800'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-turmeric" aria-hidden="true" />
          Made for Indian meals
        </motion.span>

        <motion.h1
          {...enter(0.05)}
          id="hero-title"
          className={`mt-5 font-extrabold text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-[4rem] ${
            isDark ? 'text-rice' : 'text-ink'
          }`}
        >
          Know exactly what your plate needs.
        </motion.h1>

        <motion.p {...enter(0.12)} className={`mt-6 text-lg leading-relaxed max-w-[34rem] ${muted}`}>
          Get your daily calories, protein, carbs, fat and water in seconds. Then scan a meal with your camera and track
          your whole day.
        </motion.p>

        <motion.div {...enter(0.18)} className="mt-8 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onOpenCalculator}
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-turmeric hover:bg-[#4ade80] hover:-translate-y-0.5 active:translate-y-0 active:bg-turmeric-deep text-[#052e16] font-bold text-base shadow-[0_10px_24px_-8px_rgba(34,197,94,0.6)] transition-all cursor-pointer"
          >
            Calculate my targets
          </button>
          <button
            type="button"
            onClick={onOpenScanner}
            className={`inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold text-base border transition-colors cursor-pointer ${
              isDark
                ? 'border-leaf-600 bg-leaf-800 text-rice hover:bg-leaf-700'
                : 'border-slate-200 bg-white text-ink hover:border-slate-300 shadow-soft'
            }`}
          >
            <Camera className="w-4.5 h-4.5" aria-hidden="true" />
            Scan a meal
          </button>
        </motion.div>

        <motion.ul {...enter(0.24)} className={`mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm ${muted}`}>
          {['Free to use', 'Veg and non-veg', 'Calories by the Mifflin-St Jeor equation'].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Check className="w-4 h-4 text-turmeric" aria-hidden="true" />
              {t === 'Calories by the Mifflin-St Jeor equation' ? (
                <button
                  type="button"
                  onClick={onOpenMethodology}
                  className="underline underline-offset-4 decoration-1 hover:text-turmeric-deep cursor-pointer"
                >
                  {t}
                </button>
              ) : (
                t
              )}
            </li>
          ))}
        </motion.ul>
      </div>

      {/* Photo with live cards */}
      <div className="relative mx-auto w-full max-w-[600px] sm:pb-6 lg:pb-0">
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative overflow-hidden rounded-[2rem] shadow-lift aspect-[4/3.3]"
        >
          <img
            src={HERO_IMAGE}
            alt="Masala dosa with sambar and chutneys on a thali"
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
        </motion.div>

        {/* Daily calories */}
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className={`absolute -left-2 sm:-left-8 top-6 sm:top-10 rounded-2xl border backdrop-blur-xl px-4 py-3.5 shadow-lift ${glass}`}
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-turmeric/15 text-turmeric-deep flex items-center justify-center">
              <Flame className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <p className={`text-xs font-medium ${muted}`}>Your daily target</p>
              <p className="text-2xl font-extrabold leading-tight tabular-nums">
                {result ? kcal.toLocaleString('en-IN') : '—'}
                <span className={`ml-1 text-sm font-semibold ${muted}`}>kcal</span>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Water */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className={`absolute right-3 sm:-right-5 top-3 sm:top-6 rounded-full border backdrop-blur-xl pl-2 pr-4 py-2 shadow-lift flex items-center gap-2 ${glass}`}
        >
          <span className="w-8 h-8 rounded-full bg-water/15 text-water flex items-center justify-center">
            <Droplets className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold tabular-nums">{result ? `${result.waterIntakeLiters} L water` : '—'}</span>
        </motion.div>

        {/* Macros */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className={`relative -mt-14 ml-auto mr-3 sm:mr-0 sm:mt-0 sm:absolute sm:-right-6 sm:bottom-[-1.5rem] w-[15.5rem] rounded-2xl border backdrop-blur-xl p-4 shadow-lift ${glass}`}
          aria-label="Your daily macros"
        >
          <p className="text-sm font-bold mb-3">Your daily macros</p>
          <ul className="space-y-2.5">
            {bars.map((b) => (
              <li key={b.label}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>{b.label}</span>
                  <span className="tabular-nums">{b.grams} g</span>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>
                  <motion.div
                    className={`h-full rounded-full ${b.color}`}
                    initial={false}
                    animate={{ width: `${Math.max(4, b.pct)}%` }}
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 110, damping: 20 }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
};
