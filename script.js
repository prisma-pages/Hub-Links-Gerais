/**
 * Hub Minimalista DJI Dark & Bento UI
 * Lógica de Relógio, Clima (Open-Meteo), Seed Diário de Frases e Links via Google Apps Script
 */

// 1. Constante da URL da API do Google Apps Script (limpa, sem espaços)
const API_URL =
  'https://script.google.com/macros/s/AKfycbxiyBqb1S-8oZJUEjf9DAStsftWgCB-TpqNL8NGYYKPMZWYwyyG9VgdOX2U2mMAoFZPLg/exec'.trim();

// Coordenadas padrão: Cariacica / Vitória - ES
const DEFAULT_COORDS = {
  latitude: -20.26,
  longitude: -40.42,
  label: 'CARIACICA / VITÓRIA - ES'
};

// Chave de sincronização limpa (v3) e remoção de caches antigos
const STORAGE_KEY = 'hub_links_sync_v3';

try {
  localStorage.removeItem('hub_links_gerais_swr_cache');
  localStorage.removeItem('hub_links_gerais_swr_cache_v2');
  localStorage.removeItem('hub_central_dados_cache_v1');
} catch {}

let dados = { links: [], frases: [] };

try {
  const cacheSalvo = localStorage.getItem(STORAGE_KEY);
  if (cacheSalvo) {
    const parsed = JSON.parse(cacheSalvo);
    if (parsed && Array.isArray(parsed.links) && Array.isArray(parsed.frases)) {
      dados = parsed;
    }
  }
} catch {}

let abaAtiva = 'inicio';
let sementeDataAtual = '';

// Paleta cíclica de gradientes (Laranja/Coral, Roxo/Magenta, Azul Ciano)
const ACCENT_THEMES = [
  { iconClass: 'gradient-orange', lineClass: 'line-orange' },
  { iconClass: 'gradient-purple', lineClass: 'line-purple' },
  { iconClass: 'gradient-cyan', lineClass: 'line-cyan' }
];

// 3. Função de normalização de texto (remove acentos, espaços extras e converte para minúsculas)
const normalizar = (str) =>
  str
    ? str
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
    : '';

/* ==========================================================================
   RELÓGIO DIGITAL E DATA POR EXTENSO (TEMPO REAL)
   ========================================================================== */
function getLocalYYYYMMDD(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatFullPortugueseDate(dateObj) {
  const diasSemana = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
  ];
  const meses = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro'
  ];

  const diaSemana = diasSemana[dateObj.getDay()];
  const diaMes = dateObj.getDate();
  const mes = meses[dateObj.getMonth()];
  const ano = dateObj.getFullYear();

  return `${diaSemana}, ${diaMes} de ${mes} de ${ano}`;
}

function obterSaudacaoHorario(dateObj = new Date()) {
  const hora = dateObj.getHours();
  if (hora >= 5 && hora < 12) {
    return 'Bom dia';
  } else if (hora >= 12 && hora < 18) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const clockEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  const greetingEl = document.getElementById('welcome-greeting');

  if (clockEl) clockEl.textContent = `${hours}:${minutes}:${seconds}`;
  if (dateEl) dateEl.textContent = formatFullPortugueseDate(now);
  if (greetingEl) {
    const saudacao = obterSaudacaoHorario(now);
    greetingEl.innerHTML = `${saudacao}, <span class="welcome-highlight">seja bem-vindo!</span>`;
  }

  // Verifica se o dia virou (00:00h) para atualizar automaticamente a Frase do Dia
  const todaySeed = getLocalYYYYMMDD(now);
  if (sementeDataAtual && sementeDataAtual !== todaySeed) {
    sementeDataAtual = todaySeed;
    renderDailyQuote();
  }
}

/* ==========================================================================
   CLIMA EM TEMPO REAL (OPEN-METEO API)
   ========================================================================== */
