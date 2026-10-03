/**
 * ============================================================================
 *  CosmoEmpire — бэкенд каталога (Google Apps Script)
 * ----------------------------------------------------------------------------
 *  Что делает:
 *    1. Создаёт таблицу с колонками и форматированием.
 *    2. Отдаёт товары в JSON для страницы каталога (doGet).
 *    3. Принимает новые товары из формы (doPost).
 *    4. Считает просмотры карточек — по ним работает «сортировка по популярности».
 *
 *  КАК УСТАНОВИТЬ: см. файл ИНСТРУКЦИЯ.md, раздел «Шаг 4».
 * ============================================================================
 */

/** Название листа с товарами. */
var SHEET_NAME = 'Товары';

/** Порядок колонок в таблице. Скрипт создаёт лист именно так. */
var HEADERS = [
  'Название',        // A — обязательное
  'Игра',            // B — обязательное
  'Описание',        // C — обязательное
  'Цена',            // D — обязательное, число
  'Теги',            // E — через запятую
  'Изображение',     // F — URL картинки или ID файла Google Диска
  'Дата добавления', // G — проставляется автоматически
  'Тип',             // H — необязательная, для фильтра «Тип»
  'Просмотры'        // I — необязательная, для сортировки по популярности
];

/* ============================================================================
 *  Точка входа: чтение данных (GET)
 * ========================================================================== */
function doGet(e) {
  var param = (e && e.parameter) ? e.parameter : {};
  var action = param.action || 'items';

  try {
    if (action === 'ping') {
      return json({ ok: true, message: 'CosmoEmpire API работает', time: new Date().toISOString() });
    }
    if (action === 'items') {
      return json({ ok: true, items: readItems() });
    }
    if (action === 'view') {
      return json({ ok: true, views: incrementViews(param.id) });
    }
    return json({ ok: false, error: 'Неизвестное действие: ' + action });
  } catch (err) {
    return json({ ok: false, error: errorText(err) });
  }
}

/* ============================================================================
 *  Точка входа: отправка формы (POST)
 * ========================================================================== */
function doPost(e) {
  try {
    var data = (e && e.parameter) ? e.parameter : parseJsonBody(e);

    /* Защита от спама: скрытое поле должно остаться пустым */
    if (data.website) return json({ ok: true, ignored: true });

    var item = {
      name:        clean(data.name),
      game:        clean(data.game),
      description: clean(data.description),
      price:       parseNumber(data.price),
      tags:        clean(data.tags),
      image:       normalizeImage(data.image),
      type:        clean(data.type),
      addedAt:     new Date(),
      views:       0
    };


/* ============================================================================
 *  Работа с таблицей
 * ========================================================================== */

/** Возвращает лист, создавая его вместе с заголовками при необходимости. */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  var isBlank = sheet.getLastRow() === 0 || String(sheet.getRange(1, 1).getValue()).trim() === '';
  if (isBlank) setupSheet(sheet);
  return sheet;
}

/** Создаёт и оформляет лист: заголовки, закрепление строки, форматы. */
function setupSheet(sheet) {
  sheet = sheet || getSheetRaw();
  sheet.clear();

  var header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setValues([HEADERS]);
  header.setFontWeight('bold')
        .setBackground('#1a1f45')
        .setFontColor('#ffffff')
        .setFontSize(11)
        .setVerticalAlignment('middle')
        .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  var widths = [260, 130, 380, 110, 200, 240, 130, 120, 100];
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }

  /* Дата добавления — настоящая дата, а не текст */
  sheet.getRange('G2:G').setNumberFormat('dd.MM.yyyy');
  sheet.getRange('D2:D').setNumberFormat('#,##0');
  sheet.getRange('I2:I').setNumberFormat('0');

  /* Цена: проверка ввода прямо в таблице */
  var rule = SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false)
    .setHelpText('Цена должна быть числом: например 1500 или 1500,50')
    .build();
  sheet.getRange('D2:D').setDataValidation(rule);

  return sheet;
}

/** Лист без заголовков — используется только внутри setupSheet. */
function getSheetRaw() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  return sheet || ss.insertSheet(SHEET_NAME);
}

/** Читает все товары в массив объектов. Пустые строки пропускаются. */
function readItems() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var items = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var name = clean(row[0]);
    if (!name) continue; // пустая строка — пропускаем

    items.push({
      id:          i + 2,             // номер строки — стабильный идентификатор
      name:        name,
      game:        clean(row[1]),
      description: clean(row[2]),
      price:       parseNumber(row[3]),
      tags:        clean(row[4]),
      image:       normalizeImage(row[5]),
      addedAt:     toIso(row[6]),
      type:        clean(row[7]),
      views:       parseNumber(row[8])
    });
  }
  return items;
}

