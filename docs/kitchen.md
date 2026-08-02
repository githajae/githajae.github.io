# Kitchen entry format

Kitchen is a chronological record of food made by Jaehyun Ha. It is separate from Places: Kitchen records making; Places records eating or visiting.

Create paired English and Korean pages and add both to their Kitchen index. Keep the photographs and date shared, while localizing every reader-facing sentence and alt description.

```yaml
---
layout: kitchen
title: "Dish — Jaehyun Ha"
heading: "Dish"
permalink: /kitchen/dish-slug/
lang: en
alternate_url: /ko/kitchen/dish-slug/
body_class: kitchen
date: 2021-07-24
display_date: "24 Jul 2021"
annotation_id: "kitchen-dish-slug-en"
annotation_revision: "2026-08-02"
description: "One plain sentence for search results."
image: "/assets/images/kitchen/dish-slug/lead.webp"
image_width: 1440
image_height: 1440
image_alt: "A literal description of the dish"
story:
  - image: "/assets/images/kitchen/dish-slug/process.webp"
    width: 1440
    height: 1440
    alt: "A literal description of the process photograph"
    text: "One restrained sentence."
---

One short paragraph: why it was made, what worked, and what did not.
```

If the exact date is unknown, use the known year as `display_date` and do not invent a month or day. Remove social-media title cards and preserve only the food photograph. Export images as WebP without EXIF metadata.

Keep each entry photograph-first. Use one short paragraph and no section headings. When the exact source video is known, link its natural title or creator in the opening sentence; do not add a player, badge, or separate video row. Repeated attempts at the same dish belong in one entry under `story`, not in separate posts. The Kitchen indexes are generated automatically from pages using the `kitchen` layout.