function getWeatherInfoFromWMO(code) {
  const sunSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2"></path><path d="M12 20v2"></path>
      <path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path>
      <path d="M2 12h2"></path><path d="M20 12h2"></path>
      <path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>
    </svg>`;

  const cloudSunSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2v2"></path><path d="m4.93 4.93 1.41 1.41"></path>
      <path d="M20 12h2"></path><path d="m19.07 4.93-1.41 1.41"></path>
      <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"></path>
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"></path>
    </svg>`;

  const cloudSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
    </svg>`;

  const rainSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
      <path d="M16 14v6"></path><path d="M8 14v6"></path><path d="M12 16v6"></path>
    </svg>`;

  const stormSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"></path>
      <path d="m13 12-3 5h4l-3 5"></path>
    </svg>`;

  if (code === 0) return { text: 'Céu limpo', svg: sunSvg };
  if (code === 1) return { text: 'Predominantemente limpo', svg: cloudSunSvg };
  if (code === 2) return { text: 'Parcialmente nublado', svg: cloudSunSvg };
  if (code === 3) return { text: 'Encoberto', svg: cloudSvg };
  if (code === 45 || code === 48) return { text: 'Neblina / Nevoeiro', svg: cloudSvg };
  if (code >= 51 && code <= 57) return { text: 'Garoa leve', svg: rainSvg };
  if (code >= 61 && code <= 67) return { text: 'Chuva moderada', svg: rainSvg };
  if (code >= 80 && code <= 82) return { text: 'Pancadas de chuva', svg: rainSvg };
  if (code >= 95) return { text: 'Tempestade com trovoadas', svg: stormSvg };

  return { text: 'Condição estável', svg: cloudSunSvg };
}

async function fetchWeatherByCoords(lat, lon, label = 'CLIMA ATUAL') {
  const tempEl = document.getElementById('weather-temp');
  const descEl = document.getElementById('weather-condition');
  const iconBoxEl = document.getElementById('weather-icon-box');
  const locEl = document.getElementById('weather-location');

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Falha ao buscar clima');

    const data = await response.json();
    const current = data.current_weather;

    if (current) {
      const temp = Math.round(current.temperature);
      const info = getWeatherInfoFromWMO(current.weathercode);

      if (tempEl) tempEl.textContent = `${temp}°C`;
      if (descEl) descEl.textContent = info.text;
      if (iconBoxEl) iconBoxEl.innerHTML = info.svg;
      if (locEl && label) locEl.textContent = label;
    }
  } catch (error) {
    console.warn('Erro ao consultar Open-Meteo:', error);
    if (descEl) descEl.textContent = 'Clima indisponível no momento';
  }
}

function initWeather() {
  fetchWeatherByCoords(
    DEFAULT_COORDS.latitude,
    DEFAULT_COORDS.longitude,
    'VITÓRIA / CARIACICA - ES'
  );

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetchWeatherByCoords(latitude, longitude, 'CLIMA LOCAL');
      },
      () => { },
      { timeout: 6000, maximumAge: 600000 }
    );
  }
}

/* ==========================================================================
   FRASE DO DIA (SEED HASH DETERMINÍSTICO POR DATA "YYYY-MM-DD")
   ========================================================================== */
function hashDateSeed(dateStr) {
  let hash = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    hash ^= dateStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return Math.abs(hash >>> 0);
}

function extrairTextoFrase(item) {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') {
    const valor =
      item.Frase ??
      item.frase ??
      item.Texto ??
      item.texto ??
      Object.values(item).find((v) => typeof v === 'string' && v.trim().length > 0) ??
      '';
    return String(valor).trim();
  }
  return '';
}

function normalizarItemLink(item) {
  if (!item || typeof item !== 'object') return null;

  // Busca flexível pelas chaves ignorando maiúsculas/minúsculas e variações de nomes de coluna
  const chaves = Object.keys(item);
  const obterValor = (possiveisNomes) => {
    for (const nomePossivel of possiveisNomes) {
      if (item[nomePossivel] !== undefined && item[nomePossivel] !== null) {
        return String(item[nomePossivel]).trim();
      }
      const chaveEncontrada = chaves.find(
        (k) => normalizar(k) === normalizar(nomePossivel)
      );
      if (chaveEncontrada && item[chaveEncontrada] !== undefined && item[chaveEncontrada] !== null) {
        return String(item[chaveEncontrada]).trim();
      }
    }
    return '';
  };

  const Nome = obterValor(['Nome', 'nome', 'titulo', 'Título', 'site', 'Site']);
  const URL = obterValor(['URL', 'url', 'link', 'Link', 'endereco', 'Endereço']);
  const Categoria = obterValor(['Categoria', 'categoria', 'aba', 'Aba', 'secao', 'Seção']);

  if (!Nome && !URL) return null;
  return { Nome: Nome || 'Link', URL: URL || '#', Categoria };
}

function renderDailyQuote() {
  const quoteEl = document.getElementById('daily-quote');
  if (!quoteEl) return;

  const listaFrases = Array.isArray(dados.frases) ? dados.frases : [];
  const validQuotes = listaFrases
    .map(extrairTextoFrase)
    .filter((q) => q.length > 0);

  if (validQuotes.length === 0) {
    quoteEl.textContent = 'Sincronizando frase do dia...';
    return;
  }

  const todaySeed = getLocalYYYYMMDD(new Date());
  sementeDataAtual = todaySeed;

  // Combina a data com o conteúdo atual de frases para refletir imediatamente qualquer edição na planilha
  const sementeCombinada = `${todaySeed}-${validQuotes.join('|')}`;
  const seedHash = hashDateSeed(sementeCombinada);
  const selectedIndex = seedHash % validQuotes.length;
  const chosenQuote = validQuotes[selectedIndex];

  quoteEl.textContent =
    chosenQuote.startsWith('"') || chosenQuote.startsWith('“')
      ? chosenQuote
      : `“${chosenQuote}”`;
}

/* ==========================================================================
   2. CONEXÃO COM A PLANILHA (GOOGLE APPS SCRIPT)
   ========================================================================== */
async function carregarDadosPlanilha() {
  try {
    const urlSemCache = `${API_URL}${API_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const response = await fetch(urlSemCache, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const jsonRecebido = await response.json();
    console.log('[Sucesso Planilha]', jsonRecebido);

    if (jsonRecebido && typeof jsonRecebido === 'object') {
      const arrayLinksBruto =
        jsonRecebido.links ||
        jsonRecebido.Links ||
        jsonRecebido.LINKS ||
        (Array.isArray(jsonRecebido) ? jsonRecebido : null);

      const arrayFrasesBruto =
        jsonRecebido.frases ||
        jsonRecebido.Frases ||
        jsonRecebido.FRASES ||
        null;

      if (Array.isArray(arrayLinksBruto)) {
        dados.links = arrayLinksBruto
          .map(normalizarItemLink)
          .filter((item) => item !== null);
      }

      if (Array.isArray(arrayFrasesBruto)) {
        dados.frases = arrayFrasesBruto
          .map(extrairTextoFrase)
          .filter((texto) => texto.length > 0);
      }

      console.log('[Hub Sync] Dados sincronizados da planilha:', dados);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
      } catch (e) {
        console.warn('Não foi possível salvar no localStorage:', e);
      }
    }
  } catch (error) {
    console.error('Erro ao buscar dados da planilha:', error);
  } finally {
    renderDailyQuote();
    if (abaAtiva !== 'inicio') {
      renderCategoryLinks(abaAtiva);
    }
  }
}

