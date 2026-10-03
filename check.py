"""
CosmoEmpire — проверочный скрипт.
Запуск:  python check.py
Отчёт также пишется в check-report.txt в кодировке UTF-8.

Проверяет:
  1. Наличие всех обязательных файлов
  2. Валидность JSON
  3. Баланс скобок в JS / Apps Script (с учётом regex-литералов)
  4. Структуру HTML и локальные ссылки между страницами
  5. Что все CSS-классы из разметки описаны в styles.css
  6. Наличие фильтров, поиска и сортировки в каталоге
  7. Совпадение набора колонок во фронтенде и в Apps Script
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
errors = []
warnings = []
report = []


def log(line=""):
    report.append(line)


def check_json(rel):
    try:
        json.loads((ROOT / rel).read_text(encoding="utf-8"))
        log(f"  [OK] JSON валиден: {rel}")
    except Exception as exc:
        errors.append(f"JSON {rel}: {exc}")


# --------------------------------------------------------------------------
#  Разбор JavaScript: убираем комментарии, строки и регулярные выражения
# --------------------------------------------------------------------------

REGEX_KEYWORDS = {
    "return", "typeof", "case", "in", "of", "new", "delete", "void",
    "instanceof", "do", "else", "yield", "await", "throw"
}


def strip_js(text):
    """Возвращает текст без комментариев, строк и regex-литералов."""
    out = []
    i, n = 0, len(text)
    prev = ""          # последний значимый символ
    word = ""          # последний идентификатор

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if ch == "/" and nxt == "/":
            while i < n and text[i] != "\n":
                i += 1

        elif ch == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2

        elif ch == "/" and (prev == "" or prev in "(,=:[!&|?{};+-*%~^"
                            or word in REGEX_KEYWORDS):
            i += 1
            in_class = False
            while i < n:
                c = text[i]
                if c == "\\":
                    i += 2
                    continue
                if c == "[":
                    in_class = True
                elif c == "]":
                    in_class = False
                elif c == "/" and not in_class:
                    i += 1
                    break
                elif c == "\n":
                    break
                i += 1
            while i < n and text[i].isalpha():
                i += 1
            out.append(" RE ")
            prev, word = "E", ""

        elif ch in "\"'`":
            quote = ch
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                i += 1
            out.append('""')
            prev, word = '"', ""

        else:
            out.append(ch)
            if ch.isalnum() or ch in "_$":
                word += ch
            elif not ch.isspace():
                word = ""
            if not ch.isspace():
                prev = ch
            i += 1

    return "".join(out)


def check_braces(rel):
    src = strip_js((ROOT / rel).read_text(encoding="utf-8"))
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    line = 1
    for ch in src:
        if ch == "\n":
            line += 1
        elif ch in "([{":
            stack.append((ch, line))
        elif ch in ")]}":
            if not stack:
                errors.append(f"{rel}: лишняя '{ch}' в строке ~{line}")
                return
            open_ch, open_line = stack.pop()
            if open_ch != pairs[ch]:
                errors.append(f"{rel}: '{open_ch}' (стр. {open_line}) "
                              f"не совпадает с '{ch}' (стр. {line})")
                return
    if stack:
        open_ch, open_line = stack[-1]
        errors.append(f"{rel}: не закрыта '{open_ch}' со строки {open_line}")
    else:
        log(f"  [OK] Скобки сбалансированы: {rel}")


# --------------------------------------------------------------------------
#  Проверка HTML
# --------------------------------------------------------------------------

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"}

TAG_RE = re.compile(r"<(/?)([a-zA-Z][a-zA-Z0-9-]*)[^<>]*?>")


def context(html, pos, width=60):
    start = max(0, pos - width)
    return html[start:pos + width].replace("\n", " ")


def check_html(rel):
    html = (ROOT / rel).read_text(encoding="utf-8")
    opens = {}
    ok = True

    for m in TAG_RE.finditer(html):
        closing, tag = m.group(1), m.group(2).lower()
        raw = m.group(0)
        # одиночный тег: <br> или <img ... />
        self_close = raw.rstrip()[:-1].rstrip().endswith("/")
        if tag in VOID or self_close:
            continue
        if closing:
            if tag not in opens or not opens[tag]:
                errors.append(f"{rel}: </{tag}> без открывающего тега "
                              f"(«...{context(html, m.start())}...»)")
                ok = False
                return
            # закрываем самый внутренний открытый тег с таким именем
            opens[tag].pop()
            if not opens[tag]:
                del opens[tag]
        else:
            opens.setdefault(tag, []).append(m.start())

    if opens:
        for tag, positions in opens.items():
            for pos in positions:
                line_no = html.count("\n", 0, pos) + 1
                errors.append(f"{rel}: тег <{tag}> не закрыт (строка {line_no})")
        ok = False

    if ok:
        log(f"  [OK] Структура HTML: {rel}")

    for ref in re.findall(r'(?:href|src)="([^"]+)"', html):
        if ref.startswith(("http://", "https://", "mailto:", "data:", "#")):
            continue
        local = ref.split("?")[0].split("#")[0]
        if local and not (ROOT / local).exists():
            errors.append(f"{rel}: битая ссылка на {ref}")

    for needed in ("css/styles.css", "js/config.js", "js/ce-core.js"):
        if needed not in html:
            errors.append(f"{rel}: не подключён {needed}")


def main():
    log("=" * 64)
    log(" CosmoEmpire — проверка проекта")
    log("=" * 64)

    log("")
    log("[1] Обязательные файлы")
    for rel in ["index.html", "catalog.html", "about.html", "add-item.html",
                "css/styles.css", "js/config.js", "js/ce-core.js", "js/catalog.js",
                "js/add-item.js", "js/home.js", "js/faq.js",
                "data/demo-items.json", "apps-script/Code.gs",
                "apps-script/appsscript.json", "ИНСТРУКЦИЯ.md"]:
        if (ROOT / rel).exists():
            log(f"  [OK] {rel}")
        else:
            errors.append(f"Нет файла: {rel}")

    log("")
    log("[2] JSON")
    check_json("data/demo-items.json")
    check_json("apps-script/appsscript.json")

    log("")
    log("[3] Баланс скобок в JavaScript и Apps Script")
    for rel in ["js/config.js", "js/ce-core.js", "js/catalog.js",
                "js/add-item.js", "js/home.js", "js/faq.js", "apps-script/Code.gs"]:
        check_braces(rel)

    log("")
    log("[4] HTML и локальные ссылки")
    for rel in ["index.html", "catalog.html", "about.html", "add-item.html"]:
        check_html(rel)

    log("")
    log("[5] CSS-классы из разметки")
    css = (ROOT / "css/styles.css").read_text(encoding="utf-8")
    tokens = set()
    for rel in ["index.html", "catalog.html", "about.html", "add-item.html",
                "js/ce-core.js", "js/catalog.js", "js/add-item.js"]:
        for group in re.findall(r'class="([a-zA-Z0-9_\- ]+)"',
                                (ROOT / rel).read_text(encoding="utf-8")):
            tokens |= set(group.split())

    missing = [t for t in sorted(tokens) if f".{t}" not in css]
    for token in missing:
        warnings.append(f"Класс .{token} есть в разметке, но не найден в styles.css")
    if not missing:
        log(f"  [OK] Все {len(tokens)} используемых классов описаны в CSS")

    log("")
    log("[6] Фильтры, поиск и сортировка каталога")
    core_js = (ROOT / "js/ce-core.js").read_text(encoding="utf-8")
    catalog_js = (ROOT / "js/catalog.js").read_text(encoding="utf-8")
    catalog_html = (ROOT / "catalog.html").read_text(encoding="utf-8")

    requirements = {
        "поиск по названию": ('id="f-search"' in catalog_html and "search" in core_js),
        "фильтр по игре": ('id="f-game"' in catalog_html and "f.game" in core_js),
        "фильтр по типу": ('id="f-type"' in catalog_html and "f.type" in core_js),
        "фильтр по цене": ('id="f-price-min"' in catalog_html and "priceMin" in core_js),
        "сортировка: популярность": ('value="popular"' in catalog_html and '"popular"' in core_js),
        "сортировка: цена": ('value="price_asc"' in catalog_html and "price_asc" in core_js),
        "сортировка: новизна": ('value="new"' in catalog_html and '"new"' in core_js),
        "кнопка «Подробнее»": ("Подробнее" in core_js),
        "теги на карточке": ("card__tags" in core_js),
        "счётчик просмотров": ("bumpViews" in core_js),
    }
    for name, passed in requirements.items():
        if passed:
            log(f"  [OK] {name}")
        else:
            errors.append(f"Каталог: не реализовано «{name}»")

    log("")
    log("[7] Колонки таблицы в Apps Script")
    gs = (ROOT / "apps-script/Code.gs").read_text(encoding="utf-8")
    for column in ["Название", "Игра", "Описание", "Цена", "Теги",
                   "Изображение", "Дата добавления", "Тип", "Просмотры"]:
        if f"'{column}'" in gs:
            log(f"  [OK] Колонка «{column}»")
        else:
            errors.append(f"В Code.gs нет колонки «{column}»")

    demo = json.loads((ROOT / "data/demo-items.json").read_text(encoding="utf-8"))
    log(f"  [OK] Демо-карточек: {len(demo['items'])}")

    log("")
    log("[8] Демо-данные встроены в код (для работы через file://)")
    cfg_js = (ROOT / "js/config.js").read_text(encoding="utf-8")
    core_src = (ROOT / "js/ce-core.js").read_text(encoding="utf-8")
    demo_file = json.loads((ROOT / "data/demo-items.json").read_text(encoding="utf-8"))["items"]

    if "window.CE_DEMO = [" in cfg_js:
        embedded = cfg_js.split("window.CE_DEMO = [", 1)[1].split("];", 1)[0]
    else:
        embedded = ""

    names_file = [i["name"] for i in demo_file]
    names_embedded = re.findall(r'name:\s*"([^"]+)"', embedded)
    if names_file == names_embedded:
        log(f"  [OK] Демо-карточек в config.js: {len(names_embedded)} — совпадают с JSON")
    else:
        errors.append(f"Демо-данные расходятся: в JSON {names_file}, в config.js {names_embedded}")

    if "fetch(\"data/demo-items.json\")" not in core_src:
        log("  [OK] Каталог не зависит от fetch к локальному файлу")
    else:
        errors.append("ce-core.js всё ещё читает demo-items.json через fetch — "
                      "каталог не откроется по протоколу file://")

    log("")
    log("=" * 64)
    if warnings:
        log(f"Предупреждения ({len(warnings)}):")
        for w in warnings:
            log(f"  ! {w}")
    if errors:
        log(f"ОШИБКИ ({len(errors)}):")
        for e in errors:
            log(f"  x {e}")
        log("=" * 64)
        text = "\n".join(report)
        (ROOT / "check-report.txt").write_text(text, encoding="utf-8")
        print(text)
        sys.exit(1)

    log("Все проверки пройдены успешно.")
    log("=" * 64)
    text = "\n".join(report)
    (ROOT / "check-report.txt").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
