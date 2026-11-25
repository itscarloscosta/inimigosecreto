'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BAD_GIFT_IDEAS,
  apiFetch,
  formatPhone,
  phoneDigits,
} from '../lib/client-utils';

export default function HomePage() {
  const [step, setStep] = useState('phone'); // phone | register | login | dashboard
  const [publicInfo, setPublicInfo] = useState({
    title: 'INIMIGOS SECRETO INFINITOS',
    note: 'Esqueça o amigo secreto bonzinho. Aqui vale dar pente pra careca, camisa do time rival e qualquer presente hilário que a pessoa jamais pediu!',
    drawCompleted: false,
    totalParticipants: 0,
  });
  const [statusLabel, setStatusLabel] = useState('Carregando status do sorteio...');

  const [phone, setPhone] = useState('');
  const [matchedName, setMatchedName] = useState('');
  const [matchedPhone, setMatchedPhone] = useState('');

  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [profile, setProfile] = useState(null);
  const [revealedEnemy, setRevealedEnemy] = useState('');
  const [ideaIndex, setIdeaIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3400);
  }

  function applyInfo(info) {
    if (!info) return;
    setPublicInfo((prev) => ({ ...prev, ...info }));
    if (info.drawCompleted) {
      setStatusLabel(`Sorteio realizado! (${info.totalParticipants} participantes)`);
    } else {
      const countText =
        info.totalParticipants > 0
          ? `${info.totalParticipants} participante${info.totalParticipants === 1 ? '' : 's'} no grupo`
          : 'Grupo em formação';
      setStatusLabel(`Aguardando sorteio • ${countText}`);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const info = await apiFetch('/api/public-info');
        if (active) applyInfo(info);
      } catch (err) {
        if (active) {
          setStatusLabel(
            err.status === 503
              ? 'Conecte o banco PostgreSQL para iniciar'
              : 'Online'
          );
        }
      }

      try {
        const me = await apiFetch('/api/participant');
        if (active && me?.profile) {
          setProfile(me.profile);
          if (me.profile.event) {
            applyInfo({
              ...me.profile.event,
              totalParticipants: me.profile.totalParticipants,
            });
          }
          setStep('dashboard');
        }
      } catch {
        // not logged in
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleCheckPhone(e) {
    e.preventDefault();
    setError('');
    if (phoneDigits(phone).length !== 11) {
      setError('Digite os 11 dígitos do telefone com DDD: (xx) x xxxx xxxx.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch('/api/participant', {
        method: 'POST',
        body: { action: 'check-phone', phone },
      });
      setMatchedName(data.name);
      setMatchedPhone(data.phoneFormatted);
      setRegPassword('');
      setRegConfirm('');
      setLoginPassword('');
      setShowPass(false);
      setStep(data.status === 'needs_password' ? 'register' : 'login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (regPassword.length < 4) {
      setError('Crie uma senha com pelo menos 4 caracteres.');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('As duas senhas não são iguais. Tente novamente.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch('/api/participant', {
        method: 'POST',
        body: {
          action: 'register-password',
          phone: matchedPhone,
          password: regPassword,
          confirmPassword: regConfirm,
        },
      });
      setProfile(data.profile);
      setRevealedEnemy('');
      setStep('dashboard');
      showToast('Senha pessoal criada com sucesso! 🔒', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!loginPassword) {
      setError('Digite sua senha pessoal.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch('/api/participant', {
        method: 'POST',
        body: {
          action: 'login',
          phone: matchedPhone,
          password: loginPassword,
        },
      });
      setProfile(data.profile);
      setRevealedEnemy('');
      setStep('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReveal() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/participant', {
        method: 'POST',
        body: { action: 'reveal' },
      });
      setRevealedEnemy(data.enemy.name);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshStatus() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/participant');
      setProfile(data.profile);
      if (data.profile.event) {
        applyInfo({
          ...data.profile.event,
          totalParticipants: data.profile.totalParticipants,
        });
      }
      showToast(
        data.profile.event?.drawCompleted
          ? 'O sorteio foi liberado! 😈'
          : 'O sorteio ainda está pendente.',
        data.profile.event?.drawCompleted ? 'success' : 'info'
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await apiFetch('/api/participant', { method: 'POST', body: { action: 'logout' } });
    } catch {
      // ignore
    }
    setProfile(null);
    setRevealedEnemy('');
    setPhone('');
    setError('');
    setStep('phone');
    showToast('Você saiu da sua conta.');
  }

  const currentIdea = BAD_GIFT_IDEAS[ideaIndex % BAD_GIFT_IDEAS.length];

  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-badge" aria-hidden="true">😈</span>
          <span>{publicInfo.title}</span>
        </Link>
        <nav className="nav-actions" aria-label="Navegação principal">
          <Link href="/admin" className="nav-link">Painel Admin</Link>
        </nav>
      </header>

      <main className="container">
        <section className="hero">
          <div className="hero-eyebrow">🎁 Presentes duvidosos &bull; Sigilo total</div>
          <h1>
            INIMIGOS SECRETO <span className="accent">INFINITOS</span>
          </h1>
          <p className="hero-subtitle">{publicInfo.note}</p>
          <div className="status-strip">
            <span className={`status-dot ${publicInfo.drawCompleted ? 'ready' : ''}`} />
            <span>{statusLabel}</span>
          </div>
        </section>

        {step === 'phone' && (
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Acesse com seu telefone</h2>
                <p className="card-subtitle">
                  Digite o número com DDD que o organizador cadastrou no grupo.
                </p>
              </div>
            </div>

            <form onSubmit={handleCheckPhone} className="form-stack" noValidate>
              <div className="field">
                <label htmlFor="phoneInput">Seu telefone com DDD</label>
                <input
                  id="phoneInput"
                  type="tel"
                  inputMode="numeric"
                  maxLength={16}
                  className="input input-mono"
                  placeholder="(11) 9 9999 9999"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  required
                />
                <span className="field-hint">Formato obrigatório: (xx) x xxxx xxxx</span>
              </div>

              {error && <div className="alert alert-error" role="alert">{error}</div>}

              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Verificando...' : 'Continuar →'}
              </button>
            </form>
          </section>
        )}

        {step === 'register' && (
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Crie sua senha pessoal 🔒</h2>
                <p className="card-subtitle">
                  E aí, {matchedName}! Como é seu primeiro acesso, crie uma senha só sua para
                  ninguém bisbilhotar seu inimigo secreto.
                </p>
              </div>
            </div>

            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <strong>Guarde essa senha!</strong> Ela garante que apenas você consiga abrir seu
              sorteio usando o telefone <span className="input-mono">{matchedPhone}</span>.
            </div>

            <form onSubmit={handleRegister} className="form-stack" noValidate>
              <div className="field">
                <label htmlFor="regPass">Nova senha pessoal</label>
                <div className="input-wrap">
                  <input
                    id="regPass"
                    type={showPass ? 'text' : 'password'}
                    className="input input-with-toggle"
                    placeholder="Mínimo de 4 caracteres"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-pass"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label="Mostrar ou ocultar senha"
                  >
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="regConfirm">Confirmar senha pessoal</label>
                <input
                  id="regConfirm"
                  type={showPass ? 'text' : 'password'}
                  className="input"
                  placeholder="Repita sua senha"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  required
                />
              </div>

              {error && <div className="alert alert-error" role="alert">{error}</div>}

              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Criando senha...' : 'Salvar senha e entrar 😈'}
              </button>

              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    setError('');
                    setStep('phone');
                  }}
                >
                  ← Usar outro telefone
                </button>
              </div>
            </form>
          </section>
        )}

        {step === 'login' && (
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Digite sua senha pessoal 🔑</h2>
                <p className="card-subtitle">
                  Bem-vindo de volta, {matchedName} ({matchedPhone})!
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="form-stack" noValidate>
              <div className="field">
                <label htmlFor="loginPass">Sua senha pessoal</label>
                <div className="input-wrap">
                  <input
                    id="loginPass"
                    type={showPass ? 'text' : 'password'}
                    className="input input-with-toggle"
                    placeholder="Digite a senha que você criou"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-pass"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label="Mostrar ou ocultar senha"
                  >
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {error && <div className="alert alert-error" role="alert">{error}</div>}

              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar e ver meu sorteio →'}
              </button>

              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    setError('');
                    setStep('phone');
                  }}
                >
                  ← Trocar telefone
                </button>
              </div>
            </form>
          </section>
        )}

        {step === 'dashboard' && profile && (
          <section>
            <div className="user-banner">
              <div>
                <div className="user-banner-name">Olá, {profile.name}!</div>
                <div className="user-banner-phone">{profile.phoneFormatted}</div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
                Sair
              </button>
            </div>

            {!profile.event?.drawCompleted || !profile.enemy ? (
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 10 }}>⏳</div>
                <h2 className="card-title">O sorteio ainda não aconteceu!</h2>
                <p className="card-subtitle" style={{ margin: '10px auto 20px', maxWidth: '40ch' }}>
                  Sua senha pessoal já está protegida e garantida. Assim que o organizador apertar o
                  botão do sorteio no painel admin, seu Inimigo Secreto aparecerá aqui.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRefreshStatus}
                  disabled={loading}
                >
                  🔄 Verificar novamente
                </button>
              </div>
            ) : (
              <div className="card">
                <div className={`reveal-stage ${revealedEnemy ? 'is-revealed' : ''}`}>
                  {!revealedEnemy ? (
                    <>
                      <div className="reveal-icon">🎁</div>
                      <div className="reveal-label">Sigilo máximo ativado</div>
                      <h2 className="card-title" style={{ marginBottom: 8 }}>
                        Seu Inimigo Secreto está pronto!
                      </h2>
                      <p className="reveal-note">
                        Confira se não tem nenhum curioso olhando para sua tela antes de abrir o
                        envelope.
                      </p>
                      <button
                        type="button"
                        className="btn btn-pink"
                        onClick={handleReveal}
                        disabled={loading}
                      >
                        😈 Revelar meu Inimigo Secreto
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="reveal-icon">😈</div>
                      <div className="reveal-label">Você vai presentear</div>
                      <div className="enemy-name">{revealedEnemy}</div>
                      <p className="reveal-note">
                        Ninguém sabe que você tirou essa pessoa — e ninguém mais tirou ela. Capricha
                        na zoeira!
                      </p>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setRevealedEnemy('')}
                      >
                        🙈 Esconder nome da tela
                      </button>
                    </>
                  )}
                </div>

                <div className="gift-idea-box">
                  <div className="gift-idea-header">
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      💡 Sem ideia de presente ruim?
                    </span>
                    <span className="gift-idea-tag">{currentIdea.category}</span>
                  </div>
                  <div className="gift-idea-text">{currentIdea.title}</div>
                  <p className="gift-idea-why">{currentIdea.why}</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIdeaIndex((i) => i + 1)}
                  >
                    🎲 Sortear outra ideia malvada
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="site-footer">
        INIMIGOS SECRETO INFINITOS &bull; Cada participante vê apenas o próprio sorteio.
      </footer>

      {toast && (
        <div className={`toast-banner ${toast.type}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </>
  );
}
