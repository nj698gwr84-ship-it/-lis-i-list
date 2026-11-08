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
const submitLabel = document.querySelector('#submit-label');

const FORMTOMAIL_PUBLIC_KEY = '0CN5NGqsf0zlz6tv';
const formKey = FORMTOMAIL_PUBLIC_KEY.trim();
const onlineForm = Boolean(formKey);
const orderAddress = 'games.tema@mail.ru';
let sending = false;

const orderSuccess = document.createElement('p');
orderSuccess.setAttribute('role', 'status');
orderError.after(orderSuccess);

if (onlineForm) {
  submitLabel.textContent = 'Отправить заявку';
  document.querySelector('#data-note').textContent = 'Контакт, пожелания и параметры книги передаются через FormToMail, чтобы мастерская могла ответить на заявку. Фото и данные ребёнка обсудим позже.';
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

const orderFields = [
  ['name', 'Имя'],
  ['email', 'Почта для ответа'],
  ['Формат', 'Формат'],
  ['Размер', 'Размер'],
  ['Страниц без обложки', 'Страниц без обложки'],
  ['Предварительная цена', 'Предварительная цена'],
  ['message', 'Пожелания'],
];

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br>');
}

function openEmail(fields) {
  const lines = fields.map(([label, value]) => label + ': ' + value);
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
  const fields = orderFields.map(([name, label]) => [label, String(data.get(name) ?? '').trim()])
    .filter(([, value]) => value);
  orderSuccess.textContent = '';

  if (!onlineForm) {
    openEmail(fields);
    return;
  }

  sending = true;
  submitButton.disabled = true;
  submitLabel.textContent = 'Отправляем…';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('https://api.formtomail.ru/send', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + formKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Лис и Лист — новая заявка на сказку',
        body: Object.fromEntries(fields.map(([label, value]) => [label, escapeHtml(value)])),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Сервис вернул код ' + response.status);
    const result = await response.json();
    if (result.statusCode !== 200) throw new Error('Сервис не подтвердил отправку');
    orderForm.reset();
    orderSuccess.textContent = 'Заявка отправлена. Ответим на указанную почту.';
  } catch {
    orderError.textContent = 'Отправка не подтверждена. Проверьте соединение и попробуйте ещё раз.';
    orderError.hidden = false;
  } finally {
    clearTimeout(timer);
    sending = false;
    submitButton.disabled = !pageInput.validity.valid;
    submitLabel.textContent = 'Отправить заявку';
  }
});

window.addEventListener('pageshow', updateEstimate);
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