/* ==========================================================================
   4 & 5. NAVEGAÇÃO NAS 4 ABAS E CARDS DE LINKS
   ========================================================================== */
function getFaviconUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(rawUrl)}&sz=64`;
  }
}

function createCopyButton(url) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-btn';
  btn.title = 'Copiar URL para a área de transferência';

  const defaultHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span>Copiar Link</span>
  `;

  const copiedHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>Copiado!</span>
  `;

  btn.innerHTML = defaultHTML;

  btn.addEventListener('click', async (event) => {
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const tempInput = document.createElement('textarea');
      tempInput.value = url;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }

    btn.classList.add('copied');
    btn.innerHTML = copiedHTML;

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = defaultHTML;
    }, 1800);
  });

  return btn;
}

function renderCategoryLinks(categoriaSelecionada) {
  const gridEl = document.getElementById('links-grid');
  const titleEl = document.getElementById('current-category-title');
  const countEl = document.getElementById('current-category-count');

  if (!gridEl) return;

  // Garante visibilidade explícita em grid para o contentor de cards
  gridEl.style.display = 'grid';

  if (titleEl) titleEl.textContent = categoriaSelecionada.toUpperCase();
  gridEl.innerHTML = '';

  // Padroniza cada item antes de filtrar e compara normalizar(item.Categoria) === normalizar(categoriaSelecionada)
  const linksPadronizados = (dados.links || [])
    .map(normalizarItemLink)
    .filter((item) => item !== null);

  const linksFiltrados = linksPadronizados.filter(
    (item) => normalizar(item.Categoria) === normalizar(categoriaSelecionada)
  );

  if (countEl) {
    const total = linksFiltrados.length;
    countEl.textContent = `${total} ${total === 1 ? 'link' : 'links'}`;
  }

  if (linksFiltrados.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state">
        Nenhum link encontrado para <strong>${categoriaSelecionada}</strong>.
      </div>
    `;
    return;
  }

  linksFiltrados.forEach((item, index) => {
    const nome = (item.Nome || 'Link').toString().trim();
    const rawUrl = (item.URL || '#').toString().trim();
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    const theme = ACCENT_THEMES[index % ACCENT_THEMES.length];

    const card = document.createElement('article');
    card.className = 'bento-card link-card';
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Abrir ${nome} em nova aba`);

    const cardTop = document.createElement('div');
    cardTop.className = 'link-card-top';

    const iconBox = document.createElement('div');
    iconBox.className = `icon-box ${theme.iconClass}`;

    const favicon = document.createElement('img');
    favicon.className = 'favicon-img';
    favicon.src = getFaviconUrl(url);
    favicon.alt = '';
    favicon.loading = 'lazy';

    favicon.addEventListener('error', () => {
      iconBox.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      `;
    });

    iconBox.appendChild(favicon);
    const copyBtn = createCopyButton(url);

    cardTop.appendChild(iconBox);
    cardTop.appendChild(copyBtn);

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    const linkTitle = document.createElement('h2');
    linkTitle.className = 'link-name';
    linkTitle.textContent = nome;

    cardBody.appendChild(linkTitle);

    const neonLine = document.createElement('div');
    neonLine.className = `neon-line ${theme.lineClass}`;

    card.appendChild(cardTop);
    card.appendChild(cardBody);
    card.appendChild(neonLine);

    card.addEventListener('click', () => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });

    gridEl.appendChild(card);
  });
}

