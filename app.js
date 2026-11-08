'use strict';

const pageInput = document.querySelector('#pages');
const pageHint = document.querySelector('#pages-hint');
const details = document.querySelector('#calc-details');
const price = document.querySelector('#calc-price');
const calcNote = document.querySelector('#calc-note');
const useEstimate = document.querySelector('#use-estimate');
const orderForm = document.querySelector('#order-form');
const orderSummary = document.querySelector('#order-summary');
const orderError = document.querySelector('#order-error');
const submitButton = document.querySelector('#submit-order');
const emailButton = document.querySelector('#email-order');
const submitLabel = document.querySelector('#submit-label');
const formEndpoint = orderForm.dataset.endpoint.trim();
const onlineForm = /^https:\/\/api\.tuqo\.ru\/f\/[\w-]+\/?$/.test(formEndpoint);
const formShownAt = Date.now();
const orderAddress = 'games.tema@mail.ru';
let sending = false;
let lastPayload = '';
let requestId = '';

if (onlineForm) {
  emailButton.hidden = false;
  submitLabel.textContent = 'Отправить заявку';
  document.querySelector('#data-note').textContent = 'При отправке с сайта контакт, пожелания и параметры книги передаются через Tuqo. Уведомление приходит на ' + orderAddress + '. В пожеланиях достаточно указать тему сказки. Фото и данные ребёнка обсудим позже.';
}

const numberFormat = new Intl.NumberFormat('ru-RU');

const columns = ['pdf-A5', 'pdf-A4', 'print-A5', 'print-A4'];
const tariffs = [...document.querySelectorAll('#price-table tbody tr')].map((row) => {
  const [pages, ...prices] = [...row.cells].map((cell) => Number(cell.textContent.replace(/\s/g, '')));
  return { pages, prices };
});

const sizes = {
  A5: { name: 'А5', dimensions: '210 × 148 мм' },
  A4: { name: 'А4', dimensions: '297 × 210 мм' },
};

const editions = {
  pdf: { label: 'PDF', name: 'Электронная книга (PDF)' },
  print: { label: 'Печатная книга', name: 'Печатная книга, мягкая обложка, 1 экз.' },
};

const pluralPages = new Intl.PluralRules('ru-RU');
const pagesLabel = { one: 'страница', few: 'страницы', many: 'страниц', other: 'страницы' };

function estimatePrice(edition, size, pages) {
  const column = columns.indexOf(edition + '-' + size);
  const exact = tariffs.find((tariff) => tariff.pages === pages);
  if (exact) return exact.prices[column];

  const upperIndex = tariffs.findIndex((tariff) => tariff.pages > pages);
  const upper = tariffs[upperIndex];
  const lower = tariffs[upperIndex - 1];
  const share = (pages - lower.pages) / (upper.pages - lower.pages);
  return Math.round(lower.prices[column] + share * (upper.prices[column] - lower.prices[column]));
}

function updateEstimate() {
  const edition = document.querySelector('input[name="edition"]:checked').value;
  const size = document.querySelector('input[name="size"]:checked').value;
  const pages = pageInput.valueAsNumber;
  const printed = edition === 'print';

  pageInput.step = printed ? '4' : '1';
  pageHint.textContent = printed ? 'Для печати — 8, 12 или 16.' : 'От 8 до 16 страниц.';
  const valid = pageInput.validity.valid;

  pageInput.setAttribute('aria-invalid', String(!valid));
  useEstimate.setAttribute('aria-disabled', String(!valid));
  submitButton.disabled = !valid || sending;
  emailButton.disabled = !valid;
  orderError.hidden = valid;
  orderError.textContent = valid ? '' : 'Укажите допустимое количество страниц в калькуляторе.';

  if (!valid) {
    details.textContent = 'Уточните количество страниц';
    price.textContent = '—';
    calcNote.textContent = printed ? 'Выберите 8, 12 или 16 страниц для печати.' : 'Введите целое число от 8 до 16.';
    orderSummary.textContent = 'Уточните количество страниц в калькуляторе.';
    return;
  }

  const configuration = editions[edition].label + ' · ' + sizes[size].name + ' · ' + pages + ' ' + pagesLabel[pluralPages.select(pages)];
  const formattedPrice = numberFormat.format(estimatePrice(edition, size, pages)) + ' ₽';
  details.textContent = configuration;
  price.textContent = formattedPrice;
  calcNote.textContent = printed
    ? 'Предварительная цена за один экземпляр. Доставку рассчитаем отдельно.'
    : 'Предварительная цена. Подтвердим её, когда обсудим ваш сюжет.';
  orderSummary.textContent = configuration + ' · ' + formattedPrice;
  document.querySelector('#order-edition').value = editions[edition].name;
  document.querySelector('#order-size').value = sizes[size].name + ' (' + sizes[size].dimensions + ')';
  document.querySelector('#order-pages').value = String(pages);
  document.querySelector('#order-price').value = formattedPrice;
}

