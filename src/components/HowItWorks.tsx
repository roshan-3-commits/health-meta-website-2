import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ClipboardList, PieChart, Camera } from 'lucide-react';
import { ThemeMode } from '../types';

interface HowItWorksProps {
  theme: ThemeMode;
}

/** The three real steps of using Health Meta, in order. */
const STEPS = [
  {
    icon: ClipboardList,
    title: 'Tell us about you',
    text: 'Age, height, weight, activity and your goal. It takes under a minute.',
    tint: 'from-emerald-400 to-green-500',
  },
  {
    icon: PieChart,
    title: 'Get your daily targets',
    text: 'See your calories, protein, carbs, fat and water, worked out for your goal.',
    tint: 'from-violet-400 to-purple-500',
  },
  {
    icon: Camera,
    title: 'Scan and track meals',
    text: 'Snap your plate. Health Meta estimates the macros and adds them to your day.',
    tint: 'from-sky-400 to-cyan-500',
  },
];

export const HowItWorks: React.FC<HowItWorksProps> = ({ theme }) => {
  const isDark = theme === 'dark';
  const reduce = useReducedMotion();

  return (
    <section aria-labelledby="how-title" className="pt-4">
      <h2 id="how-title" className={`text-3xl sm:text-4xl font-extrabold ${isDark ? 'text-rice' : 'text-ink'}`}>
        Three steps to a healthier day
      </h2>

      <ol className="mt-8 grid gap-5 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className={`relative rounded-3xl border p-6 transition-transform duration-200 hover:-translate-y-1 ${
              isDark ? 'bg-leaf-800/70 border-white/[0.06]' : 'bg-white border-slate-200/70 shadow-soft'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.tint} text-white flex items-center justify-center shadow-lg`}
              >
                <step.icon className="w-6 h-6" aria-hidden="true" />
              </span>
              <span className={`text-sm font-bold ${isDark ? 'text-steel' : 'text-slate-400'}`}>Step {i + 1}</span>
            </div>
            <h3 className={`mt-5 text-xl font-bold ${isDark ? 'text-rice' : 'text-ink'}`}>{step.title}</h3>
            <p className={`mt-2 leading-relaxed ${isDark ? 'text-steel' : 'text-slate-600'}`}>{step.text}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
};
