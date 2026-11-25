export function formatPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length === 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)}`;
}

export function phoneDigits(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  return digits;
}

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Ocorreu um erro inesperado.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const BAD_GIFT_IDEAS = [
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
    category: 'Gourmet ao contrário',
    title: 'Caixa gigante lindamente embrulhada com um miojo dentro',
    why: 'O peso emocional da expectativa quebrada não tem preço.',
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
