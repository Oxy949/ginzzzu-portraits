// features/portraitConfig.js
import { MODULE_ID, FLAG_DISPLAY_NAME } from "../core/constants.js";

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

  const content = `
    <form class="ginzzzu-portrait-config">
      <div class="form-group">
        <label>${label}</label>
        <input type="text" name="displayName" value="${safeValue}" placeholder="${placeholder}">
        <p class="notes">
          ${notes}
        </p>
      </div>
    </form>`;

  return new Promise((resolve) => {
    new Dialog({
      title,
      content,
      buttons: {
        clear: {
          icon: '<i class="fas fa-eraser"></i>',
          label: game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.clear"),
          callback: async () => {
            await actor.unsetFlag(MODULE_ID, "displayName");
            resolve();
          }
        },
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: game.i18n.localize("GINZZZUPORTRAITS.PortraitConfig.save"),
          callback: async (html) => {
            const input = html.find('input[name="displayName"]').val();
            const value = String(input ?? "").trim(); // пробелы считаем пустым именем

            if (!value) {
              await actor.unsetFlag(MODULE_ID, "displayName");
            } else {
              await actor.setFlag(MODULE_ID, "displayName", value);
            }
            resolve();
          }
        }
      },
      default: "save",
      close: () => resolve()
    }).render(true);
  });
}