document.querySelectorAll('input[name="edition"], input[name="size"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (input.name === 'edition' && input.value === 'print' && Number.isFinite(pageInput.valueAsNumber)) {
      const closest = tariffs.reduce((best, tariff) =>
        Math.abs(tariff.pages - pageInput.valueAsNumber) < Math.abs(best.pages - pageInput.valueAsNumber)
          ? tariff
          : best
      );
      pageInput.value = String(closest.pages);
    }
    updateEstimate();
  });
});

pageInput.addEventListener('input', updateEstimate);
useEstimate.addEventListener('click', (event) => {
  if (!pageInput.validity.valid) {
    event.preventDefault();
    pageInput.reportValidity();
  }
});

function openEmail(data) {
  const fields = [
    ['name', 'Имя'],
    ['email', 'Почта для ответа'],
    ['Формат', 'Формат'],
    ['Размер', 'Размер'],
    ['Страниц без обложки', 'Страниц без обложки'],
    ['Предварительная цена', 'Предварительная цена'],
    ['message', 'Пожелания'],
  ];
  const lines = fields
    .filter(([name]) => data.get(name).trim())
    .map(([name, label]) => label + ': ' + data.get(name).trim());
  const subject = encodeURIComponent('Лис и Лист — новая заявка на сказку');
  const body = encodeURIComponent(lines.join('\r\n'));
  location.href = 'mailto:' + orderAddress + '?subject=' + subject + '&body=' + body;
}

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending) return;

  updateEstimate();
  if (!pageInput.reportValidity()) return;
  const data = new FormData(orderForm);

  if (!onlineForm) {
    openEmail(data);
    return;
  }

  if (Date.now() - formShownAt < 3200) {
    orderError.textContent = 'Подождите несколько секунд и отправьте заявку снова.';
    orderError.hidden = false;
    return;
  }

  const payload = JSON.stringify(Object.fromEntries(data));
  if (payload !== lastPayload) {
    requestId = crypto.randomUUID();
    lastPayload = payload;
  }
  data.set('_submit_time', String(formShownAt));
  data.set('_request_id', requestId);
  sending = true;
  submitButton.disabled = true;
  submitLabel.textContent = 'Отправляем…';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(formEndpoint, {
      method: 'POST',
      body: new URLSearchParams(data),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Сервис вернул код ' + response.status);
    location.assign(new URL('thanks.html', location.href));
  } catch {
    sending = false;
    submitLabel.textContent = 'Отправить заявку';
    updateEstimate();
    orderError.textContent = 'Сайт не получил подтверждение. Попробуйте снова или отправьте заявку через почтовое приложение.';
    orderError.hidden = false;
  } finally {
    clearTimeout(timer);
  }
});

emailButton.addEventListener('click', () => {
  updateEstimate();
  if (pageInput.reportValidity() && orderForm.reportValidity()) {
    openEmail(new FormData(orderForm));
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted && onlineForm) {
    sending = false;
    submitLabel.textContent = 'Отправить заявку';
  }
  updateEstimate();
});
updateEstimate();

const dialog = document.querySelector('#story-dialog');
const dialogImage = document.querySelector('#story-dialog-image');
const dialogTitle = document.querySelector('#story-dialog-title');

document.querySelectorAll('.story-image').forEach((button) => {
  button.addEventListener('click', () => {
    const image = button.querySelector('img');
    dialogImage.src = image.currentSrc || image.src;
    dialogImage.alt = image.alt;
    dialogTitle.textContent = button.closest('figure').querySelector('h3').textContent;
    dialog.showModal();
  });
});
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