/** Дописывает новый товар в конец таблицы и подсвечивает строку. */
function appendItem(item) {
  var sheet = getSheet();
  sheet.appendRow([
    item.name,
    item.game,
    item.description,
    item.price,
    item.tags,
    item.image,
    item.addedAt,
    item.type,
    item.views
  ]);

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1, 1, HEADERS.length)
       .setBackground('#e8f5e9')
       .setVerticalAlignment('top');

  return lastRow;
}

/** Увеличивает счётчик просмотров товара по номеру строки. */
function incrementViews(id) {
  var sheet = getSheet();
  var rowNum = parseNumber(id);

/* ============================================================================
 *  Вспомогательные функции
 * ========================================================================== */

/** Обрезает пробелы и невидимые символы, приводит к строке. */
function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

/** Любое значение -> число. "1 500 ₽" и "1500,50" тоже распознаются. */
function parseNumber(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();

  var text = clean(value);
  if (!text) return 0;

  /* Убираем всё, кроме цифр, запятой и точки, затем нормализуем разделитель */
  text = text.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!text) return 0;

  /* Если запятых больше, чем точек — это десятичный разделитель */
  if ((text.match(/,/g) || []).length > (text.match(/\./g) || []).length) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    text = text.replace(/,/g, '');
  }

  var n = parseFloat(text);
  return isFinite(n) ? n : 0;
}

/** Значение ячейки -> строка ISO для фронтенда ('' если пусто). */
function toIso(value) {
  if (!value && value !== 0) return '';
  var date = (value instanceof Date) ? value : new Date(value);
  return isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Принимает https-ссылку, ID файла Диска или пустое значение. */
function normalizeImage(value) {
  var url = clean(value);
  if (!url) return '';

  /* Ссылка на файл Google Диска -> прямая ссылка просмотра */
  var drive = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (drive) return 'https://drive.google.com/uc?export=view&id=' + drive[1];

  /* Голый ID файла Диска */
  if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) {
    return 'https://drive.google.com/uc?export=view&id=' + url;
  }
  return url;
}

/** Проверка товара перед записью в таблицу. Возвращает текст ошибки или null. */
function validate(item) {
  if (!item.name) return 'Не заполнено название товара.';
  if (item.name.length > 120) return 'Название длиннее 120 символов.';
  if (!item.game) return 'Не указана игра.';
  if (!item.description) return 'Не заполнено описание.';
  if (item.description.length > 2000) return 'Описание длиннее 2000 символов.';
  if (!(item.price > 0)) return 'Цена должна быть числом больше нуля.';
  if (item.image && !/^https?:\/\//i.test(item.image)) {
    return 'Изображение должно быть ссылкой http:// или https://.';
  }
  return null;
}

/** Разбор тела запроса, если оно пришло как JSON. */
function parseJsonBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

/** Текст ошибки для показа в JSON. */
function errorText(err) {
  return String(err && err.stack ? err.stack : err);
}

/** Формирует JSON-ответ для страницы каталога. */
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================================
 *  Служебные функции: запуск из редактора Apps Script
 * ========================================================================== */

/** Создаёт таблицу и лист с заголовками. Запуск один раз вручную. */
function setupCatalog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName(SHEET_NAME);
  if (existing && existing.getLastRow() > 1) {
    var answer = Browser.inputBox(
      'Лист «' + SHEET_NAME + '» уже содержит данные. Очистить его и создать заново?',
      'CosmoEmpire'
    );
    if (answer !== 'да') return;
  }
  setupSheet(ss.getSheetByName(SHEET_NAME));
  ss.toast('Таблица готова: ' + SHEET_NAME, 'CosmoEmpire', 5);
}

/** Проверка: показывает, сколько товаров видит каталог. */
function checkCatalog() {
  var count = readItems().length;
  Browser.msgBox(
    'CosmoEmpire',
    'Товаров в таблице: ' + count + '.\n\nURL таблицы:\n' +
    SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    Browser.Buttons.OK
  );
}

/** Меню «CosmoEmpire» в самой таблице. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CosmoEmpire')
    .addItem('Создать / настроить таблицу', 'setupCatalog')
    .addItem('Проверить количество товаров', 'checkCatalog')
    .addToUi();
}


  /* Защита от подмены номера строки в запросе */
  if (!rowNum || rowNum < 2 || rowNum > sheet.getLastRow()) return 0;

  var cell = sheet.getRange(rowNum, HEADERS.indexOf('Просмотры') + 1);
  var next = parseNumber(cell.getValue()) + 1;
  cell.setValue(next);
  return next;
}

    var error = validate(item);
    if (error) return json({ ok: false, error: error });

    var row = appendItem(item);
    return json({ ok: true, row: row, item: item });
  } catch (err) {
    return json({ ok: false, error: errorText(err) });
  }
}
