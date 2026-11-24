import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Camera, Dumbbell, NotebookPen } from 'lucide-react';
import { ThemeMode } from '../types';

interface FeatureShowcaseProps {
  theme: ThemeMode;
  onOpenScanner: () => void;
  onOpenTracker: () => void;
  onOpenWorkouts: () => void;
}

const img = (name: string) => `${((import.meta as any).env?.BASE_URL as string) || '/'}images/${name}`;

export const FeatureShowcase: React.FC<FeatureShowcaseProps> = ({
  theme,
  onOpenScanner,
  onOpenTracker,
  onOpenWorkouts,
}) => {
  const isDark = theme === 'dark';
  const reduce = useReducedMotion();

  const features = [
    {
      title: 'Scan any meal',
      text: 'Take a photo of biryani, dosa or dal. AI estimates the calories and macros in seconds.',
      action: 'Open the scanner',
      icon: Camera,
      image: img('feature-biryani.jpg'),
      alt: 'A bowl of vegetable biryani',
      onClick: onOpenScanner,
      big: true,
    },
    {
      title: 'Log your whole day',
      text: 'Breakfast, lunch, snacks and dinner in one place, with a streak to keep you going.',
      action: 'Open the daily log',
      icon: NotebookPen,
      image: img('feature-paneer.jpg'),
      alt: 'Paneer curry with rice',
      onClick: onOpenTracker,
      big: false,
    },
    {
      title: 'Move a little more',
      text: 'Easy walks, home workouts and stretches, each with the calories it burns.',
      action: 'See workouts',
      icon: Dumbbell,
      image: img('feature-salad.jpg'),
      alt: 'A fresh salad bowl',
      onClick: onOpenWorkouts,
      big: false,
    },
  ];

  return (
    <section aria-labelledby="features-title" className="pt-6">
      <div className="max-w-2xl">
        <h2 id="features-title" className={`text-3xl sm:text-4xl font-extrabold ${isDark ? 'text-rice' : 'text-ink'}`}>
          Everything for your food, in one app
        </h2>
        <p className={`mt-3 text-lg ${isDark ? 'text-steel' : 'text-slate-600'}`}>
          Your targets are just the start. Scan meals, log your day and stay active.
        </p>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3 lg:grid-rows-2">
        {features.map((f, i) => (
          <motion.button
            key={f.title}
            type="button"
            onClick={f.onClick}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className={`group relative overflow-hidden rounded-3xl text-left cursor-pointer min-h-[260px] ${
              f.big ? 'lg:col-span-2 lg:row-span-2 min-h-[340px] lg:min-h-[520px]' : ''
            } shadow-lift`}
          >
            <img
              src={f.image}
              alt={f.alt}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="relative h-full flex flex-col justify-end p-6 sm:p-7 text-white">
              <span className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center">
                <f.icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <h3 className={`mt-4 font-extrabold ${f.big ? 'text-3xl sm:text-4xl' : 'text-2xl'}`}>{f.title}</h3>
              <p className="mt-2 max-w-md text-white/85 leading-relaxed">{f.text}</p>
              <span className="mt-4 inline-flex items-center gap-2 font-semibold text-[#86efac]">
                {f.action}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
};
