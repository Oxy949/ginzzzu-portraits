// features/portraitConfig.js
import { MODULE_ID, FLAG_DISPLAY_NAME, FLAG_CUSTOM_EMOTIONS, EMOTION_MOTIONS, EMOTION_COLORS } from "../core/constants.js";
import { getCustomEmotions } from "./custom-emotions.js";

const PORTRAIT_CONFIG_TEMPLATE = `modules/${MODULE_ID}/templates/portrait-config.hbs`;
const PORTRAIT_EMOTION_TEMPLATE = `modules/${MODULE_ID}/templates/portrait-config-emotion-item.hbs`;


const isGM = () => !!game.user?.isGM;

/**
 * Окно конфигурации портрета для конкретного актёра.
 * Вариант с нормальным шаблоном и ресайзящимся диалогом.
 */
export async function configurePortrait(ev, actorSheet) {
  if (!isGM()) return;
  ev?.preventDefault?.();

  const actor = actorSheet?.actor ?? actorSheet?.document ?? actorSheet;
  if (!actor) {
    console.warn("[threeO-portraits] configurePortrait: actor not found", actorSheet);
    return;
  }

  // Текущее кастомное имя из флага
  const currentRaw  = foundry.utils.getProperty(actor, FLAG_DISPLAY_NAME);
  const currentName = typeof currentRaw === "string" ? currentRaw : "";

  const label = game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.label");
  const notes = game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.note");
  const title = game.i18n.format("GINZZZUPORTRAITS.PortraitConfig.title", { name: actor.name });

  // Per-actor option: show/hide standard emotions in toolbar (default: true)
  const showStandardRaw      = actor.getFlag(MODULE_ID, "showStandardEmotions");
  const showStandardEmotions = (showStandardRaw !== false); // undefined / true -> показываем

  // Текущие кастомные эмоции
  const customEmotions = getCustomEmotions(actor) ?? [];
  console.log(`[${MODULE_ID}] Loaded ${customEmotions.length} custom emotions for actor ${actor.name}:`, customEmotions);

  // Варианты цветкора – сначала пробуем спросить у GinzzzuPortraitEmotions,
  // при неудаче откатываемся к своим пресетам.
  const emotionApi = globalThis.GinzzzuPortraitEmotions;
  let colorPresetOptions = [];
  try {
    if (emotionApi?.getStandardEmotionColorOptions) {
      colorPresetOptions = emotionApi.getStandardEmotionColorOptions();
    }
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to get standard emotion color options`, e);
  }
  if (!Array.isArray(colorPresetOptions) || colorPresetOptions.length === 0) {
    colorPresetOptions = Object.values(EMOTION_COLORS ?? {});
  }

  const motionOptions = Object.values(EMOTION_MOTIONS ?? {});
  const colorOptions  = colorPresetOptions;

  const templateData = {
    MODULE_ID,

    // Текст
    label,
    notes,
    customEmotionsLabel: game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.customEmotionsLabel"),
    showStandardLabel:   game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.showStandardEmotions"),
    addEmotionLabel:     game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.addEmotion"),

    // Поля
    displayName: currentName,
    placeholder: actor.name ?? "",
    showStandardEmotions,

    // Списки
    emotions: customEmotions,
    motions:  motionOptions,
    colors:   colorOptions
  };


  // Рендерим нормальный шаблон
  const content = await renderTemplate(PORTRAIT_CONFIG_TEMPLATE, templateData);

  // Диалог с изменяемой шириной (адаптируется к окну и ресайзится мышкой)
  const viewportWidth = window.innerWidth || 960;
  const dialogWidth   = Math.max(480, Math.min(viewportWidth - 200, 900));

  return new Promise((resolve) => {
    let isResolved = false;

    const dialog = new Dialog({
      title,
      content,
      buttons: {
        clear: {
          icon: '<i class="fas fa-eraser"></i>',
          label: game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.clear"),
          callback: async () => {
            if (isResolved) return;
            isResolved = true;
            console.log(`[${MODULE_ID}] Clearing portrait display name for ${actor.name}`);
            await actor.unsetFlag(MODULE_ID, "displayName");
            resolve();
          }
        },
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.save"),
          callback: async (html) => {
            if (isResolved) return;
            isResolved = true;

            try {
              console.log(`[${MODULE_ID}] Saving portrait config for ${actor.name}`);

              // Save display name
              const input = html.find('input[name="displayName"]').val();
              const value = String(input ?? "").trim();

              if (!value) {
                await actor.unsetFlag(MODULE_ID, "displayName");
              } else {
                await actor.setFlag(MODULE_ID, "displayName", value);
              }

              // Save "show standard emotions" toggle (default true)
              const showStd = html.find('input[name="showStandardEmotions"]').is(':checked');
              await actor.setFlag(MODULE_ID, "showStandardEmotions", !!showStd);

              // Save custom emotions
              const emotionItems = html.find('.ginzzzu-emotion-item');
              const emotions = [];

              emotionItems.each((idx, elem) => {
                const $elem          = $(elem);
                const emoji          = String($elem.find('input.emotion-emoji').val() ?? "").trim();
                const name           = String($elem.find('input.emotion-name').val() ?? "").trim();
                const imagePath      = String($elem.find('input.emotion-path').val() ?? "").trim();
                const animation      = String($elem.find('select.emotion-animation').val() ?? "none");
                const colorIntensity = String($elem.find('select.emotion-color').val() ?? "high");

                console.log(
                  `[${MODULE_ID}] Emotion ${idx}:`,
                  { emoji, name, imagePath, animation, colorIntensity }
                );

                // Принимаем эмоцию, если заполнено хоть что-то осмысленное
                const hasAny =
                  emoji.length > 0 ||
                  name.length > 0 ||
                  imagePath.length > 0;

                if (hasAny) {
                  emotions.push({ emoji, name, imagePath, animation, colorIntensity });
                } else {
                  console.log(`[${MODULE_ID}] Ignoring empty emotion at index ${idx}`);
                }
              });

              console.log(
                `[${MODULE_ID}] Saving ${emotions.length} emotions for actor ${actor.name}:`,
                emotions
              );

              if (emotions.length > 0) {
                console.log(`[${MODULE_ID}] Calling setFlag with customEmotions`);
                await actor.update({ [FLAG_CUSTOM_EMOTIONS]: emotions });
                console.log(
                  `[${MODULE_ID}] Successfully saved ${emotions.length} custom emotions`
                );
              } else {
                console.log(
                  `[${MODULE_ID}] Clearing customEmotions flag (no emotions)`
                );
                await actor.update({ [FLAG_CUSTOM_EMOTIONS]: [] });
              }

              console.log(
                `[${MODULE_ID}] Portrait config saved successfully for ${actor.name}`
              );
            } catch (err) {
              console.error(
                `[${MODULE_ID}] Failed to save portrait config for ${actor.name}`,
                err
              );
              ui.notifications?.error?.(
                game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.saveError")
                  ?? "Failed to save portrait config"
              );
            }

            resolve();
          }
        }
      },
      default: "save",
      close: () => {
        if (!isResolved) {
          isResolved = true;
          console.log(`[${MODULE_ID}] Dialog closed without saving`);
          resolve();
        }
      },
      render: (html) => {
        // Хэндлер удаления эмоции
        const removeEmotionHandler = (e) => {
          e.preventDefault();
          $(e.currentTarget).closest('.ginzzzu-emotion-item').remove();
        };

        // Повесить обработчик удаления на указанный корень
        const bindRemoveHandlers = (root) => {
          root.find('.emotion-remove-btn')
            .off('click.ginzzzuRemoveEmotion')
            .on('click.ginzzzuRemoveEmotion', removeEmotionHandler);
        };

        // === НОВОЕ: выбор изображения через FilePicker ===
        const bindFilePickers = (root) => {
          root.find('.emotion-path-picker')
            .off('click.ginzzzuEmotionFile')
            .on('click.ginzzzuEmotionFile', async (e) => {
              e.preventDefault();

              const $btn   = $(e.currentTarget);
              const $item  = $btn.closest('.ginzzzu-emotion-item');
              const $input = $item.find('.emotion-path');

              if ($input.length === 0) return;

              const current = $input.val() || "";

              const fp = new FilePicker({
                type: "image",
                current,
                callback: (path) => {
                  $input.val(path);
                  // чтобы твоя логика сохранения на change тоже отработала
                  $input.trigger("change");
                }
              });

              fp.render(true);
            });
        };

        // Уже отрендеренные эмоции
        bindRemoveHandlers(html);
        bindFilePickers(html);

        // Кнопка добавления эмоции — рендерит Handlebars-шаблон
        html.find('.emotion-add-btn').on('click', async (e) => {
          e.preventDefault();

          const emotionsList = html.find('.emotions-list');
          const newIndex     = emotionsList.find('.ginzzzu-emotion-item').length;

          const emotion = {
            emoji: "",
            name: "",
            imagePath: "",
            animation: "none",
            colorIntensity: "high"
          };

          const newEmotionHtml = await renderTemplate(PORTRAIT_EMOTION_TEMPLATE, {
            emotion,
            idx: newIndex,
            motions: motionOptions,
            colors: colorOptions
          });

          const $item = $(newEmotionHtml);
          emotionsList.append($item);
          bindRemoveHandlers($item);
          bindFilePickers($item); // <-- важно для новых элементов
        });
      }

    }, {
      width: dialogWidth,
      resizable: true
    });

    dialog.render(true);
  });
}

Hooks.once("init", async () => {
  await loadTemplates([
    `modules/${MODULE_ID}/templates/portrait-config-emotion-item.hbs`
  ]);
});