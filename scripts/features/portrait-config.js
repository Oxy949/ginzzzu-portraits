// features/portraitConfig.js
import { MODULE_ID, FLAG_DISPLAY_NAME, EMOTION_MOTIONS, EMOTION_COLORS } from "../core/constants.js";
import { getCustomEmotions } from "./custom-emotions.js";

const isGM = () => !!game.user?.isGM;

/**
 * Окно конфигурации портрета для конкретного актёра.
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

  const safeValue   = currentName.replace(/"/g, "&quot;");
  const placeholder = (actor.name ?? "").replace(/"/g, "&quot;");

  const label = game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.label");
  const notes = game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.note");
  const title = game.i18n.format("GINZZZUPORTRAITS.PortraitConfig.title", { name: actor.name });

    // Per-actor option: show/hide standard emotions in toolbar (default: true)
  const showStandardRaw = actor.getFlag(MODULE_ID, "showStandardEmotions");
  const showStandardEffective = (showStandardRaw !== false); // undefined / true -> показываем
  const showStandardCheckedAttr = showStandardEffective ? "checked" : "";

  // Get custom emotions
  const customEmotions = getCustomEmotions(actor);
  console.log(`[${MODULE_ID}] Loaded ${customEmotions.length} custom emotions for actor ${actor.name}:`, customEmotions);

  // Build emotion list HTML
  let emotionListHTML = '';
  customEmotions.forEach((emotion, idx) => {
    const safeEmoji = (emotion.emoji ?? "").replace(/"/g, "&quot;");
    const safeName = (emotion.name ?? "").replace(/"/g, "&quot;");
    const safePath = (emotion.imagePath ?? "").replace(/"/g, "&quot;");
    
    const animOptions = Object.values(EMOTION_MOTIONS).map(anim => 
      `<option value="${anim.key}" ${emotion.animation === anim.key ? 'selected' : ''}>${anim.label}</option>`
    ).join('');
    
    // Варианты цветкора теперь завязаны на стандартные эмоции.
    // Пытаемся спросить их у GinzzzuPortraitEmotions, а при провале
    // откатываемся к старым пресетам интенсивности.
    const emotionApi = globalThis.GinzzzuPortraitEmotions;
    let colorPresetOptions = [];
    try {
      if (emotionApi?.getStandardEmotionColorOptions) {
        colorPresetOptions = emotionApi.getStandardEmotionColorOptions();
      }
    } catch (e) {
      console.error(`[${MODULE_ID}] Failed to get standard emotion color options`, e);
    }
    const colorOptions = colorPresetOptions.map(color => 
      `<option value="${color.key}" ${emotion.colorIntensity === color.key ? 'selected' : ''}>${color.label}</option>`
    ).join('');

    emotionListHTML += `
      <div class="ginzzzu-emotion-item" data-emotion-index="${idx}">
        <!-- Первая строка: эмодзи + имя + путь к картинке -->
        <div class="emotion-row emotion-main">
          <div class="form-group emotion-emoji-group">
            <label>Emoji</label>
            <input
              type="text"
              class="emotion-emoji"
              value="${safeEmoji}"
              maxlength="10"
              placeholder="😊">
          </div>

          <div class="form-group emotion-name">
            <label>Name</label>
            <input
              type="text"
              class="emotion-name"
              value="${safeName}"
              maxlength="50"
              placeholder="Name">
          </div>

          <div class="form-group emotion-path">
            <label>Image Path</label>
            <input
              type="text"
              class="emotion-path"
              value="${safePath}"
              placeholder="path/to/image.png">
          </div>
        </div>

        <!-- Вторая строка: анимация + цвет + удалить -->
        <div class="emotion-row emotion-controls">
          <div class="form-group">
            <label>Animation</label>
            <select class="emotion-animation">${animOptions}</select>
          </div>

          <div class="form-group">
            <label>Color Intensity</label>
            <select class="emotion-color">${colorOptions}</select>
          </div>

          <button
            type="button"
            class="emotion-remove-btn"
            data-index="${idx}">
            <i class="fas fa-trash"></i> Remove
          </button>
        </div>
      </div>
    `;
  });

  const content = `
    <form class="ginzzzu-portrait-config">
      <div class="form-group display-name-section">
        <label>${label}</label>
        <input type="text" name="displayName" value="${safeValue}" placeholder="${placeholder}">
        <p class="notes">
          ${notes}
        </p>
      </div>

      <hr style="margin: 20px 0; border: none; border-top: 1px solid #666;">

      <div class="emotions-section">
        <h3 style="margin: 0 0 15px 0; font-size: 1.1em;">${game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.customEmotionsLabel")}</h3>
        <div class="form-group emotion-show-standard" style="margin-bottom: 10px;">
          <label style="display: flex; align-items: center; gap: 0.4em;">
            <input type="checkbox" name="showStandardEmotions" value="1" ${showStandardCheckedAttr}>
            ${game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.showStandardEmotions")}
          </label>
        </div>

        <div class="emotions-list">
          ${emotionListHTML}
        </div>
        <button type="button" class="emotion-add-btn">
          <i class="fas fa-plus"></i> ${game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.addEmotion")}
        </button>
      </div>
    </form>
  `;

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
                const $elem = $(elem);
                const emoji = $elem.find('input.emotion-emoji').val()?.trim() || '';
                const name = $elem.find('input.emotion-name').val()?.trim() || '';
                const imagePath = $elem.find('input.emotion-path').val()?.trim() || '';
                const animation = $elem.find('select.emotion-animation').val() || 'none';
                const colorIntensity = $elem.find('select.emotion-color').val() || 'high';

                console.log(`[${MODULE_ID}] Emotion ${idx}:`, { emoji, name, imagePath, animation, colorIntensity });

                // Accept an emotion when at least one meaningful field is provided
                const hasAny = (String(emoji).trim().length > 0) || (String(name).trim().length > 0) || (String(imagePath).trim().length > 0);
                if (hasAny) {
                  emotions.push({ emoji, name, imagePath, animation, colorIntensity });
                } else {
                  console.log(`[${MODULE_ID}] Ignoring empty emotion at index ${idx}`);
                }
              });

              console.log(`[${MODULE_ID}] Saving ${emotions.length} emotions for actor ${actor.name}:`, emotions);

              if (emotions.length > 0) {
                console.log(`[${MODULE_ID}] Calling setFlag with customEmotions`);
                await actor.setFlag(MODULE_ID, "customEmotions", emotions);
                console.log(`[${MODULE_ID}] Successfully saved ${emotions.length} custom emotions`);
              } else {
                console.log(`[${MODULE_ID}] Clearing customEmotions flag (no emotions)`);
                await actor.unsetFlag(MODULE_ID, "customEmotions");
              }

              console.log(`[${MODULE_ID}] Portrait config save complete`);
              resolve();
            } catch (e) {
              console.error(`[${MODULE_ID}] Error saving portrait config:`, e);
              resolve();
            }
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
        // Add emotion button handler
        html.find('.emotion-add-btn').on('click', (e) => {
          e.preventDefault();
          const emotionsList = html.find('.emotions-list');
          const newIndex = html.find('.ginzzzu-emotion-item').length;
          const newEmotionHTML = `
            <div class="ginzzzu-emotion-item" data-emotion-index="${newIndex}">
              <div class="emotion-row">
                <div class="form-group emotion-emoji-group">
                  <label>Emoji</label>
                  <input type="text" class="emotion-emoji" maxlength="10" placeholder="😊">
                </div>
                <div class="form-group emotion-name">
                  <label>Name</label>
                  <input type="text" class="emotion-name" maxlength="50" placeholder="Name">
                </div>
              </div>
              <div class="emotion-row">
                <div class="form-group emotion-path">
                  <label>Image Path</label>
                  <input type="text" class="emotion-path" placeholder="path/to/image.png">
                </div>
              </div>
              <div class="emotion-row emotion-controls">
                <div class="form-group">
                  <label>Animation</label>
                  <select class="emotion-animation">
                    ${Object.values(EMOTION_MOTIONS).map(anim => `<option value="${anim.key}">${anim.label}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>Color Intensity</label>
                  <select class="emotion-color">
                    ${Object.values(EMOTION_COLORS).map(color => `<option value="${color.key}">${color.label}</option>`).join('')}
                  </select>
                </div>
                <button type="button" class="emotion-remove-btn">
                  <i class="fas fa-trash"></i> Remove
                </button>
              </div>
            </div>
          `;
          emotionsList.append(newEmotionHTML);
          
          // Attach remove handler to new button
          emotionsList.find('.ginzzzu-emotion-item:last-child .emotion-remove-btn').on('click', removeEmotionHandler);
        });

        // Remove emotion button handler
        html.find('.emotion-remove-btn').on('click', removeEmotionHandler);

        function removeEmotionHandler(e) {
          e.preventDefault();
          $(e.target).closest('.ginzzzu-emotion-item').remove();
        }
      }
    }).render(true);
  });
}
