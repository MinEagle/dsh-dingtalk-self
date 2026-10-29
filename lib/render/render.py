#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把结构化数据渲染成一张适合在钉钉里看的 PNG。

由插件的主进程调用（宿主进程不受沙箱限制，所以能起 Python），
读 stdin 的 JSON spec，把图片写到 spec["out"]。

spec:
  {"type": "table", "title": "...", "columns": ["a","b"], "rows": [["x","y"]], "width": 960, "out": "/path.png"}
  {"type": "steps", "title": "...", "steps": [{"title": "...", "desc": "..."}], "width": 960, "out": "/path.png"}
  {"type": "flow", "title": "...", "nodes": [{"text": "...", "note": "..."}], "width": 960, "out": "/path.png"}
  {"type": "bar", "title": "...", "items": [{"label": "...", "value": 1399}], "width": 960, "out": "/path.png"}

只用标准库 + Pillow；字体用 macOS 自带中文无衬线体。任何失败都写到 stderr 并非零退出。
"""

import json
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception as exc:  # pragma: no cover - 环境问题
    sys.stderr.write("Pillow 不可用：%s\n" % exc)
    sys.exit(2)

FONT_CANDIDATES = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
    ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
    ("/System/Library/Fonts/PingFang.ttc", 0),
    ("/Library/Fonts/Arial Unicode.ttf", 0),
]

PAD = 36
BG = (255, 255, 255)
BORDER = (226, 232, 240)
TITLE = (17, 24, 39)
HEAD_BG = (238, 244, 255)
HEAD_TEXT = (30, 58, 138)
CELL_TEXT = (55, 65, 81)
ZEBRA = (249, 250, 251)
ACCENT = (37, 99, 235)
MUTED = (148, 163, 184)
FOOTER = "由 DSH 钉钉代答生成"


def load_font(size):
    for path, index in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=index)
            except Exception:
                continue
    return ImageFont.load_default()


def text_width(draw, text, font):
    return draw.textlength(text, font=font)


def wrap_text(draw, text, font, max_width):
    """按字符折行（中英文混排都适用），返回行列表。"""
    text = str(text if text is not None else "")
    if text == "":
        return [""]
    lines = []
    current = ""
    for ch in text:
        if ch == "\n":
            lines.append(current)
            current = ""
            continue
        candidate = current + ch
        if text_width(draw, candidate, font) <= max_width or current == "":
            current = candidate
        else:
            lines.append(current)
            current = ch
    if current != "":
        lines.append(current)
    return lines


def rounded_card(draw, box, radius=16):
    draw.rounded_rectangle(box, radius=radius, fill=BG, outline=BORDER, width=1)


def measure_table(draw, spec, font, header_font, width):
    columns = [str(c) for c in spec.get("columns", [])]
    rows = spec.get("rows", []) or []
    if not columns:
        raise ValueError("table 需要 columns")
    inner = width - PAD * 2 - 24
    # 先测量每列最长内容（含表头），再按比例分配可用宽度
    weights = []
    for idx, col in enumerate(columns):
        longest = text_width(draw, col, header_font)
        for row in rows:
            cell = str(row[idx]) if idx < len(row) else ""
            longest = max(longest, text_width(draw, cell, font))
        weights.append(max(longest, 40))
    total = sum(weights)
    widths = [max(70, int(inner * w / total)) for w in weights]
    # 超出时压掉最宽列
    overflow = sum(widths) - inner
    while overflow > 0 and widths:
        i = widths.index(max(widths))
        if widths[i] <= 80:
            break
        widths[i] -= 10
        overflow -= 10
    return columns, rows, widths


def render_table(draw, spec, width, font, header_font, title_font):
    columns, rows, widths = measure_table(draw, spec, font, header_font, width)
    line_h = int(font.size * 1.55)
    x0 = PAD
    y = PAD
    title = str(spec.get("title") or "").strip()
    if title:
        for line in wrap_text(draw, title, title_font, width - PAD * 2):
            draw.text((x0, y), line, font=title_font, fill=TITLE)
            y += int(title_font.size * 1.6)
        y += 6

    # 表头
    header_cells = []
    head_h = int(header_font.size * 1.9) + 16
    for idx, col in enumerate(columns):
        lines = wrap_text(draw, col, header_font, widths[idx] - 20)
        header_cells.append(lines)
        head_h = max(head_h, len(lines) * line_h + 16)
    total_w = sum(widths)
    draw.rounded_rectangle((x0, y, x0 + total_w, y + head_h), radius=10, fill=HEAD_BG)
    cx = x0
    for idx, lines in enumerate(header_cells):
        ly = y + 10
        for line in lines:
            draw.text((cx + 10, ly), line, font=header_font, fill=HEAD_TEXT)
            ly += line_h
        cx += widths[idx]
    y += head_h

    # 数据行
    for r_index, row in enumerate(rows):
        cells = []
        row_h = int(font.size * 1.55) + 16
        for idx in range(len(columns)):
            cell = str(row[idx]) if idx < len(row) else ""
            lines = wrap_text(draw, cell, font, widths[idx] - 20)
            cells.append(lines)
            row_h = max(row_h, len(lines) * line_h + 16)
        if r_index % 2 == 1:
            draw.rectangle((x0, y, x0 + total_w, y + row_h), fill=ZEBRA)
        cx = x0
        for idx, lines in enumerate(cells):
            ly = y + 8
            for line in lines:
                draw.text((cx + 10, ly), line, font=font, fill=CELL_TEXT)
                ly += line_h
            cx += widths[idx]
        y += row_h
        draw.line((x0, y, x0 + total_w, y), fill=BORDER, width=1)
    return y


def render_steps(draw, spec, width, font, step_title_font, title_font):
    steps = spec.get("steps", []) or []
    if not steps:
        raise ValueError("steps 需要 steps")
    line_h = int(font.size * 1.6)
    x0 = PAD
    y = PAD
    title = str(spec.get("title") or "").strip()
    if title:
        for line in wrap_text(draw, title, title_font, width - PAD * 2):
            draw.text((x0, y), line, font=title_font, fill=TITLE)
            y += int(title_font.size * 1.6)
        y += 8

    inner = width - PAD * 2
    radius = 18
    for index, step in enumerate(steps, start=1):
        step_title = str(step.get("title") or "").strip()
        desc = str(step.get("desc") or "").strip()
        text_x = x0 + radius * 2 + 16
        title_lines = wrap_text(draw, step_title, step_title_font, inner - (radius * 2 + 16)) if step_title else []
        desc_lines = wrap_text(draw, desc, font, inner - (radius * 2 + 16)) if desc else []
        block_h = len(title_lines) * int(step_title_font.size * 1.5) + len(desc_lines) * line_h
        block_h = max(block_h, radius * 2)

        draw.ellipse(
            (x0, y + 2, x0 + radius * 2, y + 2 + radius * 2),
            fill=ACCENT if index == 1 else (219, 234, 254),
        )
        num_font = load_font(int(radius * 1.15))
        num = str(index)
        nw = text_width(draw, num, num_font)
        draw.text(
            (x0 + radius - nw / 2, y + 2 + radius - num_font.size * 0.62),
            num,
            font=num_font,
            fill=(255, 255, 255) if index == 1 else ACCENT,
        )

        ty = y
        for line in title_lines:
            draw.text((text_x, ty), line, font=step_title_font, fill=TITLE)
            ty += int(step_title_font.size * 1.5)
        for line in desc_lines:
            draw.text((text_x, ty), line, font=font, fill=CELL_TEXT)
            ty += line_h
        y += block_h + 22
    return y


def render_flow(draw, spec, width, font, node_font, title_font):
    """纵向流程图：节点框 + 箭头，适合讲「先…再…然后…」的状态流转。"""
    nodes = spec.get("nodes", []) or []
    if not nodes:
        raise ValueError("flow 需要 nodes")
    x0 = PAD
    y = PAD
    title = str(spec.get("title") or "").strip()
    if title:
        for line in wrap_text(draw, title, title_font, width - PAD * 2):
            draw.text((x0, y), line, font=title_font, fill=TITLE)
            y += int(title_font.size * 1.6)
        y += 14

    inner = width - PAD * 2
    box_w = int(inner * 0.74)
    box_x = x0 + (inner - box_w) // 2
    pad_y = 14
    line_h = int(node_font.size * 1.5)

    for index, node in enumerate(nodes):
        text = str(node.get("text") or "").strip()
        note = str(node.get("note") or "").strip()
        text_lines = wrap_text(draw, text, node_font, box_w - 32)
        note_lines = wrap_text(draw, note, font, box_w - 32) if note else []
        box_h = pad_y * 2 + len(text_lines) * line_h + len(note_lines) * line_h

        is_first = index == 0
        draw.rounded_rectangle(
            (box_x, y, box_x + box_w, y + box_h),
            radius=12,
            fill=(239, 246, 255) if is_first else BG,
            outline=ACCENT if is_first else BORDER,
            width=2 if is_first else 1,
        )
        ty = y + pad_y
        for line in text_lines:
            tw = text_width(draw, line, node_font)
            draw.text((box_x + (box_w - tw) / 2, ty), line, font=node_font, fill=TITLE if is_first else CELL_TEXT)
            ty += line_h
        for line in note_lines:
            tw = text_width(draw, line, font)
            draw.text((box_x + (box_w - tw) / 2, ty), line, font=font, fill=MUTED)
            ty += line_h
        y += box_h

        if index < len(nodes) - 1:
            cx = box_x + box_w // 2
            draw.line((cx, y + 6, cx, y + 26), fill=ACCENT, width=2)
            draw.polygon([(cx - 6, y + 24), (cx + 6, y + 24), (cx, y + 34)], fill=ACCENT)
            y += 40
    return y


def render_bar(draw, spec, width, font, label_font, title_font):
    """横向柱状图：适合对比多个数值（合同数、金额、耗时）。"""
    items = spec.get("items", []) or []
    if not items:
        raise ValueError("bar 需要 items")

    x0 = PAD
    y = PAD
    title = str(spec.get("title") or "").strip()
    if title:
        for line in wrap_text(draw, title, title_font, width - PAD * 2):
            draw.text((x0, y), line, font=title_font, fill=TITLE)
            y += int(title_font.size * 1.6)
        y += 14

    inner = width - PAD * 2
    # 标签列宽按最长标签，最多占 42%
    label_w = 0
    for item in items:
        label_w = max(label_w, text_width(draw, str(item.get("label") or ""), label_font))
    label_w = min(max(int(label_w) + 16, 80), int(inner * 0.42))
    value_w = int(inner * 0.14)
    bar_area = inner - label_w - value_w - 24

    max_value = 0.0
    for item in items:
        try:
            max_value = max(max_value, float(item.get("value") or 0))
        except (TypeError, ValueError):
            pass
    if max_value <= 0:
        max_value = 1.0

    bar_h = 30
    gap = 16
    for index, item in enumerate(items):
        label = str(item.get("label") or "")
        raw_value = item.get("value")
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            value = 0.0
        ratio = max(0.0, min(1.0, value / max_value))
        bar_w = max(6, int(bar_area * ratio))

        # 标签（过长截断加省略号）
        lines = wrap_text(draw, label, label_font, label_w - 8)
        if len(lines) > 1:
            lines = [lines[0]]
        ly = y + (bar_h - int(label_font.size * 1.2)) // 2
        draw.text((x0, ly), lines[0], font=label_font, fill=CELL_TEXT)

        bar_x = x0 + label_w
        draw.rounded_rectangle(
            (bar_x, y, bar_x + bar_area, y + bar_h),
            radius=6,
            fill=(243, 244, 246),
        )
        draw.rounded_rectangle(
            (bar_x, y, bar_x + bar_w, y + bar_h),
            radius=6,
            fill=ACCENT if index == 0 else (96, 165, 250),
        )
        # 数值：短横条放右边，长横条放条内右侧
        text = str(raw_value)
        tw = text_width(draw, text, font)
        tx = bar_x + bar_area + 12
        ty = y + (bar_h - int(font.size * 1.2)) // 2
        draw.text((min(tx, x0 + inner - tw), ty), text, font=font, fill=TITLE)
        y += bar_h + gap
    return y - gap


def main():
    raw = sys.stdin.read()
    try:
        spec = json.loads(raw)
    except Exception as exc:
        sys.stderr.write("spec 不是合法 JSON：%s\n" % exc)
        return 2

    kind = str(spec.get("type") or "")
    width = int(spec.get("width") or 960)
    if width < 480 or width > 2000:
        width = 960
    out = spec.get("out")
    if not out:
        sys.stderr.write("缺少 out 路径\n")
        return 2

    font = load_font(26)
    header_font = load_font(26)
    title_font = load_font(34)
    step_title_font = load_font(28)

    probe = Image.new("RGB", (width, 10), BG)
    draw = ImageDraw.Draw(probe)

    if kind == "table":
        body_bottom = render_table(draw, spec, width, font, header_font, title_font)
    elif kind == "steps":
        body_bottom = render_steps(draw, spec, width, font, step_title_font, title_font)
    elif kind == "flow":
        body_bottom = render_flow(draw, spec, width, font, font, title_font)
    elif kind == "bar":
        body_bottom = render_bar(draw, spec, width, font, font, title_font)
    else:
        sys.stderr.write("未知类型：%s\n" % kind)
        return 2

    height = int(body_bottom + PAD + 34)
    image = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(image)
    rounded_card(draw, (1, 1, width - 2, height - 2))
    if kind == "table":
        render_table(draw, spec, width, font, header_font, title_font)
    elif kind == "flow":
        render_flow(draw, spec, width, font, font, title_font)
    elif kind == "bar":
        render_bar(draw, spec, width, font, font, title_font)
    else:
        render_steps(draw, spec, width, font, step_title_font, title_font)

    footer_font = load_font(18)
    draw.text((PAD, height - PAD + 4), FOOTER, font=footer_font, fill=MUTED)

    out_dir = os.path.dirname(os.path.abspath(out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    image.save(out, "PNG", optimize=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
