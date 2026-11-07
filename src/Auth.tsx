import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Sprout,
} from 'lucide-react';
import { api } from './lib';
import type { User } from './types';

export default function Auth({ onLogin }: { onLogin: (user: User, today: string) => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = {
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
      ...(register ? { name: String(form.get('name')).trim() } : {}),
    };
    try {
      const result = await api<{ user: User; today: string }>(
        `/auth/${register ? 'register' : 'login'}`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      onLogin(result.user, result.today);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/" aria-label="financia, início">
          <span className="brand-mark">
            f<span>•</span>
          </span>
          financia<span className="brand-dot">.</span>
        </a>
        <div className="story-body">
          <span className="eyebrow">
            <span className="tiny-dot" /> UM NOVO JEITO DE CUIDAR DO SEU DINHEIRO
          </span>
          <h1>
            Mais clareza.
            <br />
            Mais <span>tranquilidade.</span>
          </h1>
          <p>
            Suas contas em ordem.
            <br />
            Seus planos cada vez mais perto.
          </p>
          <div className="story-illustration" aria-hidden="true">
            <div className="illustration-orbit" />
            <div className="illustration-card">
              <div className="illustration-leaf">
                <Sprout size={30} strokeWidth={1.5} />
              </div>
              <small>UM PASSO DE CADA VEZ</small>
              <h3>
                Seu futuro
                <br />
                começa no presente.
              </h3>
              <div className="illustration-line">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="illustration-caption">
                <Check size={16} /> Espaço para novos planos <ArrowUpRight size={18} />
              </div>
            </div>
            <div className="floating-leaf">
              <Leaf size={28} strokeWidth={1.4} />
            </div>
          </div>
        </div>
        <div className="story-footer">Menos preocupação. Mais possibilidades.</div>
      </section>
      <main className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow">BEM-VINDO AO FINANCIA</span>
          <h2>{register ? 'Comece a organizar.' : 'Bom ter você por aqui.'}</h2>
          <p className="muted">
            {register
              ? 'Crie sua conta e dê o primeiro passo para uma vida financeira mais leve.'
              : 'Entre na sua conta e cuide do que importa.'}
          </p>
          <form onSubmit={submit} className="auth-form">
            {register && (
              <label>
                Seu nome
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Como podemos chamar você?"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              Senha
              <div className="password-field">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder={register ? 'Pelo menos 10 caracteres' : 'Sua senha'}
                  required
                  minLength={register ? 10 : 1}
                  maxLength={128}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary auth-submit" disabled={busy}>
              {busy ? 'Aguarde…' : register ? 'Criar minha conta' : 'Entrar na minha conta'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="auth-switch">
            {register ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}{' '}
            <button
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register ? 'Entrar' : 'Criar conta grátis'}
            </button>
          </div>
          <div className="auth-security">
            <LockKeyhole size={15} /> Seus dados são pessoais. Seu espaço também.
          </div>
        </div>
        <footer className="auth-footer">financia · Mais leveza para sua vida financeira.</footer>
      </main>
    </div>
  );
}
