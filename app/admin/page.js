'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  apiFetch,
  formatDateTime,
  formatPhone,
  phoneDigits,
} from '../../lib/client-utils';

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const [eventInfo, setEventInfo] = useState(null);
  const [participants, setParticipants] = useState([]);

  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [addError, setAddError] = useState('');
  const [search, setSearch] = useState('');

  const [eventTitle, setEventTitle] = useState('');
  const [eventNote, setEventNote] = useState('');

  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3400);
  }

  async function loadDashboard() {
    const data = await apiFetch('/api/admin-data');
    setEventInfo(data.event);
    setParticipants(data.participants || []);
    setEventTitle(data.event?.title || '');
    setEventNote(data.event?.note || '');
    setLoggedIn(true);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadDashboard();
      } catch {
        setLoggedIn(false);
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  async function handleAdminLogin(e) {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      await apiFetch('/api/admin-auth', {
        method: 'POST',
        body: { login, password },
      });
      setPassword('');
      await loadDashboard();
      showToast('Bem-vindo ao Painel Admin! 🔐', 'success');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminLogout() {
    try {
      await apiFetch('/api/admin-auth', { method: 'DELETE' });
    } catch {
      // ignore
    }
    setLoggedIn(false);
    showToast('Sessão do admin encerrada.');
  }

  async function doAddMember() {
    setLoading(true);
    setAddError('');
    try {
      await apiFetch('/api/admin-data', {
        method: 'POST',
        body: { name: memberName.trim(), phone: memberPhone },
      });
      showToast(`${memberName.trim()} adicionado ao grupo!`, 'success');
      setMemberName('');
      setMemberPhone('');
      await loadDashboard();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleAddSubmit(e) {
    e.preventDefault();
    setAddError('');
    if (memberName.trim().length < 2) {
      setAddError('Digite um nome com pelo menos 2 letras.');
      return;
    }
    if (phoneDigits(memberPhone).length !== 11) {
      setAddError('Digite os 11 dígitos do telefone com DDD: (xx) x xxxx xxxx.');
      return;
    }
    if (eventInfo?.drawCompleted) {
      setConfirmModal({
        title: 'Adicionar novo membro?',
        body: 'O sorteio já foi realizado. Adicionar um novo participante vai limpar o sorteio atual para que todos participem juntos. Deseja continuar?',
        okLabel: 'Sim, adicionar',
        okClass: 'btn-primary',
        onConfirm: async () => {
          setConfirmModal(null);
          await doAddMember();
        },
      });
      return;
    }
    doAddMember();
  }

  function requestRunDraw() {
    const total = participants.length;
    if (total < 2) {
      showToast('Adicione pelo menos 2 participantes antes de sortear.', 'error');
      return;
    }
    const hadDraw = Boolean(eventInfo?.drawCompleted);
    setConfirmModal({
      title: hadDraw ? 'Refazer o sorteio?' : 'Realizar sorteio agora?',
      body: hadDraw
        ? `Isso vai gerar novos pares secretos para todos os ${total} participantes, substituindo o sorteio anterior.`
        : `Vamos sortear os ${total} participantes garantindo que ninguém tire a si mesmo e ninguém tire a mesma pessoa.`,
      okLabel: hadDraw ? 'Refazer sorteio' : 'Sortear agora 😈',
      okClass: 'btn-primary',
      onConfirm: async () => {
        setConfirmModal(null);
        setLoading(true);
        try {
          await apiFetch('/api/admin-draw', { method: 'POST' });
          showToast('Sorteio realizado com sucesso! Que comece o caos 😈', 'success');
          await loadDashboard();
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          setLoading(false);
        }
      },
    });
  }

  function requestResetDraw() {
    setConfirmModal({
      title: 'Limpar sorteio atual?',
      body: 'Todos os pares sorteados serão apagados até um novo sorteio ser realizado.',
      okLabel: 'Limpar sorteio',
      okClass: 'btn-danger',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await apiFetch('/api/admin-draw', { method: 'DELETE' });
          showToast('Sorteio limpo.');
          await loadDashboard();
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
    });
  }

  function requestDeleteMember(p) {
    setConfirmModal({
      title: `Remover ${p.name}?`,
      body: eventInfo?.drawCompleted
        ? `Remover ${p.name} também vai cancelar o sorteio atual, pois os pares ficarão incompletos.`
        : `Deseja remover ${p.name} do grupo?`,
      okLabel: 'Remover',
      okClass: 'btn-danger',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await apiFetch(`/api/admin-data?id=${p.id}`, { method: 'DELETE' });
          showToast(`${p.name} removido do grupo.`);
          await loadDashboard();
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
    });
  }

  function requestResetPassword(p) {
    setConfirmModal({
      title: `Resetar senha de ${p.name}?`,
      body: `A senha pessoal de ${p.name} será apagada para que possa criar uma nova no próximo acesso. O sorteio atual não será alterado.`,
      okLabel: 'Resetar senha',
      okClass: 'btn-primary',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await apiFetch('/api/admin-data', { method: 'PATCH', body: { id: p.id } });
          showToast(`Senha de ${p.name} resetada com sucesso.`, 'success');
          await loadDashboard();
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
    });
  }

  async function handleSaveEvent(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/api/admin-data', {
        method: 'PUT',
        body: { title: eventTitle, note: eventNote },
      });
      showToast('Informações do evento atualizadas!', 'success');
      await loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const total = participants.length;
  const withPass = participants.filter((p) => p.hasPassword).length;
  const revealed = participants.filter((p) => p.hasRevealed).length;
  const drawDone = Boolean(eventInfo?.drawCompleted);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? participants.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.phoneFormatted.toLowerCase().includes(q) ||
          phoneDigits(p.phoneFormatted).includes(phoneDigits(q))
      )
    : participants;

  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-badge" aria-hidden="true">😈</span>
          <span>
            INIMIGOS SECRETO INFINITOS{' '}
            <span style={{ color: 'var(--lime)', fontSize: '0.85rem' }}>ADMIN</span>
          </span>
        </Link>
        <nav className="nav-actions" aria-label="Navegação do administrador">
          <Link href="/" className="nav-link">← Site principal</Link>
          {loggedIn && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleAdminLogout}
            >
              Sair
            </button>
          )}
        </nav>
      </header>

      {checkingAuth ? (
        <main className="container">
          <div className="card" style={{ textAlign: 'center' }}>
            Carregando painel...
          </div>
        </main>
      ) : !loggedIn ? (
        <main className="container">
          <section className="hero" style={{ marginBottom: 22 }}>
            <div className="hero-eyebrow">🔐 Área Restrita</div>
            <h1>
              Painel do <span className="accent">Organizador</span>
            </h1>
            <p className="hero-subtitle">
              Entre para adicionar os participantes, gerenciar o grupo e disparar o sorteio sigiloso.
            </p>
          </section>

          <section className="card">
            <form onSubmit={handleAdminLogin} className="form-stack" noValidate>
              <div className="field">
                <label htmlFor="adminLogin">Login</label>
                <input
                  id="adminLogin"
                  type="text"
                  className="input"
                  placeholder="Digite o login do admin"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="adminPass">Senha</label>
                <div className="input-wrap">
                  <input
                    id="adminPass"
                    type={showPass ? 'text' : 'password'}
                    className="input input-with-toggle"
                    placeholder="Digite a senha do admin"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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

              {loginError && <div className="alert alert-error" role="alert">{loginError}</div>}

              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Verificando...' : 'Entrar no Painel Admin'}
              </button>
            </form>
          </section>
        </main>
      ) : (
        <main className="container container-wide">
          <section className="stats-grid" aria-label="Resumo do grupo">
            <div className="stat-card">
              <div className="stat-label">Participantes</div>
              <div className="stat-value lime">{total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Senhas criadas</div>
              <div className="stat-value">{withPass}/{total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Já revelaram</div>
              <div className="stat-value">{revealed}/{total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Status do sorteio</div>
              <div
                className={`stat-value ${drawDone ? 'emerald' : 'amber'}`}
                style={{ fontSize: '1.25rem', marginTop: 10 }}
              >
                {drawDone ? 'Realizado' : 'Pendente'}
              </div>
            </div>
          </section>

          <section className="card draw-banner">
            <div>
              <h2 className="card-title">
                {drawDone
                  ? 'Sorteio realizado com sigilo total ✅'
                  : 'Sorteio — INIMIGOS SECRETO INFINITOS'}
              </h2>
              <p className="card-subtitle">
                {drawDone
                  ? `Sorteio feito em ${formatDateTime(eventInfo?.drawAt)}. Cada participante já pode entrar com o telefone e senha pessoal para ver apenas o seu Inimigo Secreto.`
                  : 'Adicione todos os membros e clique em Realizar Sorteio. Ninguém tira a si mesmo, ninguém tira a mesma pessoa e nem o admin vê os pares.'}
              </p>
            </div>
            <div className="draw-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={requestRunDraw}
                disabled={total < 2 || loading}
              >
                {drawDone ? '🔄 Refazer Sorteio' : '🎲 Realizar Sorteio'}
              </button>
              {drawDone && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={requestResetDraw}
                >
                  Limpar Sorteio
                </button>
              )}
            </div>
          </section>

          <div className="admin-grid">
            <div>
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Adicionar participante</h2>
                    <p className="card-subtitle">Vincule o nome ao telefone com DDD.</p>
                  </div>
                </div>

                <form onSubmit={handleAddSubmit} className="form-stack" noValidate>
                  <div className="field">
                    <label htmlFor="memberName">Nome do participante</label>
                    <input
                      id="memberName"
                      type="text"
                      className="input"
                      placeholder="Ex: João Careca"
                      maxLength={60}
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="memberPhone">Telefone com DDD</label>
                    <input
                      id="memberPhone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={16}
                      className="input input-mono"
                      placeholder="(11) 9 8765 4321"
                      value={memberPhone}
                      onChange={(e) => setMemberPhone(formatPhone(e.target.value))}
                      required
                    />
                    <span className="field-hint">Formato: (xx) x xxxx xxxx</span>
                  </div>

                  {addError && <div className="alert alert-error" role="alert">{addError}</div>}

                  <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                    + Adicionar ao grupo
                  </button>
                </form>
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Personalizar evento</h2>
                    <p className="card-subtitle">Texto exibido na página principal para o grupo.</p>
                  </div>
                </div>
                <form onSubmit={handleSaveEvent} className="form-stack">
                  <div className="field">
                    <label htmlFor="evTitle">Nome do grupo / evento</label>
                    <input
                      id="evTitle"
                      type="text"
                      className="input"
                      maxLength={80}
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="evNote">Regras / aviso divertido</label>
                    <textarea
                      id="evNote"
                      className="input"
                      maxLength={240}
                      value={eventNote}
                      onChange={(e) => setEventNote(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-secondary btn-full" disabled={loading}>
                    Salvar informações
                  </button>
                </form>
              </section>
            </div>

            <section className="card">
              <div className="list-toolbar">
                <div>
                  <h2 className="card-title">Membros do grupo</h2>
                  <p className="card-subtitle">
                    {total === 1 ? '1 participante cadastrado' : `${total} participantes cadastrados`}
                  </p>
                </div>
                <input
                  type="search"
                  className="input search-input"
                  placeholder="Buscar nome ou telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="member-list">
                {total === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">😈</div>
                    <strong>Nenhum membro cadastrado ainda</strong>
                    <p style={{ margin: '6px 0 0', fontSize: '0.88rem' }}>
                      Adicione pelo menos 2 participantes ao lado para liberar o sorteio.
                    </p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="empty-state">
                    <strong>Nenhum resultado para &ldquo;{search}&rdquo;</strong>
                  </div>
                ) : (
                  filtered.map((p) => (
                    <div className="member-row" key={p.id}>
                      <div className="member-info">
                        <div className="member-name">{p.name}</div>
                        <div className="member-phone">{p.phoneFormatted}</div>
                        <div className="member-badges">
                          {p.hasPassword ? (
                            <span className="badge badge-ok">🔒 Senha criada</span>
                          ) : (
                            <span className="badge badge-wait">⏳ Sem senha</span>
                          )}
                          {drawDone &&
                            (p.hasRevealed ? (
                              <span className="badge badge-revealed">👀 Já revelou</span>
                            ) : (
                              <span className="badge badge-muted">🎁 Ainda não viu</span>
                            ))}
                        </div>
                      </div>
                      <div className="member-actions">
                        {p.hasPassword && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => requestResetPassword(p)}
                          >
                            Resetar senha
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => requestDeleteMember(p)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </main>
      )}

      <footer className="site-footer">
        Painel Admin &bull; INIMIGOS SECRETO INFINITOS &bull; Os pares sorteados são protegidos no
        servidor e nunca exibidos no painel.
      </footer>

      {confirmModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-box">
            <h3 className="modal-title">{confirmModal.title}</h3>
            <p className="modal-body">{confirmModal.body}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setConfirmModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`btn ${confirmModal.okClass} btn-sm`}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-banner ${toast.type}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </>
  );
}
