import React from 'react';

interface AnimatedBackgroundProps {
  isDark?: boolean;
}

/** Soft, slowly drifting colour glows behind the page (mint, sky and a touch of violet). */
export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ isDark = false }) => {
  const a = isDark ? 0.16 : 0.35;
  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 transition-colors duration-500 ${
        isDark ? 'bg-leaf-900' : 'bg-steel-50'
      }`}
      aria-hidden="true"
    >
      <div
        className="hm-drift absolute -top-[18%] -right-[10%] w-[55vw] h-[55vw] max-w-[820px] max-h-[820px] rounded-full blur-[110px]"
        style={{ background: `rgba(74, 222, 128, ${a})` }}
      />
      <div
        className="hm-drift-slow absolute top-[10%] -left-[15%] w-[45vw] h-[45vw] max-w-[680px] max-h-[680px] rounded-full blur-[120px]"
        style={{ background: `rgba(56, 189, 248, ${a * 0.75})` }}
      />
      <div
        className="hm-drift absolute top-[45%] right-[20%] w-[30vw] h-[30vw] max-w-[460px] max-h-[460px] rounded-full blur-[120px]"
        style={{ background: `rgba(167, 139, 250, ${a * 0.45})` }}
      />
    </div>
  );
};
