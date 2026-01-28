// tokenHudPortraitToggle.js
import { MODULE_ID, FLAG_PORTRAIT_SHOWN } from "../core/constants.js";

function getWorldActorFromToken(token) {
  const actorId = token?.document?.actorId ?? token?.actor?.id;
  return actorId ? (game.actors?.get(actorId) ?? token?.actor ?? null) : (token?.actor ?? null);
}

function canToggleForActor(actor) {
  if (!actor) return false;

  // По умолчанию — как у тебя сейчас: только GM (потому что togglePortrait у тебя GM-гейтит)
  // Но чтобы не зависеть от внутренней проверки, продублируем:
  if (game.user?.isGM) return true;

  // Если захочешь разрешить владельцам — раскомментируй:
  // return actor.isOwner;

  return false;
}

function isPortraitShown(actor) {
  try {
    return !!foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);
  } catch {
    return false;
  }
}

function ensureButton(hud, html) {
  // не дублируем кнопку при повторных рендерах
  if (html[0]?.querySelector?.(".ginzzzu-tokenhud-portrait")) return;

  const token = hud.object;               // Token (PlaceableObject)
  const actor = getWorldActorFromToken(token);
  if (!actor) return;
  if (!canToggleForActor(actor)) return;

  const shown = isPortraitShown(actor);

  const titleKey = shown
    ? "GINZZZUPORTRAITS.tokenHUDHidePortrait"
    : "GINZZZUPORTRAITS.tokenHUDShowPortrait";

  const $btn = $(`
    <div class="control-icon ginzzzu-tokenhud-portrait ${shown ? "active" : ""}" role="button">
      <i class="fas fa-theater-masks"></i>
    </div>
  `);

  $btn.attr("title", game.i18n.localize(titleKey));

  $btn.on("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

  const a = getWorldActorFromToken(token);
    if (!a) return;

    // Переключаем портрет актёра (вариант A)
    await globalThis.GinzzzuPortraits?.togglePortrait?.(a);
    globalThis.GinzzzuNPCDock?.rebuildMini?.();


    // Обновим tooltip/active (быстро, без ожидания хуков)
    const nowShown = isPortraitShown(a);
    $btn.toggleClass("active", nowShown);
    $btn.attr("title", game.i18n.localize(
      nowShown ? "GINZZZUPORTRAITS.tokenHUDHidePortrait" : "GINZZZUPORTRAITS.tokenHUDShowPortrait"
    ));
  });

  // Куда вставлять:
  // Обычно справа — рядом с шестерёнкой/эффектами, но можно и слева.
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;

    const rightCol = root.querySelector(".col.right");
    if (rightCol) rightCol.prepend($btn[0]);
    else root.append($btn[0]);
}

export function registerTokenHudPortraitToggle() {
  Hooks.on("renderTokenHUD", (hud, html) => {
    try {
      ensureButton(hud, html);
    } catch (e) {
      console.error(`[${MODULE_ID}] TokenHUD portrait toggle failed`, e);
    }
  });
}

Hooks.once("ready", () => {
  registerTokenHudPortraitToggle();
});
