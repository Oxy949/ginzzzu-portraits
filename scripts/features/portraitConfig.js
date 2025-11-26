// features/portraitConfig.js
import { MODULE_ID, FLAG_DISPLAY_NAME, EMOTION_MOTIONS, EMOTION_COLORS } from "../core/constants.js";
import { getCustomEmotions } from "./customEmotions.js";

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
    if (!Array.isArray(colorPresetOptions) || colorPresetOptions.length === 0) {
      // fallback: старое поведение
      colorPresetOptions = COLOR_INTENSITY_OPTIONS.map(c => ({ key: c.key, label: c.label }));
    }
    const colorOptions = colorPresetOptions.map(color => 
      `<option value="${color.key}" ${emotion.colorIntensity === color.key ? 'selected' : ''}>${color.label}</option>`
    ).join('');

    emotionListHTML += `
      <div class="ginzzzu-emotion-item" data-emotion-index="${idx}">
        <div class="emotion-row">
          <div class="form-group emotion-emoji-group">
            <label>Emoji</label>
            <input type="text" class="emotion-emoji" value="${safeEmoji}" maxlength="10" placeholder="😊">
          </div>
          <div class="form-group emotion-name">
            <label>Name</label>
            <input type="text" class="emotion-name" value="${safeName}" maxlength="50" placeholder="Name">
          </div>
        </div>
        <div class="emotion-row">
          <div class="form-group emotion-path">
            <label>Image Path</label>
            <input type="text" class="emotion-path" value="${safePath}" placeholder="path/to/image.png">
          </div>
        </div>
        <div class="emotion-row emotion-controls">
          <div class="form-group">
            <label>Animation</label>
            <select class="emotion-animation">${animOptions}</select>
          </div>
          <div class="form-group">
            <label>Color Intensity</label>
            <select class="emotion-color">${colorOptions}</select>
          </div>
          <button type="button" class="emotion-remove-btn" data-index="${idx}">
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

    <style>
      .ginzzzu-portrait-config {
        display: flex;
        flex-direction: column;
      }

      .ginzzzu-portrait-config .display-name-section {
        margin-bottom: 0;
      }

      .ginzzzu-portrait-config .emotions-section {
        margin-top: 10px;
        padding: 15px;
        background: rgba(0, 0, 0, 0.1);
        border-radius: 4px;
      }

      .ginzzzu-portrait-config .emotions-list {
        margin: 0 0 15px 0;
        max-height: 400px;
        overflow-y: auto;
        padding-right: 5px;
      }

      .ginzzzu-portrait-config .emotions-list::-webkit-scrollbar {
        width: 6px;
      }

      .ginzzzu-portrait-config .emotions-list::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 3px;
      }

      .ginzzzu-portrait-config .emotions-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
      }

      .ginzzzu-portrait-config .emotions-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
      }

      .ginzzzu-portrait-config .ginzzzu-emotion-item {
        background: rgba(0, 0, 0, 0.3);
        padding: 12px;
        margin-bottom: 12px;
        border-radius: 4px;
        border-left: 3px solid #6ba8db;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .ginzzzu-portrait-config .ginzzzu-emotion-item:last-child {
        margin-bottom: 0;
      }

      .ginzzzu-portrait-config .emotion-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        width: 100%;
        flex-wrap: wrap;
      }

      .ginzzzu-portrait-config .emotion-row:last-child {
        align-items: flex-end;
      }

      .ginzzzu-portrait-config .emotion-row .form-group {
        flex: 1;
        margin: 0;
        min-width: 120px;
      }

      .ginzzzu-portrait-config .emotion-row .form-group label {
        display: block;
        font-size: 0.8em;
        margin-bottom: 4px;
        color: #ccc;
        font-weight: 500;
      }

      .ginzzzu-portrait-config .emotion-row input,
      .ginzzzu-portrait-config .emotion-row select {
        width: 100%;
        padding: 6px;
        font-size: 0.9em;
        border: 1px solid #555;
        background: rgba(0, 0, 0, 0.3);
        color: #fff;
        border-radius: 3px;
        box-sizing: border-box;
      }

      .ginzzzu-portrait-config .emotion-row input:focus,
      .ginzzzu-portrait-config .emotion-row select:focus {
        outline: none;
        border-color: #6ba8db;
        background: rgba(0, 0, 0, 0.5);
      }

      .ginzzzu-portrait-config .emotion-emoji-group {
        flex: 0 0 auto;
      }

      .ginzzzu-portrait-config .emotion-emoji {
        max-width: 70px !important;
      }

      .ginzzzu-portrait-config .emotion-name {
        flex: 1;
        min-width: 150px;
      }

      .ginzzzu-portrait-config .emotion-path {
        flex: 1 1 100%;
      }

      .ginzzzu-portrait-config .emotion-controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .ginzzzu-portrait-config .emotion-animation,
      .ginzzzu-portrait-config .emotion-color {
        flex: 1;
        min-width: 140px;
      }

      .emotion-remove-btn {
        background: #cc4125 !important;
        border: none !important;
        color: white;
        padding: 6px 10px !important;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.9em;
        flex-shrink: 0;
        white-space: nowrap;
      }

      .emotion-remove-btn:hover {
        background: #a63520 !important;
      }

      .emotion-add-btn {
        background: #2d5016 !important;
        border: 1px solid #4a7c20 !important;
        color: white;
        padding: 10px 16px;
        border-radius: 4px;
        cursor: pointer;
        width: 100%;
        font-size: 0.95em;
        font-weight: 500;
      }

      .emotion-add-btn:hover {
        background: #3a9c2d !important;
      }
    </style>`;

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
