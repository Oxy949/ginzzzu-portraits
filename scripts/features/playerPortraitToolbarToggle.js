// playerPortraitNearChatButton.js
import { MODULE_ID, FLAG_PORTRAIT_SHOWN } from "../core/constants.js";

function getLinkedCharacter() {
  return game.user?.character ?? null;
}

function isShown(actor) {
  return !!foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);
}

async function toggleMyPortrait() {
  const actor = getLinkedCharacter();
  if (!actor) {
    ui.notifications?.warn?.("No linked character assigned to your user.");
    return;
  }
  if (!(game.user?.isGM || actor.isOwner)) {
    ui.notifications?.warn?.("You don’t have permission to control this character.");
    return;
  }

  const next = !isShown(actor);
  await actor.update({ [FLAG_PORTRAIT_SHOWN]: next });
}

function upsertButton() {
  // world setting gate
  let enabled = true;
  try { enabled = !!game.settings.get(MODULE_ID, "playerPortraitToolbarButton"); } catch (_) {}
  if (!enabled) return;

  // players only (как ты просил)
  if (game.user?.isGM) return;

  // Ищем уже существующую кнопку "глаз" (она создаётся в portraits.js)
  const eyeBtn = document.getElementById("ginzzzu-portrait-ui-toggle-btn");
  if (!eyeBtn) return;

  // Не дублируем
  if (document.getElementById("ginzzzu-player-portrait-toggle-btn")) return;

  // Создаём кнопку
  const btn = document.createElement("button");
  btn.id = "ginzzzu-player-portrait-toggle-btn";
  btn.className = "ginzzzu-portrait-btn ginzzzu-player-portrait-btn";
  btn.style.pointerEvents = "auto";
  btn.innerHTML = '<i class="fas fa-theater-masks" aria-hidden="true"></i>';

  const actor = getLinkedCharacter();
  const active = actor ? isShown(actor) : false;

  // Tooltip (без новых переводов, раз ты сейчас не добавляешь их)
  btn.title = game.i18n.localize(active ? "GINZZZUPORTRAITS.playerHidePortrait": "GINZZZUPORTRAITS.playerShowPortrait");
  btn.setAttribute("aria-pressed", active ? "true" : "false");

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    await toggleMyPortrait();

    // обновим pressed/tooltip
    const a = getLinkedCharacter();
    const now = a ? isShown(a) : false;
    btn.setAttribute("aria-pressed", now ? "true" : "false");
    btn.title = game.i18n.localize(now ? "GINZZZUPORTRAITS.playerHidePortrait": "GINZZZUPORTRAITS.playerShowPortrait");
    btn.classList.toggle("active", now);
  });

  // Вставляем рядом с глазом
  eyeBtn.insertAdjacentElement("afterend", btn);
}

Hooks.once("ready", () => {
  // Портретный HUD может создаться не мгновенно; сделаем несколько попыток
  // (без таймеров в фоне — просто короткая серия)
  let tries = 0;
  const tick = () => {
    tries += 1;
    upsertButton();
    if (!document.getElementById("ginzzzu-player-portrait-toggle-btn") && tries < 20) {
      setTimeout(tick, 150);
    }
  };
  tick();
});
