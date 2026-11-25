'use strict';

(() => {
  const {
    attachPhoneMask,
    attachPasswordToggles,
    phoneDigits,
    api,
    toast,
    escapeHtml,
    formatDateTime,
  } = window.InimigoUI;

  // State
  let dashboardState = {
    event: null,
    participants: [],
  };

  // Elements
  const adminLoginView = document.getElementById('adminLoginView');
  const adminDashboardView = document.getElementById('adminDashboardView');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');

  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminLoginInput = document.getElementById('adminLoginInput');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const adminLoginError = document.getElementById('adminLoginError');
  const adminLoginBtn = document.getElementById('adminLoginBtn');

  const statTotal = document.getElementById('statTotal');
  const statPasswords = document.getElementById('statPasswords');
  const statRevealed = document.getElementById('statRevealed');
  const statDrawStatus = document.getElementById('statDrawStatus');

  const drawTitle = document.getElementById('drawTitle');
  const drawDesc = document.getElementById('drawDesc');
  const runDrawBtn = document.getElementById('runDrawBtn');
  const resetDrawBtn = document.getElementById('resetDrawBtn');

  const addMemberForm = document.getElementById('addMemberForm');
  const memberNameInput = document.getElementById('memberNameInput');
  const memberPhoneInput = document.getElementById('memberPhoneInput');
  const addMemberError = document.getElementById('addMemberError');
  const addMemberBtn = document.getElementById('addMemberBtn');

  const eventConfigForm = document.getElementById('eventConfigForm');
  const eventTitleInput = document.getElementById('eventTitleInput');
  const eventNoteInput = document.getElementById('eventNoteInput');
  const saveEventBtn = document.getElementById('saveEventBtn');

  const memberCountLabel = document.getElementById('memberCountLabel');
  const searchMemberInput = document.getElementById('searchMemberInput');
  const memberList = document.getElementById('memberList');

  const confirmDialog = document.getElementById('confirmDialog');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmBody = document.getElementById('confirmBody');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmOkBtn = document.getElementById('confirmOkBtn');

  attachPhoneMask(memberPhoneInput);
  attachPasswordToggles(document);

  function showError(el, msg) {
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
    } else {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  function askConfirm({ title, body, okLabel = 'Confirmar', okClass = 'btn-danger' }) {
    return new Promise((resolve) => {
      confirmTitle.textContent = title;
      confirmBody.textContent = body;
      confirmOkBtn.textContent = okLabel;
      confirmOkBtn.className = `btn ${okClass} btn-sm`;

      const cleanup = (result) => {
        confirmOkBtn.removeEventListener('click', onOk);
        confirmCancelBtn.removeEventListener('click', onCancel);
        confirmDialog.removeEventListener('cancel', onCancel);
        if (confirmDialog.open) confirmDialog.close();
        resolve(result);
      };

      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      confirmOkBtn.addEventListener('click', onOk);
      confirmCancelBtn.addEventListener('click', onCancel);
      confirmDialog.addEventListener('cancel', onCancel);
      confirmDialog.showModal();
    });
  }

  function showAuth(loggedIn) {
    adminLoginView.classList.toggle('hidden', loggedIn);
    adminDashboardView.classList.toggle('hidden', !loggedIn);
    adminLogoutBtn.classList.toggle('hidden', !loggedIn);
  }

  function renderDashboard() {
    const { event, participants } = dashboardState;
    const total = participants.length;
    const withPass = participants.filter((p) => p.hasPassword).length;
    const revealed = participants.filter((p) => p.hasRevealed).length;
    const drawDone = Boolean(event && event.drawCompleted);

    statTotal.textContent = String(total);
    statPasswords.textContent = `${withPass}/${total}`;
    statRevealed.textContent = `${revealed}/${total}`;

    if (drawDone) {
      statDrawStatus.textContent = 'Realizado';
      statDrawStatus.className = 'stat-value emerald';
      drawTitle.textContent = 'Sorteio realizado com sigilo total ✅';
      drawDesc.textContent = `Sorteio feito em ${formatDateTime(event.drawAt)}. Cada participante já pode entrar com o telefone e senha pessoal para ver apenas o seu Inimigo Secreto.`;
      runDrawBtn.textContent = '🔄 Refazer Sorteio';
      resetDrawBtn.classList.remove('hidden');
    } else {
      statDrawStatus.textContent = 'Pendente';
      statDrawStatus.className = 'stat-value amber';
      drawTitle.textContent = 'Sorteio — INIMIGOS SECRETO INFINITOS';
      drawDesc.textContent =
        'Adicione todos os membros e clique em Realizar Sorteio. Ninguém tira a si mesmo, ninguém tira a mesma pessoa e nem o admin vê os pares.';
      runDrawBtn.textContent = '🎲 Realizar Sorteio';
      resetDrawBtn.classList.add('hidden');
    }

    runDrawBtn.disabled = total < 2;

    if (event) {
      eventTitleInput.value = event.title || '';
      eventNoteInput.value = event.note || '';
    }

    renderMemberList();
  }

  function renderMemberList() {
    const query = searchMemberInput.value.trim().toLowerCase();
    const all = dashboardState.participants;
    const filtered = query
      ? all.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.phoneFormatted.toLowerCase().includes(query) ||
            phoneDigits(p.phoneFormatted).includes(phoneDigits(query))
        )
      : all;

    memberCountLabel.textContent =
      all.length === 1 ? '1 participante cadastrado' : `${all.length} participantes cadastrados`;

    if (all.length === 0) {
      memberList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">😈</div>
          <strong>Nenhum membro cadastrado ainda</strong>
          <p style="margin: 6px 0 0; font-size: 0.88rem;">
            Adicione pelo menos 2 participantes ao lado para liberar o sorteio.
          </p>
        </div>
      `;
      return;
    }

    if (filtered.length === 0) {
      memberList.innerHTML = `
        <div class="empty-state">
          <strong>Nenhum resultado para "${escapeHtml(searchMemberInput.value)}"</strong>
        </div>
      `;
      return;
    }

    const drawDone = Boolean(dashboardState.event && dashboardState.event.drawCompleted);

    memberList.innerHTML = filtered
      .map((p) => {
        const passBadge = p.hasPassword
          ? '<span class="badge badge-ok">🔒 Senha criada</span>'
          : '<span class="badge badge-wait">⏳ Sem senha</span>';
        const revBadge = drawDone
          ? p.hasRevealed
            ? '<span class="badge badge-revealed">👀 Já revelou</span>'
            : '<span class="badge badge-muted">🎁 Ainda não viu</span>'
          : '';

        return `
          <div class="member-row" data-member-id="${p.id}">
            <div class="member-info">
              <div class="member-name">${escapeHtml(p.name)}</div>
              <div class="member-phone">${escapeHtml(p.phoneFormatted)}</div>
              <div class="member-badges">
                ${passBadge}
                ${revBadge}
              </div>
            </div>
            <div class="member-actions">
              ${
                p.hasPassword
                  ? `<button type="button" class="btn btn-secondary btn-sm" data-reset-pass="${p.id}" data-member-name="${escapeHtml(p.name)}">Resetar senha</button>`
                  : ''
              }
              <button type="button" class="btn btn-danger btn-sm" data-delete-member="${p.id}" data-member-name="${escapeHtml(p.name)}">Remover</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function loadDashboard() {
    const data = await api('/api/admin-data');
    dashboardState = data;
    showAuth(true);
    renderDashboard();
  }

  // Event listeners
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(adminLoginError, '');

    adminLoginBtn.disabled = true;
    adminLoginBtn.textContent = 'Verificando...';
    try {
      await api('/api/admin-auth', {
        method: 'POST',
        body: {
          login: adminLoginInput.value,
          password: adminPasswordInput.value,
        },
      });
      adminPasswordInput.value = '';
      toast('Bem-vindo ao Painel Admin! 🔐', 'success');
      await loadDashboard();
    } catch (err) {
      showError(adminLoginError, err.message);
    } finally {
      adminLoginBtn.disabled = false;
      adminLoginBtn.textContent = 'Entrar no Painel Admin';
    }
  });

  adminLogoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/admin-auth', { method: 'DELETE' });
    } catch {
      // ignore
    }
    showAuth(false);
    toast('Sessão do admin encerrada.');
  });

  addMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(addMemberError, '');

    const name = memberNameInput.value.trim();
    const phone = memberPhoneInput.value;

    if (name.length < 2) {
      showError(addMemberError, 'Digite um nome com pelo menos 2 letras.');
      memberNameInput.focus();
      return;
    }
    if (phoneDigits(phone).length !== 11) {
      showError(addMemberError, 'Digite os 11 dígitos do telefone com DDD: (xx) x xxxx xxxx.');
      memberPhoneInput.focus();
      return;
    }

    const hadDraw = Boolean(dashboardState.event && dashboardState.event.drawCompleted);
    if (hadDraw) {
      const ok = await askConfirm({
        title: 'Adicionar novo membro?',
        body: 'O sorteio já foi realizado. Adicionar um novo participante vai limpar o sorteio atual para que todos participem juntos. Deseja continuar?',
        okLabel: 'Sim, adicionar',
        okClass: 'btn-primary',
      });
      if (!ok) return;
    }

    addMemberBtn.disabled = true;
    addMemberBtn.textContent = 'Adicionando...';
    try {
      await api('/api/admin-data', {
        method: 'POST',
        body: { name, phone },
      });
      memberNameInput.value = '';
      memberPhoneInput.value = '';
      memberNameInput.focus();
      toast(`${name} adicionado ao grupo!`, 'success');
      await loadDashboard();
    } catch (err) {
      showError(addMemberError, err.message);
    } finally {
      addMemberBtn.disabled = false;
      addMemberBtn.textContent = '+ Adicionar ao grupo';
    }
  });

  memberList.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('[data-delete-member]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-delete-member');
      const name = deleteBtn.getAttribute('data-member-name');
      const hadDraw = Boolean(dashboardState.event && dashboardState.event.drawCompleted);
      const ok = await askConfirm({
        title: `Remover ${name}?`,
        body: hadDraw
          ? `Remover ${name} também vai cancelar o sorteio atual, pois os pares ficarão incompletos. Tem certeza?`
          : `Deseja remover ${name} do grupo?`,
        okLabel: 'Remover',
      });
      if (!ok) return;
      try {
        await api(`/api/admin-data?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        toast(`${name} removido do grupo.`);
        await loadDashboard();
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }

    const resetBtn = e.target.closest('[data-reset-pass]');
    if (resetBtn) {
      const id = Number(resetBtn.getAttribute('data-reset-pass'));
      const name = resetBtn.getAttribute('data-member-name');
      const ok = await askConfirm({
        title: `Resetar senha de ${name}?`,
        body: `A senha pessoal de ${name} será apagada para que possa criar uma nova no próximo acesso. O sorteio atual não será alterado.`,
        okLabel: 'Resetar senha',
        okClass: 'btn-primary',
      });
      if (!ok) return;
      try {
        await api('/api/admin-data', { method: 'PATCH', body: { id } });
        toast(`Senha de ${name} resetada com sucesso.`, 'success');
        await loadDashboard();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  runDrawBtn.addEventListener('click', async () => {
    const hadDraw = Boolean(dashboardState.event && dashboardState.event.drawCompleted);
    const total = dashboardState.participants.length;
    if (total < 2) {
      toast('Adicione pelo menos 2 participantes antes de sortear.', 'error');
      return;
    }

    const ok = await askConfirm({
      title: hadDraw ? 'Refazer o sorteio?' : 'Realizar sorteio agora?',
      body: hadDraw
        ? `Isso vai gerar novos pares secretos para todos os ${total} participantes, substituindo o sorteio anterior. Tem certeza?`
        : `Vamos sortear os ${total} participantes garantindo que ninguém tire a si mesmo e ninguém tire a mesma pessoa.`,
      okLabel: hadDraw ? 'Refazer sorteio' : 'Sortear agora 😈',
      okClass: 'btn-primary',
    });
    if (!ok) return;

    runDrawBtn.disabled = true;
    try {
      await api('/api/admin-draw', { method: 'POST' });
      toast('Sorteio realizado com sucesso! Que comece o caos 😈', 'success');
      await loadDashboard();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      runDrawBtn.disabled = false;
    }
  });

  resetDrawBtn.addEventListener('click', async () => {
    const ok = await askConfirm({
      title: 'Limpar sorteio atual?',
      body: 'Todos os pares sorteados serão apagados e ninguém poderá ver o resultado até um novo sorteio ser feito.',
      okLabel: 'Limpar sorteio',
    });
    if (!ok) return;

    try {
      await api('/api/admin-draw', { method: 'DELETE' });
      toast('Sorteio limpo.');
      await loadDashboard();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  eventConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveEventBtn.disabled = true;
    try {
      await api('/api/admin-data', {
        method: 'PUT',
        body: {
          title: eventTitleInput.value,
          note: eventNoteInput.value,
        },
      });
      toast('Informações do evento atualizadas!', 'success');
      await loadDashboard();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      saveEventBtn.disabled = false;
    }
  });

  searchMemberInput.addEventListener('input', renderMemberList);

  // Initial check
  async function init() {
    try {
      await loadDashboard();
    } catch {
      showAuth(false);
    }
  }

  init();
})();
