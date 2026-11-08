'use strict';

const details = document.querySelector('#calc-details');
const price = document.querySelector('#calc-price');
const calcNote = document.querySelector('#calc-note');
const orderForm = document.querySelector('#order-form');
const orderConfiguration = document.querySelector('#order-configuration');
const orderTotal = document.querySelector('#order-total');
const orderPrintNote = document.querySelector('#order-print-note');
const orderError = document.querySelector('#order-error');
const submitButton = document.querySelector('#submit-order');
const submitLabel = document.querySelector('#submit-label');
// Вставь публичный ключ формы из кабинета FormToMail между кавычками.
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

const inputs = Object.fromEntries(['edition', 'book', 'orientation', 'count'].map((field) => [
  field,
  [document.querySelector('#calc-' + field), document.querySelector('#form-' + field)],
]));
const tariffs = new Map();
document.querySelectorAll('#price-table table[data-edition]').forEach((table) => {
  table.querySelectorAll('tr[data-book]').forEach((row) => {
    row.querySelectorAll('td[data-pages]').forEach((cell) => {
      const key = [table.dataset.edition, row.dataset.book, cell.dataset.pages].join('/');
      tariffs.set(key, Number(cell.textContent.replace(/\s/g, '')));
    });
  });
});

function readOrder() {
  const edition = inputs.edition[0];
  const book = inputs.book[0];
  const pages = inputs.count[0].value;
  const direction = inputs.orientation[0];
  const bookOption = book.selectedOptions[0];
  const label = bookOption.dataset.label;
  const dimensions = bookOption.dataset[direction.value];
  const orientation = direction.selectedOptions[0].textContent;
  const tariff = tariffs.get([edition.value, book.value, pages].join('/'));
  return {
    edition: edition.selectedOptions[0].textContent,
    printed: edition.value === 'print',
    label, dimensions, orientation, pages, tariff,
  };
}

function updateEstimate() {
  const { edition, printed, label, dimensions, orientation, pages, tariff } = readOrder();
  const configuration = [edition, label, orientation, dimensions, pages + ' страниц'].join(' · ');
  const formatted = Number.isFinite(tariff) ? numberFormat.format(tariff) + ' ₽' : '—';
  details.textContent = configuration;
  price.textContent = formatted;
  orderConfiguration.textContent = configuration;
  orderTotal.textContent = 'Предварительная цена — ' + formatted;
  calcNote.textContent = printed
    ? 'Предварительная цена за один экземпляр. Доставка рассчитывается отдельно.'
    : 'Предварительная цена. Подтвердим её, когда обсудим ваш сюжет.';
  orderPrintNote.hidden = !printed;
  orderPrintNote.textContent = ['10', '14'].includes(pages)
    ? 'Доставка рассчитывается отдельно. При скреплении на скобу возможны две пустые технические страницы.'
    : 'Доставка рассчитывается отдельно.';
  submitButton.disabled = sending || !Number.isFinite(tariff);
}

Object.values(inputs).forEach((pair) => {
  pair.forEach((select) => {
    select.addEventListener('change', () => {
      pair.forEach((other) => { other.value = select.value; });
      orderSuccess.textContent = '';
      orderError.hidden = true;
      updateEstimate();
    });
  });
});

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
  const order = readOrder();
  if (!Number.isFinite(order.tariff)) return;

  const data = new FormData(orderForm);
  const fields = [
    ['Имя', data.get('name')],
    ['Почта для ответа', data.get('email')],
    ['Издание', order.edition],
    ['Формат книги', order.label],
    ['Размер', order.dimensions],
    ['Ориентация', order.orientation],
    ['Страниц сказки без обложки', order.pages],
    ['Предварительная цена', numberFormat.format(order.tariff) + ' ₽'],
    ['Пожелания', data.get('message')],
  ].map(([label, value]) => [label, String(value ?? '').trim()]).filter(([, value]) => value);
  orderError.hidden = true;
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
    for (const name of ['name', 'email', 'message']) {
      const field = orderForm.elements.namedItem(name);
      if (field.value === data.get(name)) field.value = '';
    }
    const consent = orderForm.querySelector('#contact-consent');
    consent.checked = false;
    orderSuccess.textContent = 'Заявка отправлена. Ответим на указанную почту.';
  } catch {
    orderError.textContent = 'Отправка не подтверждена. Проверьте соединение и попробуйте ещё раз.';
    orderError.hidden = false;
  } finally {
    clearTimeout(timer);
    sending = false;
    updateEstimate();
    submitLabel.textContent = 'Отправить заявку';
  }
});

window.addEventListener('pageshow', () => {
  Object.values(inputs).forEach(([calculator, form]) => { form.value = calculator.value; });
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
