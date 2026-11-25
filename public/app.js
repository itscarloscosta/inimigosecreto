'use strict';

(() => {
  const {
    attachPhoneMask,
    attachPasswordToggles,
    phoneDigits,
    api,
    toast,
    launchEmojiBurst,
  } = window.InimigoUI;

  const BAD_GIFT_IDEAS = [
    {
      category: 'Clássico da zoeira',
      title: 'Pente de bolso chique pra quem é careca',
      why: 'Inútil na prática, inesquecível na hora de abrir o pacote.',
    },
    {
      category: 'Rivalidade pura',
      title: 'Caneca ou chaveiro do maior time rival',
      why: 'Garantia de uma cara de desgosto genuína em menos de 2 segundos.',
    },
    {
      category: 'Tortura leve',
      title: 'Quebra-cabeça de 1.000 peças totalmente branco',
      why: 'Um presente que parece fofo até a pessoa abrir a caixa.',
    },
    {
      category: 'Corporativo maligno',
      title: 'Caneca escrito "Eu amo reuniões na segunda às 7h"',
      why: 'Especialmente cruel pra quem odeia acordar cedo.',
    },
    {
      category: 'Estilo duvidoso',
      title: 'Chinelo de dedo com meia de dedos separados',
      why: 'A combinação proibida que desafia qualquer código da moda.',
    },
    {
      category: 'Praticidade zero',
      title: 'Um único pé de meia super estiloso',
      why: 'Pra pessoa passar o resto do ano procurando o par que nunca existiu.',
    },
    {
      category: 'Despertar traumático',
      title: 'Despertador analógico barulhento que toca igual sirene',
      why: 'Perfeito pra quem ama dormir até meio-dia no domingo.',
    },
    {
      category: 'Culinária duvidosa',
      title: 'Pano de prato motivacional super brega',
      why: 'Ideal pra quem só pede delivery e nunca encostou num fogão.',
    },
    {
      category: 'Humor ácido',
      title: 'Livro "Como amar pagar boletos e acordar às 5h"',
      why: 'Autoajuda que ninguém pediu e ninguém vai ler.',
    },
    {
      category: 'Fitness forçado',
      title: 'Corda de pular pra quem foge da academia',
      why: 'Vai virar decoração de quarto em 24 horas.',
    },
    {
      category: 'Gourmet ao contrário',
      title: 'Caixa gigante lindamente embrulhada com um miojo dentro',
      why: 'O peso emocional da expectativa quebrada não tem preço.',
    },
    {
      category: 'Nostalgia estranha',
      title: 'Calendário do ano passado',
      why: 'Tecnicamente ainda serve se a pessoa viajar no tempo.',
    },
    {
      category: 'Toque pessoal',
      title: 'Porta-retrato com uma foto SUA fazendo joinha',
      why: 'Pra pessoa nunca esquecer quem estragou o natal dela.',
    },
    {
      category: 'Minimalismo extremo',
      title: 'Uma pedra de estimação com certidão de adoção',
      why: 'Baixa manutenção e zero utilidade garantida.',
    },
  ];

  // State
  let currentPhone = '';
  let currentProfile = null;
  let ideaIndex = 0;

  // Elements
  const brandTitle = document.getElementById('brandTitle');
  const heroSubtitle = document.getElementById('heroSubtitle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  const viewPhone = document.getElementById('viewPhone');
  const viewRegister = document.getElementById('viewRegister');
  const viewLogin = document.getElementById('viewLogin');
  const viewDashboard = document.getElementById('viewDashboard');

  const phoneForm = document.getElementById('phoneForm');
  const phoneInput = document.getElementById('phoneInput');
  const phoneError = document.getElementById('phoneError');
  const phoneSubmitBtn = document.getElementById('phoneSubmitBtn');

  const registerForm = document.getElementById('registerForm');
  const registerGreeting = document.getElementById('registerGreeting');
  const registerPhoneLabel = document.getElementById('registerPhoneLabel');
  const regPassword = document.getElementById('regPassword');
  const regConfirm = document.getElementById('regConfirm');
  const registerError = document.getElementById('registerError');
  const registerSubmitBtn = document.getElementById('registerSubmitBtn');

  const loginForm = document.getElementById('loginForm');
  const loginGreeting = document.getElementById('loginGreeting');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');

  const dashUserName = document.getElementById('dashUserName');
  const dashUserPhone = document.getElementById('dashUserPhone');
  const dashWaitingCard = document.getElementById('dashWaitingCard');
  const dashRevealCard = document.getElementById('dashRevealCard');
  const revealStage = document.getElementById('revealStage');
  const revealLocked = document.getElementById('revealLocked');
  const revealOpened = document.getElementById('revealOpened');
  const enemyNameText = document.getElementById('enemyNameText');
  const revealBtn = document.getElementById('revealBtn');
  const hideEnemyBtn = document.getElementById('hideEnemyBtn');
  const refreshStatusBtn = document.getElementById('refreshStatusBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const ideaCategory = document.getElementById('ideaCategory');
  const ideaTitle = document.getElementById('ideaTitle');
  const ideaWhy = document.getElementById('ideaWhy');
  const nextIdeaBtn = document.getElementById('nextIdeaBtn');

  attachPhoneMask(phoneInput);
  attachPasswordToggles(document);

  function showView(target) {
    [viewPhone, viewRegister, viewLogin, viewDashboard].forEach((el) => {
      el.classList.toggle('hidden', el !== target);
    });
  }

  function showError(el, msg) {
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
    } else {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  function applyPublicInfo(info) {
    if (!info) return;
    if (info.title) {
      brandTitle.textContent = info.title;
      document.title = `${info.title} — Descubra quem você vai trollar`;
    }
    if (info.note) {
      heroSubtitle.textContent = info.note;
    }
    if (info.drawCompleted) {
      statusDot.classList.add('ready');
      statusText.textContent = `Sorteio realizado! (${info.totalParticipants} participantes)`;
    } else {
      statusDot.classList.remove('ready');
      const countText =
        info.totalParticipants > 0
          ? `${info.totalParticipants} participante${info.totalParticipants === 1 ? '' : 's'} no grupo`
          : 'Grupo em formação';
      statusText.textContent = `Aguardando sorteio • ${countText}`;
    }
  }

  function renderDashboard(profile) {
    currentProfile = profile;
    dashUserName.textContent = `Olá, ${profile.name}!`;
    dashUserPhone.textContent = profile.phoneFormatted;

    if (profile.event) {
      applyPublicInfo({
        ...profile.event,
        totalParticipants: profile.totalParticipants,
      });
    }

    // Always start with enemy name hidden on screen for over-the-shoulder privacy
    enemyNameText.textContent = '';
    revealOpened.classList.add('hidden');
    revealLocked.classList.remove('hidden');
    revealStage.classList.remove('is-revealed');

    if (profile.event && profile.event.drawCompleted && profile.enemy) {
      dashWaitingCard.classList.add('hidden');
      dashRevealCard.classList.remove('hidden');
    } else {
      dashRevealCard.classList.add('hidden');
      dashWaitingCard.classList.remove('hidden');
    }

    showView(viewDashboard);
  }

  function renderIdea() {
    const idea = BAD_GIFT_IDEAS[ideaIndex % BAD_GIFT_IDEAS.length];
    ideaCategory.textContent = idea.category;
    ideaTitle.textContent = idea.title;
    ideaWhy.textContent = idea.why;
  }

  // Event listeners
  document.querySelectorAll('[data-back-phone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      regPassword.value = '';
      regConfirm.value = '';
      loginPassword.value = '';
      showError(registerError, '');
      showError(loginError, '');
      showView(viewPhone);
      phoneInput.focus();
    });
  });

  phoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(phoneError, '');

    const raw = phoneInput.value;
    if (phoneDigits(raw).length !== 11) {
      showError(phoneError, 'Digite os 11 dígitos do telefone com DDD: (xx) x xxxx xxxx.');
      phoneInput.focus();
      return;
    }

    phoneSubmitBtn.disabled = true;
    phoneSubmitBtn.textContent = 'Verificando...';
    try {
      const data = await api('/api/participant/check-phone', {
        method: 'POST',
        body: { phone: raw },
      });
      currentPhone = data.phoneFormatted;

      if (data.status === 'needs_password') {
        registerGreeting.textContent = `E aí, ${data.name}! Como é seu primeiro acesso, crie uma senha pessoal para proteger seu sorteio.`;
        registerPhoneLabel.textContent = data.phoneFormatted;
        regPassword.value = '';
        regConfirm.value = '';
        showError(registerError, '');
        showView(viewRegister);
        regPassword.focus();
      } else {
        loginGreeting.textContent = `Bem-vindo de volta, ${data.name} (${data.phoneFormatted})!`;
        loginPassword.value = '';
        showError(loginError, '');
        showView(viewLogin);
        loginPassword.focus();
      }
    } catch (err) {
      showError(phoneError, err.message);
    } finally {
      phoneSubmitBtn.disabled = false;
      phoneSubmitBtn.textContent = 'Continuar →';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(registerError, '');

    const password = regPassword.value;
    const confirmPassword = regConfirm.value;

    if (password.length < 4) {
      showError(registerError, 'Crie uma senha com pelo menos 4 caracteres.');
      regPassword.focus();
      return;
    }
    if (password !== confirmPassword) {
      showError(registerError, 'As duas senhas não são iguais. Tente novamente.');
      regConfirm.focus();
      return;
    }

    registerSubmitBtn.disabled = true;
    registerSubmitBtn.textContent = 'Criando senha...';
    try {
      const data = await api('/api/participant/register-password', {
        method: 'POST',
        body: { phone: currentPhone, password, confirmPassword },
      });
      toast('Senha pessoal criada com sucesso! 🔒', 'success');
      renderDashboard(data.profile);
    } catch (err) {
      showError(registerError, err.message);
    } finally {
      registerSubmitBtn.disabled = false;
      registerSubmitBtn.textContent = 'Salvar senha e entrar 😈';
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(loginError, '');

    const password = loginPassword.value;
    if (!password) {
      showError(loginError, 'Digite sua senha pessoal.');
      loginPassword.focus();
      return;
    }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Entrando...';
    try {
      const data = await api('/api/participant/login', {
        method: 'POST',
        body: { phone: currentPhone, password },
      });
      renderDashboard(data.profile);
    } catch (err) {
      showError(loginError, err.message);
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Entrar e ver meu sorteio →';
    }
  });

  revealBtn.addEventListener('click', async () => {
    revealBtn.disabled = true;
    try {
      const data = await api('/api/participant/reveal', { method: 'POST' });
      enemyNameText.textContent = data.enemy.name;
      revealLocked.classList.add('hidden');
      revealOpened.classList.remove('hidden');
      revealStage.classList.add('is-revealed');
      launchEmojiBurst(revealStage);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      revealBtn.disabled = false;
    }
  });

  hideEnemyBtn.addEventListener('click', () => {
    enemyNameText.textContent = '';
    revealOpened.classList.add('hidden');
    revealLocked.classList.remove('hidden');
    revealStage.classList.remove('is-revealed');
  });

  refreshStatusBtn.addEventListener('click', async () => {
    refreshStatusBtn.disabled = true;
    try {
      const data = await api('/api/participant/me');
      renderDashboard(data.profile);
      if (data.profile.event && data.profile.event.drawCompleted) {
        toast('O sorteio foi liberado! 😈', 'success');
      } else {
        toast('O sorteio ainda está pendente.');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      refreshStatusBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/participant/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    currentProfile = null;
    enemyNameText.textContent = '';
    phoneInput.value = '';
    showView(viewPhone);
    toast('Você saiu da sua conta.');
  });

  nextIdeaBtn.addEventListener('click', () => {
    ideaIndex = (ideaIndex + 1) % BAD_GIFT_IDEAS.length;
    renderIdea();
  });

  // Initial load
  async function init() {
    renderIdea();
    try {
      const info = await api('/api/public-info');
      applyPublicInfo(info);
    } catch (err) {
      statusText.textContent =
        err.status === 503
          ? 'Banco de dados ainda não conectado na Vercel'
          : 'Online';
    }

    try {
      const me = await api('/api/participant/me');
      if (me && me.profile) {
        renderDashboard(me.profile);
        return;
      }
    } catch {
      // Not logged in yet — stay on phone step
    }
    showView(viewPhone);
  }

  init();
})();
