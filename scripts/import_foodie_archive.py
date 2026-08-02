#!/usr/bin/env python3
"""Import the curated Foodie archive into the bilingual Kitchen section.

Usage:
  python3 scripts/import_foodie_archive.py /path/to/Foodie.zip

Requires Pillow. The source archive is never modified. Images are EXIF-rotated,
resized to 1600 px, stripped of metadata, and exported as WebP.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]

VIDEOS = {
    "mongolian": ("https://www.youtube.com/watch?v=c5it8ttzJuY", "육식맨의 몽골리안 비프", "YOOXICMAN's Mongolian beef"),
    "meatballs": ("https://www.youtube.com/watch?v=PUC_XDeYBAg", "육식맨의 스웨디시 미트볼", "YOOXICMAN's Swedish meatballs"),
    "steak_sandwich": ("https://www.youtube.com/watch?v=eVcGsGN_TSM", "육식맨의 궁극의 스테이크 샌드위치", "YOOXICMAN's ultimate steak sandwich"),
    "potato_nest": ("https://www.youtube.com/watch?v=4WEhZLQ37Fk", "백종원의 새둥지전", "Paik Jong-won's potato nest pancake"),
    "gochujang_wings": ("https://www.youtube.com/watch?v=aQagIVbwsjI", "육식맨의 고추장 닭날개 조림", "YOOXICMAN's gochujang chicken wings"),
    "egg_curry": ("https://www.youtube.com/watch?v=NNZ5jI_RQjI", "백종원의 구운계란 카레", "Paik Jong-won's baked egg curry"),
    "roast_chicken": ("https://www.youtube.com/watch?v=qI378pux-Vs", "육식맨의 초리조 로스트 치킨", "YOOXICMAN's chorizo roast chicken"),
    "baked_chicken": ("https://www.youtube.com/watch?v=4aqxZwfgbrM", "뚝딱이형의 굽네치킨 재현", "Ddukddak's Goobne-style chicken"),
    "onion_soup": ("https://www.youtube.com/watch?v=OKQ2_SPs6i8", "공격수셰프의 어니언 수프", "Striker Chef's French onion soup"),
    "scallion_wings": ("https://www.youtube.com/watch?v=6eKBqGZLE20", "공격수셰프의 닭날개 간장조림", "Striker Chef's soy-braised chicken wings"),
}


ENTRIES = [
    {
        "slug": "first-steak", "date": "2020-01-12",
        "ko": ("첫 스테이크", "RC 기숙사에서 만든 첫 요리. 스테이크를 두 번 구웠고, 두 번째가 조금 나았다."),
        "en": ("First Steak", "My first dish, cooked in the RC dormitory. I tried steak twice; the second attempt was a little better."),
        "images": [
            ("20200112_145351.jpg", "처음 구운 스테이크", "The first steak I cooked", "첫 시도.", "First attempt."),
            ("1579418925763.jpg", "두 번째로 구운 스테이크", "A second attempt at steak", "일주일 뒤의 두 번째 시도.", "A second attempt one week later."),
        ],
    },
    {
        "slug": "failed-donburi", "date": "2020-01-19",
        "ko": ("실패한 덮밥", "닭가슴살 소시지와 계란, 양파로 일본식 덮밥을 만들어보려 했다. 맛이 없었다."),
        "en": ("Failed Donburi", "I tried to make a Japanese-style rice bowl with chicken-breast sausage, eggs, and onion. It was bad."),
        "images": [
            ("20200119_105802.jpg", "소시지와 계란을 올린 덮밥", "A rice bowl topped with sausage and eggs", "", ""),
            ("20200119_105207.jpg", "팬에서 익히는 소시지와 계란", "Sausage and eggs cooking in a pan", "", ""),
        ],
    },
    {
        "slug": "pancakes", "date": "2020-01-19",
        "ko": ("팬케이크", "심심해서 팬케이크를 구웠다. 여러 장을 굽고 크림까지 올렸다."),
        "en": ("Pancakes", "I made pancakes out of boredom, cooked a full stack, and finished it with cream."),
        "images": [
            ("1579418947420.jpg", "크림을 올린 팬케이크 더미", "A stack of pancakes topped with cream", "", ""),
            ("1579412064125.jpg", "팬에서 굽고 있는 팬케이크", "A pancake cooking in a pan", "", ""),
            ("20200119_144152.jpg", "처음 뒤집다가 찢어진 팬케이크", "A pancake torn during an early flip", "처음에는 뒤집는 것부터 어려웠다.", "At first, even flipping one was difficult."),
            ("20200119_145421.jpg", "접시에 쌓은 팬케이크", "Pancakes stacked on a plate", "", ""),
        ],
    },
    {
        "slug": "rolled-omelet", "date": "2020-01-19",
        "ko": ("계란말이", "계란말이 모양을 잡는 연습. 반듯하게 마는 일이 생각보다 어려웠다."),
        "en": ("Rolled Omelet", "A practice run at shaping a rolled omelet. Keeping it straight was harder than expected."),
        "images": [
            ("20200119_183913.jpg", "잘라 놓은 계란말이", "A sliced rolled omelet", "", ""),
            ("20200119_182545.jpg", "팬에서 말기 시작한 계란", "Eggs being rolled in a pan", "", ""),
            ("20200119_183601.jpg", "도마 위의 계란말이", "A rolled omelet on a cutting board", "", ""),
        ],
    },
    {
        "slug": "sausage-vegetable-stir-fry", "date": "2020-01-20",
        "ko": ("소시지 야채볶음", "다이어트용 닭가슴살 소시지를 맛있게 먹어보겠다고 케첩에 볶았다."),
        "en": ("Sausage and Vegetable Stir-fry", "I stir-fried chicken-breast sausages in ketchup, trying to make diet food more enjoyable."),
        "images": [
            ("20200122_183726.jpg", "케첩에 볶은 소시지와 야채", "Sausage and vegetables stir-fried in ketchup", "", ""),
            ("20200120_174616.jpg", "팬에서 볶고 있는 소시지와 야채", "Sausage and vegetables cooking in a pan", "", ""),
        ],
    },
    {
        "slug": "aglio-e-olio", "date": "2020-01-22",
        "ko": ("알리오 올리오", "마늘과 면으로 처음 만들어본 알리오 올리오."),
        "en": ("Aglio e Olio", "An early attempt at aglio e olio with garlic and pasta."),
        "images": [("20200122_193519.jpg", "팬에 담긴 알리오 올리오", "Aglio e olio in a pan", "", "")],
    },
    {
        "slug": "sweet-potato-chicken-stew", "date": "2020-02-09",
        "ko": ("고구마 닭가슴살 조림", "고구마와 닭가슴살로 닭도리탕 비슷한 것을 만들려 했다. 다이어트 요리를 맛있게 먹겠다고 애쓰던 시절."),
        "en": ("Sweet Potato Chicken Stew", "I tried to make something like dakdoritang with sweet potato and chicken breast—an attempt to make diet food enjoyable."),
        "images": [
            ("20200209_150324.jpg", "고구마와 닭가슴살 조림", "Sweet potato and chicken breast stew", "", ""),
            ("20200209_145949.jpg", "팬에서 익히는 고구마와 닭가슴살", "Sweet potato and chicken breast cooking in a pan", "", ""),
        ],
    },
    {
        "slug": "mongolian-beef", "date": "2021-02-28", "video": "mongolian",
        "ko": ("몽골리안 비프", "{video}를 보고 따라 만들었다. 잠시 자취를 시작하고 스텐 팬으로 처음 시도한 요리였고, 실패했다."),
        "en": ("Mongolian Beef", "I followed {video}. It was my first dish after briefly moving out on my own and cooking with a stainless-steel pan, and it failed."),
        "images": [
            ("20210228_093952.jpg", "완성한 몽골리안 비프", "Finished Mongolian beef", "", ""),
            ("20210228_091446.jpg", "스텐 팬에서 튀기듯 굽는 소고기", "Beef frying in a stainless-steel pan", "", ""),
            ("20210228_092317.jpg", "팬에서 볶는 마늘", "Garlic cooking in the pan", "", ""),
            ("20210228_093534.jpg", "소스와 파를 넣어 볶는 소고기", "Beef tossed with sauce and scallions", "", ""),
        ],
    },
    {
        "slug": "swedish-meatballs", "date": "2021-03-07", "video": "meatballs",
        "ko": ("스웨디시 미트볼", "{video}을 보고 따라 만들었다. 맛은 꽤 심심했다."),
        "en": ("Swedish Meatballs", "I followed {video}. The flavor was rather plain."),
        "images": [("20210307_200030.jpg", "크림소스를 곁들인 스웨디시 미트볼", "Swedish meatballs with cream sauce", "", "")],
    },
    {
        "slug": "bacon-pasta", "date": "2021-03-12",
        "ko": ("베이컨 파스타", "자취하면서 간단히 만든 베이컨 파스타."),
        "en": ("Bacon Pasta", "A simple bacon pasta made while living on my own."),
        "images": [("20210312_152119.jpg", "베이컨을 넣은 파스타", "Pasta with bacon", "", "")],
    },
    {
        "slug": "butadon", "date": "2021-03-16",
        "ko": ("부타동", "간장 양념에 졸인 돼지고기와 계란을 올린 부타동."),
        "en": ("Butadon", "A rice bowl topped with soy-braised pork and an egg."),
        "images": [("20210316_150316.jpg", "돼지고기와 계란을 올린 부타동", "Butadon topped with pork and an egg", "", "")],
    },
    {
        "slug": "gochujang-chicken-breast", "date": "2021-07-11", "video": "gochujang_wings",
        "ko": ("고추장 닭가슴살", "{video} 양념을 닭가슴살에 써봤다."),
        "en": ("Gochujang Chicken Breast", "I adapted the sauce from {video} for chicken breast."),
        "images": [("20210711_190949.jpg", "고추장 양념에 조린 닭가슴살", "Chicken breast braised in gochujang sauce", "", "")],
    },
    {
        "slug": "soy-eggs-and-tofu", "date": "2021-07-13",
        "ko": ("마약계란장과 두부조림", "마약계란장을 만들고 다음 날 두부조림과 함께 먹었다."),
        "en": ("Soy Eggs and Braised Tofu", "I made soy-marinated eggs, then ate them with braised tofu the following day."),
        "images": [
            ("20210714_075824.jpg", "두부조림과 마약계란장", "Braised tofu with soy-marinated eggs", "", ""),
            ("20210713_202547.jpg", "간장 양념에 담근 계란", "Eggs marinating in soy sauce", "", ""),
            ("20210807_075850.jpg", "다시 만든 두부조림", "A later attempt at braised tofu", "다시 만든 두부조림.", "Braised tofu, tried again."),
        ],
    },
    {
        "slug": "potato-nest-pancake", "date": "2021-07-19", "video": "potato_nest",
        "ko": ("새둥지전", "{video}을 보고 따라 만들었다. 이후 두 번 더 만들며 조금씩 바꿨다."),
        "en": ("Potato Nest Pancake", "I followed {video}, then made it twice more with small variations."),
        "images": [
            ("20210719_191602.jpg", "계란과 베이컨을 올린 새둥지전", "A potato nest pancake topped with egg and bacon", "", ""),
            ("20210803_064230.jpg", "계란을 올려 다시 만든 새둥지전", "A second potato nest pancake topped with egg", "두 번째 시도.", "Second attempt."),
            ("2021-10-23-09-13-48-998.jpg", "베이컨과 계란을 더한 새둥지전 변형", "A potato nest variation with bacon and eggs", "베이컨을 더한 변형.", "A variation with more bacon."),
        ],
    },
    {
        "slug": "frittata", "date": "2021-07-23",
        "ko": ("프리타타", "오븐에 넣어 프리타타를 두 번 만들었다. 두 번 모두 실패했다."),
        "en": ("Frittata", "I baked a frittata twice. Both attempts failed."),
        "images": [
            ("20210723_205317.jpg", "오븐에서 구운 첫 프리타타", "The first baked frittata", "첫 시도.", "First attempt."),
            ("20210827_181526.jpg", "다시 구운 프리타타", "A second baked frittata", "두 번째 시도도 실패.", "The second attempt also failed."),
        ],
    },
    {
        "slug": "steak-sandwich", "date": "2021-07-24", "display_date": "2021. 7. 24.", "video": "steak_sandwich",
        "ko": ("스테이크 샌드위치", "{video}를 보고 따라 만들었다. 보기보다 어려웠지만 고기와 렐리시는 좋았다. 레시피를 조금 다듬으면 다시 만들 만하다."),
        "en": ("Steak Sandwich", "I followed {video}. It was harder than it looked, but the steak and relish were good."),
        "images": [
            ("20210724_134720.jpg", "스테이크와 토마토 렐리시를 넣은 샌드위치", "A steak sandwich with tomato relish", "", ""),
            ("20210724_134157.jpg", "접시에 담은 스테이크 샌드위치", "A plated steak sandwich", "", ""),
            ("20210724_135136.jpg", "속을 펼쳐 보인 스테이크 샌드위치", "An open view of the steak sandwich", "", ""),
        ],
    },
    {
        "slug": "gochujang-chicken-wings", "date": "2021-08-14", "video": "gochujang_wings",
        "ko": ("고추장 닭날개 조림", "{video}을 보고 따라 만들었다."),
        "en": ("Gochujang Chicken Wings", "I followed {video}."),
        "images": [("20210814_201618.jpg", "고추장 양념에 조린 닭날개", "Chicken wings braised in gochujang sauce", "", "")],
    },
    {
        "slug": "baked-egg-curry", "date": "2021-08-15", "video": "egg_curry",
        "ko": ("구운계란 카레", "{video}를 보고 따라 만들었다. 계란을 먼저 구워 카레에 넣는 방식이다."),
        "en": ("Baked Egg Curry", "I followed {video}, browning the eggs before adding them to the curry."),
        "images": [
            ("20210815_103248.jpg", "구운 계란을 넣은 카레", "Curry with browned eggs", "", ""),
            ("2021-11-06-13-58-24-595.jpg", "다시 만든 구운계란 카레", "Another baked egg curry", "다시 만든 구운계란 카레.", "Baked egg curry, made again."),
        ],
    },
    {
        "slug": "miso-pork-jowl", "date": "2021-08-16",
        "ko": ("미소 항정살 조림", "최강록의 미소 양념을 활용해 항정살을 조렸다."),
        "en": ("Miso-braised Pork Jowl", "I braised pork jowl using a miso-based recipe by Choi Kang-rok."),
        "images": [("20210816_202610.jpg", "미소 양념에 조린 항정살", "Pork jowl braised in miso sauce", "", "")],
    },
    {
        "slug": "failed-gochujang-stew", "date": "2021-08-17",
        "ko": ("실패한 고추장찌개", "고추장찌개를 만들었고 크게 실패했다."),
        "en": ("Failed Gochujang Stew", "I made a gochujang stew. It failed badly."),
        "images": [
            ("20210817_081019.jpg", "두부를 넣은 고추장찌개", "Gochujang stew with tofu", "", ""),
            ("20210819_074156.jpg", "다시 끓인 고추장찌개", "Another pot of gochujang stew", "", ""),
            ("20210819_074215.jpg", "고추장찌개와 반찬을 차린 식탁", "A table set with gochujang stew and side dishes", "", ""),
        ],
    },
    {
        "slug": "chorizo-roast-chicken", "date": "2021-08-22", "video": "roast_chicken",
        "ko": ("초리조 로스트 치킨", "{video}을 보고 따라 만들었다. 닭 안에 초리조와 콩을 채워 통째로 구웠다."),
        "en": ("Chorizo Roast Chicken", "I followed {video}, stuffing the chicken with chorizo and beans before roasting it whole."),
        "images": [
            ("20210822_160247.jpg", "초리조를 채워 구운 통닭", "A whole roast chicken stuffed with chorizo", "", ""),
            ("20210822_141731.jpg", "닭에 넣을 초리조와 콩 소", "Chorizo and bean stuffing for the chicken", "", ""),
            ("20210822_155514.jpg", "오븐에서 막 꺼낸 로스트 치킨", "Roast chicken just out of the oven", "", ""),
            ("20210822_160818.jpg", "자른 로스트 치킨과 초리조 소", "Carved roast chicken with chorizo stuffing", "", ""),
        ],
    },
    {
        "slug": "dakdoritang", "date": "2021-08-28",
        "ko": ("닭도리탕", "닭도리탕은 이후에도 여러 번 만들었다."),
        "en": ("Dakdoritang", "I returned to dakdoritang several times afterward."),
        "images": [
            ("20210828_085053.jpg", "매콤하게 조린 닭도리탕", "Spicy braised chicken dakdoritang", "첫 시도.", "First attempt."),
            ("20211016203314520.jpg", "국물이 많은 닭도리탕", "A later, soupier dakdoritang", "다시 만든 닭도리탕.", "A later attempt."),
            ("2021-11-17-18-18-42-063.jpg", "냄비에 담긴 닭도리탕", "Dakdoritang in a pot", "한 번 더.", "One more time."),
        ],
    },
    {
        "slug": "eggs-benedict", "date": "2021-05-15", "display_date": "2021. 5. 15.",
        "ko": ("에그 베네딕트", "브런치 식당에서 처음 먹어본 뒤 레시피를 공부해 집에서 만들었다. 결과는 실패에 가까웠지만, 연습하면 될 것 같았다."),
        "en": ("Eggs Benedict", "After first trying Eggs Benedict at a brunch restaurant, I studied the recipe and made it at home. It was close to a failure, but seemed learnable."),
        "images": [
            ("20211018140452457.jpg", "직접 만든 에그 베네딕트 두 개", "Two homemade Eggs Benedict", "", ""),
            ("20211017134611007.jpg", "처음 완성한 에그 베네딕트", "The first completed Eggs Benedict", "첫 시도.", "First attempt."),
            ("20211018140241716.jpg", "빵과 베이컨, 토마토, 수란을 조립하는 과정", "English muffins, bacon, tomato, and poached eggs being assembled", "수란과 홀랜다이즈 모두 생각보다 어려웠다.", "Both the poached eggs and hollandaise were harder than expected."),
        ],
    },
    {
        "slug": "caprese", "date": "2021-10-20",
        "ko": ("카프레제", "토마토와 모차렐라, 바질을 썰어 나란히 놓았다."),
        "en": ("Caprese", "Tomato, mozzarella, and basil, sliced and arranged in a row."),
        "images": [("2021-10-20-20-56-46-714.jpg", "토마토와 모차렐라를 번갈아 놓은 카프레제", "Caprese with alternating slices of tomato and mozzarella", "", "")],
    },
    {
        "slug": "eggplant-bake", "date": "2021-10-21",
        "ko": ("가지 오븐구이", "가지가 싸서 토마토소스와 치즈를 올려 오븐에 구워봤다."),
        "en": ("Baked Eggplant", "Eggplant was cheap, so I baked it with tomato sauce and cheese."),
        "images": [("2021-10-21-10-11-11-664.jpg", "토마토소스와 치즈를 올려 구운 가지", "Eggplant baked with tomato sauce and cheese", "", "")],
    },
    {
        "slug": "gambas-al-ajillo", "date": "2021-10-22",
        "ko": ("감바스", "만들기 간단해서 여러 번 해 먹었다."),
        "en": ("Gambas al Ajillo", "Simple enough to make that I returned to it several times."),
        "images": [
            ("2021-10-22-19-33-41-157.jpg", "새우와 마늘을 넣은 감바스", "Gambas al ajillo with shrimp and garlic", "", ""),
            ("2021-11-28-11-49-04-264.jpg", "바게트를 곁들인 감바스", "Gambas al ajillo served with baguette", "다시 만든 감바스.", "Made again."),
        ],
    },
    {
        "slug": "guacamole", "date": "2021-10-22",
        "ko": ("과카몰리", "아보카도로 과카몰리를 여러 번 만들어봤다."),
        "en": ("Guacamole", "I tried making guacamole several times."),
        "images": [
            ("2021-10-22-19-54-21-835.jpg", "토마토를 넣은 과카몰리", "Guacamole with tomato", "첫 시도.", "First attempt."),
            ("2022-01-28-20-29-02-770.jpg", "다시 만든 과카몰리", "A later batch of guacamole", "몇 달 뒤 다시 만들었다.", "Made again a few months later."),
        ],
    },
    {
        "slug": "lasagna", "date": "2021-10-24",
        "ko": ("라자냐", "두부를 면처럼 써본 라자냐와 보통 라자냐를 차례로 만들었다."),
        "en": ("Lasagna", "I tried a tofu lasagna first, then made a conventional one."),
        "images": [
            ("2021-10-24-11-25-46-232.jpg", "치즈를 노릇하게 구운 라자냐", "Lasagna baked until the cheese browned", "라자냐.", "Lasagna."),
            ("2021-10-24-11-11-21-094.jpg", "두부를 층층이 올린 라자냐 시도", "An attempt at lasagna layered with tofu", "두부 라자냐 시도.", "An attempt at tofu lasagna."),
        ],
    },
    {
        "slug": "bruschetta", "date": "2021-11-13",
        "ko": ("브루스케타", "구운 바게트에 토마토를 올려 브루스케타를 만들었다."),
        "en": ("Bruschetta", "I made bruschetta by topping toasted baguette with tomato."),
        "images": [
            ("2021-11-13-09-19-54-063.jpg", "토마토를 올린 브루스케타 여러 개", "Several pieces of tomato bruschetta", "", ""),
            ("2021-11-13-09-06-56-543.jpg", "접시에 놓인 브루스케타", "Bruschetta arranged on a plate", "", ""),
        ],
    },
    {
        "slug": "baked-chicken", "date": "2021-11-14", "video": "baked_chicken",
        "ko": ("오븐 치킨", "{video}을 보고 따라 만들었다. 마요네즈 소스도 함께 만들었다."),
        "en": ("Baked Chicken", "I followed {video} and made a mayonnaise sauce to go with it."),
        "images": [
            ("2021-11-14-19-26-07-927.jpg", "오븐에서 구운 닭고기", "Chicken roasted on an oven tray", "", ""),
            ("2021-10-21-19-11-27-451.jpg", "오븐에 넣기 전 양념한 닭고기", "Seasoned chicken before baking", "앞선 시도.", "An earlier attempt."),
            ("2021-11-14-19-30-16-304.jpg", "오븐 치킨에 곁들인 마요네즈 소스", "Mayonnaise sauce served with the baked chicken", "", ""),
        ],
    },
    {
        "slug": "bean-sprout-stir-fry", "date": "2021-11-16",
        "ko": ("숙주 간장볶음", "고기와 숙주를 간장 양념에 볶았다."),
        "en": ("Soy Bean Sprout Stir-fry", "Meat and bean sprouts stir-fried in a soy-based sauce."),
        "images": [("2021-11-16-09-20-14-282.jpg", "고기와 숙주를 볶은 요리", "Meat and bean sprouts stir-fried together", "", "")],
    },
    {
        "slug": "soy-braised-chicken", "date": "2021-11-26",
        "ko": ("닭고기 간장조림", "백종원 레시피로 닭고기와 감자를 간장에 조렸다."),
        "en": ("Soy-braised Chicken", "Chicken and potatoes braised in soy sauce from a Paik Jong-won recipe."),
        "images": [("2021-11-26-09-23-09-460.jpg", "간장에 조린 닭고기와 감자", "Chicken and potatoes braised in soy sauce", "", "")],
    },
    {
        "slug": "french-onion-soup", "date": "2022-01-20", "video": "onion_soup",
        "ko": ("어니언 수프", "{video}를 보고 따라 만들었다. 양파를 오래 볶아 수프를 만들고 바게트와 치즈를 올렸다."),
        "en": ("French Onion Soup", "I followed {video}, slowly cooking the onions before topping the soup with baguette and cheese."),
        "images": [("2022-01-20-18-39-05-111.jpg", "바게트와 치즈를 올린 어니언 수프", "French onion soup topped with baguette and cheese", "", "")],
    },
    {
        "slug": "scallion-chicken-wings", "date": "2022-01-28", "video": "scallion_wings",
        "ko": ("쪽파 닭날개", "{video}을 보고 따라 만들고 쪽파를 듬뿍 올렸다."),
        "en": ("Scallion Chicken Wings", "I followed {video} and covered the wings with scallions."),
        "images": [("2022-01-28-13-02-30-434.jpg", "쪽파를 듬뿍 올린 닭날개 간장조림", "Soy-braised chicken wings covered with scallions", "", "")],
    },
    {
        "slug": "sandwiches", "date": "2022-02-13",
        "ko": ("샌드위치", "한꺼번에 여러 개 만들어 둔 샌드위치."),
        "en": ("Sandwiches", "A batch of sandwiches made all at once."),
        "images": [("2022-02-13-11-36-24-047.jpg", "여러 조각으로 자른 샌드위치", "A batch of sandwiches cut into pieces", "", "")],
    },
    {
        "slug": "braised-potatoes", "date": "2022-02-23",
        "ko": ("감자조림", "감자를 간장 양념에 졸였다."),
        "en": ("Braised Potatoes", "Potatoes braised in a soy-based sauce."),
        "images": [("2022-02-23-09-14-02-979.jpg", "간장 양념에 졸인 감자", "Potatoes braised in soy sauce", "", "")],
    },
    {
        "slug": "steak-rice-bowl", "date": "2022-03-26",
        "ko": ("스테이크 덮밥", "스테이크와 계란을 밥 위에 올린 덮밥."),
        "en": ("Steak Rice Bowl", "A rice bowl topped with steak and an egg."),
        "images": [("2022-03-26-12-13-31-464.jpg", "스테이크와 계란을 올린 덮밥", "A rice bowl topped with steak and an egg", "", "")],
    },
    {
        "slug": "bulgogi-pasta", "date": "2022-11-20",
        "ko": ("불고기 파스타", "강식당의 강호동 불고기 파스타를 따라 만들었다."),
        "en": ("Bulgogi Pasta", "I recreated Kang's Kitchen's bulgogi pasta."),
        "images": [("20221120_105316.jpg", "불고기와 면을 함께 볶은 파스타", "Pasta tossed with bulgogi", "", "")],
    },
]


def quoted(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def date_labels(date: str) -> tuple[str, str, str, str]:
    year, month, day = (int(part) for part in date.split("-"))
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{year}. {month}. {day}.", f"{day} {months[month - 1]} {year}", f"{month}. {day}.", f"{day} {months[month - 1]}"


def export_image(source: Path, destination: Path) -> tuple[int, int]:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=82, method=6, exif=b"")
        return image.width, image.height


def render_page(entry: dict, lang: str, media: list[dict]) -> str:
    heading, body = entry[lang]
    description = body
    if entry.get("video"):
        url, ko_label, en_label = VIDEOS[entry["video"]]
        label = ko_label if lang == "ko" else en_label
        description = description.replace("{video}", label)
        body = body.replace("{video}", f"[{label}]({url})")
    ko_display, en_display, ko_index, en_index = date_labels(entry["date"])
    display = entry.get("display_date", ko_display if lang == "ko" else en_display)
    index_date = ko_index if lang == "ko" else en_index
    prefix = "/ko" if lang == "ko" else ""
    other_prefix = "" if lang == "ko" else "/ko"
    lead = media[0]
    lines = [
        "---",
        "layout: kitchen",
        f"title: {quoted(heading + ' — Jaehyun Ha')}",
        f"heading: {quoted(heading)}",
        f"permalink: {prefix}/kitchen/{entry['slug']}/",
        f"lang: {lang}",
        f"alternate_url: {other_prefix}/kitchen/{entry['slug']}/",
        "body_class: kitchen",
        f"date: {entry['date']}",
        f"display_date: {quoted(display)}",
        f"index_date: {quoted(index_date)}",
        f"annotation_id: {quoted('kitchen-' + entry['slug'] + '-' + lang)}",
        'annotation_revision: "2026-08-02"',
        f"description: {quoted(description)}",
        f"image: {quoted(lead['url'])}",
        f"image_width: {lead['width']}",
        f"image_height: {lead['height']}",
        f"image_alt: {quoted(lead['alt_' + lang])}",
    ]
    if len(media) > 1:
        lines.append("story:")
        for item in media[1:]:
            lines.extend([
                f"  - image: {quoted(item['url'])}",
                f"    width: {item['width']}",
                f"    height: {item['height']}",
                f"    alt: {quoted(item['alt_' + lang])}",
            ])
            caption = item["caption_" + lang]
            if caption:
                lines.append(f"    text: {quoted(caption)}")
    lines.extend(["---", "", body, ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="foodie-import-") as temp_dir:
        temp = Path(temp_dir)
        with zipfile.ZipFile(args.archive) as archive:
            archive.extractall(temp)
        files = {path.name: path for path in temp.rglob("*") if path.is_file()}

        for entry in ENTRIES:
            asset_dir = ROOT / "assets" / "images" / "kitchen" / entry["slug"]
            if asset_dir.exists():
                shutil.rmtree(asset_dir)
            media = []
            for index, image in enumerate(entry["images"]):
                filename, alt_ko, alt_en, caption_ko, caption_en = image
                source = files.get(filename)
                if source is None:
                    raise FileNotFoundError(filename)
                output_name = "lead.webp" if index == 0 else f"{index + 1:02}.webp"
                destination = asset_dir / output_name
                width, height = export_image(source, destination)
                media.append({
                    "url": f"/assets/images/kitchen/{entry['slug']}/{output_name}",
                    "width": width, "height": height,
                    "alt_ko": alt_ko, "alt_en": alt_en,
                    "caption_ko": caption_ko, "caption_en": caption_en,
                })

            for lang, folder in (("ko", ROOT / "ko" / "kitchen"), ("en", ROOT / "kitchen")):
                folder.mkdir(parents=True, exist_ok=True)
                (folder / f"{entry['slug']}.md").write_text(render_page(entry, lang, media), encoding="utf-8")


if __name__ == "__main__":
    main()
