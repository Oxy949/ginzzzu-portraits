# ThreeO Portraits & NPC Dock (Module)
Системо-независимый модуль Foundry VTT, создающий HUD портретов активных актёров и док с NPC.

## Установка
1. Распакуйте архив в папку **Data/modules/ginzzzu-portraits** (создайте папку, если её нет).
2. Убедитесь, что структура выглядит так:
   - modules/ginzzzu-portraits/module.json
   - modules/ginzzzu-portraits/scripts/settings.js
   - modules/ginzzzu-portraits/scripts/threeO-portraits.js
   - modules/ginzzzu-portraits/scripts/threeO-npc-dock.js
3. Включите модуль в настройках мира.

## Использование
- Открытие/скрытие портретов: ПКМ по актёру в **Actor Directory** → «Портрет: показать/скрыть», либо кнопка в **Token HUD** (иконка изображения).
- Панель NPC: для GM автоматически появляется внизу экрана; включает фильтр по папкам актёров и поиск.
- Глобальные функции (для макросов):
  ```js
  // Переключить портрет выбранного токена
  const a = canvas.tokens.controlled[0]?.actor; if (a) await ThreeOPortraits.togglePortrait(a);
  // Спрятать все локальные портреты
  ThreeOPortraits.closeAllLocalPortraits();
  // Показать/скрыть док вручную
  ThreeONPCDock.show(); ThreeONPCDock.hide(); ThreeONPCDock.rebuild();
  ```

## Настройки
- **Длительность плавного появления/движения**, **Тип easing** (мир/World).
- **Подстройка под темноту сцены** и **Сила подстройки** (клиент/Client).
Все настройки находятся в пространстве имён **ginzzzu-threeO**.

## Совместимость
- Модуль ID: `ginzzzu-portraits`; пространство настроек/флагов: `ginzzzu-threeO` (совместимо с прежними флагами актёров).
- Требуемая версия Foundry: V10+.

## Автор
Адаптация из предоставленных файлов пользователя.


## Где найти настройки
Откройте **Configure Settings → Module Settings → ginzzzu-portraits**.

### Ключи
- **portraitFadeMs** (World)
- **portraitMoveMs** (World)
- **portraitEasing** (World)
- **npcDockFolder** (Client)
- **npcDockSearch** (Client)
- **npcDockSort** (Client)

### Миграция
При первом запуске модуль попробует перенести значения из:
- старого пространства `ginzzzu-threeO`
- пространства текущей системы (`game.system.id`)
в новое пространство `ginzzzu-portraits`.


### Новые настройки (для совместимости с любыми системами)
- **pcActorTypes** (World): CSV-список типов актёров, считающихся игроками (напр. `character, pc, hero, player`).
- **npcActorTypes** (World): CSV-список типов актёров, считающихся NPC (напр. `npc, adversary, creature, monster, minion`).

> Оставьте поле пустым, чтобы не фильтровать по типам вовсе.