function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const homeSection = document.getElementById('home-section');
  const linksSection = document.getElementById('links-section');
  const linksGrid = document.getElementById('links-grid');

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const categoriaSelecionada = btn.getAttribute('data-tab');
      if (!categoriaSelecionada) return;

      abaAtiva = categoriaSelecionada;

      navButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (categoriaSelecionada === 'inicio') {
        // Oculta os cards de links e mostra os 3 cards iniciais
        linksSection.classList.remove('active-view');
        linksSection.style.display = 'none';

        homeSection.style.display = 'block';
        homeSection.classList.add('active-view');
        carregarDadosPlanilha();
      } else {
        // Oculta os 3 cards iniciais e mostra o contentor de links (grid)
        homeSection.classList.remove('active-view');
        homeSection.style.display = 'none';

        linksSection.style.display = 'block';
        linksSection.classList.add('active-view');
        if (linksGrid) linksGrid.style.display = 'grid';

        renderCategoryLinks(categoriaSelecionada);
        carregarDadosPlanilha();
      }
    });
  });
}

/* ==========================================================================
   INICIALIZAÇÃO
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Chama carregarDadosPlanilha() imediatamente antes de renderizar os cards
  carregarDadosPlanilha();

  updateClock();
  setInterval(updateClock, 1000);

  initWeather();
  setupNavigation();
  renderDailyQuote();

  // Atualização automática em tempo real (Polling a cada 60s + Visibilidade da aba)
  setInterval(carregarDadosPlanilha, 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      carregarDadosPlanilha();
    }
  });
});
