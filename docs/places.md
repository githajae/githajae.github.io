# Places entry format

Places is a chronological, image-led record. Each page keeps the title, location, date or duration, map action, story blocks, and discussion in the same order.

Create both English and Korean files. Use the same image sequence and `map_query`, but keep language-specific `annotation_id` values.

For every entry, localize all reader-facing fields rather than copying one language into the other:

- `heading`, `location`, `display_date`, `description`, the introduction, every `alt`, and every `text` must read naturally in that page's language.
- Proper nouns such as UIUC may remain unchanged. Translate place names when a familiar Korean form exists.
- Keep `permalink`, `alternate_url`, and `annotation_id` paired so the language switch never leaves the current entry.
- Reuse photographs and `map_query`; they are not language-specific.

```yaml
---
layout: place
title: "Place name — Jaehyun Ha"
heading: "Place name"
permalink: /places/place-slug/
lang: en
alternate_url: /ko/places/place-slug/
body_class: place
location: "Country, City or State"
map_query: "Exact place name, city, country"
date: 2026-08-01
# Optional. When present, display_date is rendered as a duration.
end_date: 2026-09-01
display_date: "Aug – Sep 2026"
annotation_id: "place-place-slug-en"
annotation_revision: "2026-08-01"
description: "One plain sentence for search results."
# Optional lead photograph. Portrait images are centered at a restrained width.
image: "/assets/images/places/place-slug/lead.webp"
image_width: 1200
image_height: 1800
image_alt: "A literal description of the lead photograph"
story:
  - image: "/assets/images/places/place-slug/01.webp"
    alt: "A literal description of the photograph"
    text: "One or two restrained sentences."
  - image: "/assets/images/places/place-slug/02.webp"
    # Add the actual dimensions when the image is not the default 1800 × 1350.
    width: 1800
    height: 2400
    alt: "A literal description of the second photograph"
    text: "The next part of the record."
---

An optional one- or two-sentence introduction.
```

Image rules:

- Preserve the original aspect ratio; do not crop merely to make a uniform grid.
- Export photographs as WebP, 1,800 px on the long edge, without EXIF metadata.
- Set `width` and `height` to the exported dimensions when an image is not 1,800 × 1,350.
- Use chronological or experiential order. Do not use a carousel or thumbnail grid.
- Write literal alt text. Keep the visible text shorter and more personal.
- Omit `end_date` for a single day. For a duration, make `display_date` concise, such as `Jun – Sep 2025`.

Add the entry to both Places index pages after creating the detail pages.
