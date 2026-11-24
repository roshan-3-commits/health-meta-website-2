import React, { useState } from 'react';
import { Mail, Lock, User, ExternalLink, AlertCircle, X, CheckCircle2, ArrowRight, Sparkles, Zap } from 'lucide-react';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signInInstant,
  formatAuthErrorMessage,
} from '../lib/auth';
import { isGoogleSignInEnabled } from '../lib/googleAuth';
import { DEVICE_ONLY } from '../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isIframeBlocked, setIsIframeBlocked] = useState(false);
  const [showInstantOption, setShowInstantOption] = useState(false);

  if (!isOpen) return null;

  const handleFieldChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    if (errorMessage) {
      setErrorMessage(null);
      setShowInstantOption(false);
    }
  };

  const handleInstantSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const user = await signInInstant(name, email);
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Guest login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    setLoading(true);
    setErrorMessage(null);
    setIsIframeBlocked(false);
    setShowInstantOption(false);

    try {
      const user = await signInWithGoogle();
      if (user) {
        onSuccess(user);
        onClose();
        return;
      }
    } catch (err: any) {
      console.warn('Google Sign In caught:', err);
      // Show why Google failed; never sign in as someone else.
      setErrorMessage(formatAuthErrorMessage(err));
      setShowInstantOption(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      let user;
      if (mode === 'signup') {
        user = await signUpWithEmail(email, password, name || email.split('@')[0] || 'Fitness Champion');
      } else {
        user = await signInWithEmail(email, password);
      }

      if (user) {
        onSuccess(user);
        onClose();
      }
    } catch (err: any) {
      // Show the real reason (wrong password, email already registered, server down)
      console.warn('Email auth failed:', err);
      setErrorMessage(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="auth-modal-card"
        className="relative w-full max-w-[420px] bg-leaf-800 border border-white/[0.05] rounded-2xl p-7 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8)] border border-white/[0.06] text-white"
      >
        {/* Subtle 'X' Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Section */}
        <div className="text-center mb-6">
          <svg viewBox="0 0 32 32" className="w-12 h-12 mx-auto mb-3.5" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#22c55e" />
            <circle cx="16" cy="16" r="12" fill="#ffffff" />
            <circle cx="10.5" cy="13" r="3.6" fill="var(--color-pudina)" />
            <circle cx="16" cy="9.6" r="4.2" fill="var(--color-ragi)" />
            <circle cx="21.5" cy="13" r="3.2" fill="var(--color-chili)" />
          </svg>
          <h2 className="text-2xl font-bold text-rice">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-sm text-steel mt-1 leading-relaxed">
            {mode === 'signup'
              ? 'Save your plate, meals and streak, and pick them up on any visit.'
              : 'Sign in to see your plate, meals and streak.'}
          </p>
          {DEVICE_ONLY && (
            <p className="mt-3 rounded-lg bg-white/[0.06] px-3 py-2 text-xs leading-relaxed text-rice">
              Your account on this link is saved only in this browser, not on a server.
            </p>
          )}
        </div>

        {/* Error Alert Box with Instant Resolution Action */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <p className="font-medium text-xs leading-relaxed">{errorMessage}</p>
            </div>

            {/* Instant 1-Click Fix Button */}
            {showInstantOption && (
              <div className="pt-2 border-t border-rose-500/20 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleInstantSignIn()}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {email.trim() ? `Continue as ${name.trim() || email.trim()}` : 'Continue as a guest'}
                  </span>
                </button>
              </div>
            )}

            {isIframeBlocked && (
              <div className="pt-1">
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] transition"
                >
                  <span>Open in Direct New Tab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        )}

        {isGoogleSignInEnabled() && !DEVICE_ONLY && (
        <>
        {/* Social Auth: Full-width White Button */}
        <div>
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg bg-white hover:bg-slate-100 text-[#121212] font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 hover:brightness-105 active:scale-[0.99]"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{loading ? 'Connecting...' : 'Continue with Google'}</span>
          </button>
        </div>

        {/* Divider: Faint line with uppercase tracking text */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.08]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-leaf-800 px-3 text-white/40 uppercase tracking-widest font-bold text-[10px]">
              Or with email &amp; password
            </span>
          </div>
        </div>
        </>
        )}

        {/* Input Fields */}
        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/70 block">Full name</label>
              <div className="relative">
                <User className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => handleFieldChange(setName, e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-leaf-900 border border-white/[0.08] text-sm text-white placeholder-white/30 transition-all focus:border-[#f0a830] focus:ring-1 focus:ring-[#f0a830] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-white/70 block">Email address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => handleFieldChange(setEmail, e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-leaf-900 border border-white/[0.08] text-sm text-white placeholder-white/30 transition-all focus:border-[#f0a830] focus:ring-1 focus:ring-[#f0a830] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-white/70 block">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => handleFieldChange(setPassword, e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-leaf-900 border border-white/[0.08] text-sm text-white placeholder-white/30 transition-all focus:border-[#f0a830] focus:ring-1 focus:ring-[#f0a830] focus:outline-none"
              />
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full bg-turmeric hover:bg-[#4ade80] active:bg-turmeric-deep text-[#052e16] font-bold text-[15px] transition-colors flex items-center justify-center gap-2 cursor-pointer mt-4 disabled:opacity-50"
          >
            <span>{loading ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}</span>
          </button>
        </form>

        {/* Footer (Cleaned Up) */}
        <div className="mt-5 space-y-3 pt-2 text-center">
          {/* Sign Up / Sign In Toggle Text */}
          <p className="text-xs text-white/60">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                    setShowInstantOption(false);
                  }}
                  className="text-[#f0a830] hover:underline font-semibold cursor-pointer"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMessage(null);
                    setShowInstantOption(false);
                  }}
                  className="text-[#f0a830] hover:underline font-semibold cursor-pointer"
                >
                  Sign Up
                </button>
              </>
            )}
          </p>

          {/* Continue as a guest */}
          <button
            type="button"
            onClick={() => handleInstantSignIn()}
            className="text-xs text-white/40 hover:text-white/80 transition-colors flex items-center justify-center gap-1.5 mx-auto font-medium cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#f0a830]/70" />
            <span>Continue as a guest</span>
          </button>
        </div>
      </div>
    </div>
  );
};
