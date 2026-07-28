import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Incorrect email or password.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-surface">
      {/* Left: institutional image panel (desktop only) */}
      <div className="hidden lg:flex relative bg-navy-900 overflow-hidden">
        <div
          className="absolute inset-0 opacity-40 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1584982751601-97dcc096659c?q=80&w=1400&auto=format&fit=crop')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/70 to-navy-900/30" />
        <div className="relative z-10 flex flex-col justify-end p-12 text-white">
          <div className="w-14 h-14 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl font-bold mb-6 border border-white/20">
            MC
          </div>
          <h1 className="text-3xl font-bold leading-tight">
            Malawi College of Health Sciences
          </h1>
          <p className="text-medblue-200 font-medium mt-1">Zomba Campus</p>
          <p className="text-navy-200 mt-6 max-w-md leading-relaxed">
            Coordinating clinical training placements across Malawi's districts —
            fair, transparent, and built around every student's rotation history.
          </p>
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 text-center">
            <div className="w-14 h-14 rounded-xl bg-navy-800 text-white flex items-center justify-center text-xl font-bold mx-auto mb-3">
              MC
            </div>
            <p className="text-sm font-semibold text-navy-500">Malawi College of Health Sciences</p>
            <p className="text-xs text-navy-400">Zomba Campus</p>
          </div>

          <h2 className="text-2xl font-bold text-navy-900">
            {forgotMode ? 'Reset your password' : 'Welcome back'}
          </h2>
          <p className="text-navy-400 text-sm mt-1 mb-8">
            {forgotMode
              ? 'Enter your college email and we will send you a reset link.'
              : 'Sign in to the Clinical Attachment Allocation System.'}
          </p>

          {resetSent ? (
            <div className="card p-5 bg-teal-50 border-teal-100">
              <p className="text-teal-700 text-sm font-medium">
                If an account exists for {email}, a password reset link has been sent.
              </p>
              <button
                className="text-sm font-semibold text-medblue-600 mt-4"
                onClick={() => {
                  setForgotMode(false);
                  setResetSent(false);
                }}
              >
                ← Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={forgotMode ? handleReset : handleSubmit} className="space-y-5">
              <div>
                <label className="label">Email / Username</label>
                <input
                  type="email"
                  required
                  className="input"
                  placeholder="you@mchs.ac.mw"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {!forgotMode && (
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    required
                    className="input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {error && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Please wait…' : forgotMode ? 'Send Reset Link' : 'Sign In'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-medblue-600 font-semibold hover:underline"
                  onClick={() => setForgotMode((f) => !f)}
                >
                  {forgotMode ? '← Back to Sign In' : 'Forgot Password?'}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-xs text-navy-300 mt-12">
            Designed &amp; Developed by Tambala Technologies
          </p>
        </div>
      </div>
    </div>
  );
}
